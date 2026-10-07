// ============================================================================
// AI Core — EngineMemory + EngineMemoryFacade (M11c, ADR-011, option (a))
//
// AIEngine talks to memory through a PAIRING model, not the per-turn
// observe/recall of MemoryBackend:
//
//   enrich(userId, prompt, context) -> enrichedPrompt   (READ, before inference)
//   record(userId, prompt, response) -> void            (WRITE, after inference)
//
// This file provides an `EngineMemory` seam shaped to those exact call sites,
// plus an `EngineMemoryFacade` that routes between a legacy implementation and
// a new one — mirroring MemoryFacade's dumb, STATELESS, routing-only design.
//
// Modes (reversible FSM): legacy ⇄ dual_write ⇄ shadow ⇄ new.
//  - legacy     : delegates BYTE-IDENTICALLY to ContextManager (zero change).
//  - dual_write : legacy is authoritative; new receives writes best-effort.
//  - shadow     : legacy answers; new runs silently; enriched prompts compared
//                 SEMANTICALLY; an EngineShadowReport is emitted. Never runtime.
//  - new        : new is authoritative.
//
// The facade holds NO state. All observability goes to injected sinks. It knows
// nothing about ContextManager or MemoryService — only two EngineMemory ports.
// See INTEGRATION_MAP.md (option (a)) and ADR-011.
// ============================================================================

import type { ConversationMessage } from '../types';
import type { ContextManager } from './context-manager';
import type { MemoryBackend } from './memory-facade';
import { compareRecalls, type DivergenceSeverity } from './memory-facade';

/**
 * The memory seam AIEngine consumes. A pairing model: read the enriched prompt,
 * then record the completed user↔assistant exchange.
 */
export interface EngineMemory {
  /** Build a context-enriched prompt (read path, before inference). */
  enrich(userId: string, prompt: string, context: ConversationMessage[]): Promise<string>;
  /** Record a completed user↔assistant exchange (write path, after inference). */
  record(userId: string, userMessage: string, assistantResponse: string): Promise<void>;
}

/**
 * Legacy path: delegates directly to ContextManager. In `legacy` mode the
 * facade routes here, making behavior BYTE-IDENTICAL to the pre-facade engine
 * by construction (same method, same args, same order).
 */
export class LegacyEngineMemory implements EngineMemory {
  constructor(private readonly ctx: ContextManager) {}

  async enrich(userId: string, prompt: string, context: ConversationMessage[]): Promise<string> {
    return this.ctx.enrichPrompt(userId, prompt, context);
  }

  async record(userId: string, userMessage: string, assistantResponse: string): Promise<void> {
    await this.ctx.addToHistory(userId, userMessage, assistantResponse);
  }
}

/**
 * New path: adapts the MemoryService/MemoryBackend (observe/recall) to the
 * engine pairing model.
 *  - enrich → recall + assemble recalled contents into a prompt preamble that
 *    mirrors ContextManager's textual shape (so shadow comparison is like-for-like).
 *  - record → observe the user turn, then the assistant turn.
 *
 * NOTE: this is the target for `new` mode. It is NOT wired into AIEngine yet
 * (default is legacy). Its retrieval/assembly quality is validated in M11d on
 * the live path — this class does not tune retrieval or ranking.
 */
export class MemoryServiceEngineMemory implements EngineMemory {
  constructor(
    private readonly backend: MemoryBackend,
    private readonly opts: { defaultSession?: string; recallLimit?: number } = {},
  ) {}

  async enrich(userId: string, prompt: string, context: ConversationMessage[]): Promise<string> {
    const recalled = await this.backend.recall({
      actor: userId,
      query: prompt,
      ...(this.opts.recallLimit !== undefined ? { limit: this.opts.recallLimit } : {}),
    });

    const parts: string[] = [];
    if (recalled.length > 0) {
      parts.push('Relevant context from previous interactions:');
      for (const m of recalled) {
        parts.push(`- ${m.content}`);
      }
      parts.push('');
    }
    if (context.length > 0) {
      for (const msg of context) {
        parts.push(`${msg.role}: ${msg.content}`);
      }
      parts.push('');
    }
    parts.push(`user: ${prompt}`);
    return parts.join('\n');
  }

  async record(userId: string, userMessage: string, assistantResponse: string): Promise<void> {
    const session = this.opts.defaultSession ?? 'engine';
    await this.backend.observe({ actor: userId, session, role: 'user', content: userMessage });
    await this.backend.observe({
      actor: userId,
      session,
      role: 'assistant',
      content: assistantResponse,
    });
  }
}

export type EngineMemoryMode = 'legacy' | 'dual_write' | 'shadow' | 'new';

/** Semantic comparison of a single shadow enrichment (legacy vs new). */
export interface EngineShadowReport {
  requestId: string;
  mode: EngineMemoryMode;
  userId: string;
  query: string;
  legacy: { enriched: string; latencyMs: number };
  next: { enriched: string; latencyMs: number; error?: string };
  divergence: {
    identical: boolean;
    /** Jaccard over normalized recalled-context lines extracted from each prompt. */
    agreementRate: number;
    severity: DivergenceSeverity;
    onlyLegacy: string[];
    onlyNew: string[];
  };
  at: number;
}

export type EngineShadowSink = (report: EngineShadowReport) => void;
export type EngineSecondaryWriteErrorSink = (
  err: unknown,
  info: { userId: string; userMessage: string; assistantResponse: string },
) => void;

export interface EngineMemoryFacadeOptions {
  mode: EngineMemoryMode;
  /** Authoritative during migration; behaves like today. */
  legacy: EngineMemory;
  /** The new subsystem seam. Required for dual_write/shadow/new. */
  next?: EngineMemory;
  /** Observational sink for shadow enrichments (never influences runtime). */
  onShadow?: EngineShadowSink;
  /** Sink for best-effort secondary write failures (dual_write/shadow). */
  onSecondaryWriteError?: EngineSecondaryWriteErrorSink;
  /** Request id generator for shadow reports. */
  requestId?: () => string;
}

/**
 * STATELESS router matching the EngineMemory pairing shape. No caches, queues,
 * metrics state, or heuristics — pure request → route → result. Mode changes
 * happen by constructing a new facade (config), never by mutating this one.
 */
export class EngineMemoryFacade implements EngineMemory {
  private readonly mode: EngineMemoryMode;
  private readonly legacy: EngineMemory;
  private readonly next: EngineMemory | undefined;
  private readonly onShadow: EngineShadowSink | undefined;
  private readonly onSecondaryWriteError: EngineSecondaryWriteErrorSink | undefined;
  private readonly requestId: () => string;

  constructor(opts: EngineMemoryFacadeOptions) {
    if (opts.mode !== 'legacy' && !opts.next) {
      throw new Error(`EngineMemoryFacade mode '${opts.mode}' requires a 'next' EngineMemory.`);
    }
    this.mode = opts.mode;
    this.legacy = opts.legacy;
    this.next = opts.next;
    this.onShadow = opts.onShadow;
    this.onSecondaryWriteError = opts.onSecondaryWriteError;
    this.requestId = opts.requestId ?? (() => `eng_${Date.now().toString(36)}`);
  }

  /** Current mode (read-only). */
  getMode(): EngineMemoryMode {
    return this.mode;
  }

  // ─── Read (enrich) ──────────────────────────────────────────────────────────

  async enrich(userId: string, prompt: string, context: ConversationMessage[]): Promise<string> {
    switch (this.mode) {
      case 'legacy':
      case 'dual_write':
        return this.legacy.enrich(userId, prompt, context);
      case 'new':
        return this.next!.enrich(userId, prompt, context);
      case 'shadow':
        return this.shadowEnrich(userId, prompt, context);
    }
  }

  // ─── Write (record) ─────────────────────────────────────────────────────────

  async record(userId: string, userMessage: string, assistantResponse: string): Promise<void> {
    switch (this.mode) {
      case 'legacy':
        await this.legacy.record(userId, userMessage, assistantResponse);
        return;
      case 'dual_write':
      case 'shadow':
        // Asymmetric: legacy is primary (determines success); new is best-effort.
        await this.legacy.record(userId, userMessage, assistantResponse);
        await this.writeSecondary(userId, userMessage, assistantResponse);
        return;
      case 'new':
        await this.next!.record(userId, userMessage, assistantResponse);
        return;
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────────────

  private async writeSecondary(
    userId: string,
    userMessage: string,
    assistantResponse: string,
  ): Promise<void> {
    try {
      await this.next!.record(userId, userMessage, assistantResponse);
    } catch (err) {
      // Observability is best-effort: a throwing sink must never impact the
      // request (ADR-011 constraint 3 — metrics never affect runtime).
      try {
        this.onSecondaryWriteError?.(err, { userId, userMessage, assistantResponse });
      } catch {
        /* swallow: metrics sink failure cannot fail the request */
      }
    }
  }

  /** Serve LEGACY enrichment; run new silently; compare; emit a report. */
  private async shadowEnrich(
    userId: string,
    prompt: string,
    context: ConversationMessage[],
  ): Promise<string> {
    const lStart = now();
    const legacyEnriched = await this.legacy.enrich(userId, prompt, context);
    const legacyLatency = now() - lStart;

    const nStart = now();
    let nextEnriched = '';
    let nextError: string | undefined;
    try {
      nextEnriched = await this.next!.enrich(userId, prompt, context);
    } catch (err) {
      nextError = err instanceof Error ? err.message : String(err);
    }
    const nextLatency = now() - nStart;

    if (this.onShadow) {
      const legacyLines = contextLines(legacyEnriched);
      const nextLines = contextLines(nextEnriched);
      const { onlyLegacy, onlyNew, agreementRate } = compareRecalls(legacyLines, nextLines);
      const identical = legacyEnriched === nextEnriched;
      const severity: DivergenceSeverity = nextError
        ? 'HIGH'
        : identical
          ? 'LOW'
          : agreementRate >= 0.99
            ? 'LOW'
            : onlyLegacy.length > 0 && agreementRate < 0.7
              ? 'CRITICAL'
              : agreementRate >= 0.9
                ? 'MEDIUM'
                : 'HIGH';
      // Observability is best-effort: a throwing shadow sink must never impact
      // the request (ADR-011 constraint 3 — metrics never affect runtime).
      try {
        this.onShadow({
          requestId: this.requestId(),
          mode: this.mode,
          userId,
          query: prompt,
          legacy: { enriched: legacyEnriched, latencyMs: legacyLatency },
          next: {
            enriched: nextEnriched,
            latencyMs: nextLatency,
            ...(nextError ? { error: nextError } : {}),
          },
          divergence: { identical, agreementRate, severity, onlyLegacy, onlyNew },
          at: Date.now(),
        });
      } catch {
        /* swallow: shadow metrics sink failure cannot fail the request */
      }
    }

    // The user ALWAYS gets the legacy (authoritative) enrichment in shadow mode.
    return legacyEnriched;
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Extract the "- <memory>" context lines from an enriched prompt so shadow
 * comparison focuses on recalled memories, not the invariant scaffolding.
 */
function contextLines(enriched: string): string[] {
  return enriched
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
