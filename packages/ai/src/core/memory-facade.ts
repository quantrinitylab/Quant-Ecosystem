// ============================================================================
// AI Core — MemoryFacade (M11c, ADR-011)
//
// A STATELESS router between the legacy memory path and the new MemoryService.
// It contains NO business logic — no conflict resolution, policy, extraction,
// caching, retries, or heuristics. Just: request → route → result.
//
// Modes (reversible FSM): legacy ⇄ dual_write ⇄ shadow ⇄ new.
//  - legacy     : behaves exactly like today.
//  - dual_write : legacy is authoritative; new receives writes; new failures are
//                 reported to a sink, never fail the request (asymmetric).
//  - shadow     : legacy answers the user; new runs silently; results compared
//                 SEMANTICALLY; a ShadowReport is emitted. Never influences runtime.
//  - new        : new is authoritative.
//
// All observability is emitted to injected sinks; the facade holds no state.
// ============================================================================

import type { ConversationTurn, RetrievalContext, RetrievedMemory } from './memory-port';

export type FacadeMode = 'legacy' | 'dual_write' | 'shadow' | 'new';

/** The minimal surface the facade routes. Both legacy and new adapt to this. */
export interface MemoryBackend {
  observe(turn: ConversationTurn): Promise<void>;
  recall(ctx: RetrievalContext): Promise<RetrievedMemory[]>;
}

export type DivergenceSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Semantic (not byte) comparison of a single shadow recall. */
export interface ShadowReport {
  requestId: string;
  mode: FacadeMode;
  query: string;
  legacy: { recalled: string[]; latencyMs: number };
  next: { recalled: string[]; latencyMs: number; error?: string };
  divergence: {
    onlyLegacy: string[];
    onlyNew: string[];
    agreementRate: number; // Jaccard over normalized recalled contents (0-1)
    severity: DivergenceSeverity;
  };
  at: number;
}

export type ShadowSink = (report: ShadowReport) => void;
export type SecondaryWriteErrorSink = (err: unknown, turn: ConversationTurn) => void;

export interface MemoryFacadeOptions {
  mode: FacadeMode;
  /** Authoritative during migration; behaves like today. */
  legacy: MemoryBackend;
  /** The new subsystem (MemoryService satisfies MemoryBackend structurally). */
  next: MemoryBackend;
  /** Observational sink for shadow reads (never influences runtime). */
  onShadow?: ShadowSink;
  /** Sink for best-effort secondary write failures (dual_write/shadow). */
  onSecondaryWriteError?: SecondaryWriteErrorSink;
  /** Override severity classification (e.g. safety-critical slots). */
  classifySeverity?: (
    onlyLegacy: string[],
    onlyNew: string[],
    agreement: number,
  ) => DivergenceSeverity;
  /** Request id generator (default: monotonic-ish from time+counter is NOT used — caller supplies). */
  requestId?: () => string;
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

export class MemoryFacade {
  private readonly mode: FacadeMode;
  private readonly legacy: MemoryBackend;
  private readonly next: MemoryBackend;
  private readonly onShadow: ShadowSink | undefined;
  private readonly onSecondaryWriteError: SecondaryWriteErrorSink | undefined;
  private readonly classifySeverity: (a: string[], b: string[], agr: number) => DivergenceSeverity;
  private readonly requestId: () => string;

  constructor(opts: MemoryFacadeOptions) {
    this.mode = opts.mode;
    this.legacy = opts.legacy;
    this.next = opts.next;
    this.onShadow = opts.onShadow;
    this.onSecondaryWriteError = opts.onSecondaryWriteError;
    this.classifySeverity = opts.classifySeverity ?? defaultSeverity;
    this.requestId = opts.requestId ?? (() => `req_${Date.now().toString(36)}`);
  }

  /** Current mode (read-only; migration flips this via a new facade instance/config). */
  getMode(): FacadeMode {
    return this.mode;
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  async observe(turn: ConversationTurn): Promise<void> {
    switch (this.mode) {
      case 'legacy':
        await this.legacy.observe(turn);
        return;
      case 'dual_write':
      case 'shadow':
        // Asymmetric: legacy is primary (determines success); new is best-effort.
        await this.legacy.observe(turn);
        await this.writeSecondary(this.next, turn);
        return;
      case 'new':
        await this.next.observe(turn);
        return;
    }
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  async recall(ctx: RetrievalContext): Promise<RetrievedMemory[]> {
    switch (this.mode) {
      case 'legacy':
      case 'dual_write':
        return this.legacy.recall(ctx);
      case 'new':
        return this.next.recall(ctx);
      case 'shadow':
        return this.shadowRecall(ctx);
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────────────

  /** Best-effort secondary write: failures go to a sink, never fail the request. */
  private async writeSecondary(backend: MemoryBackend, turn: ConversationTurn): Promise<void> {
    try {
      await backend.observe(turn);
    } catch (err) {
      this.onSecondaryWriteError?.(err, turn);
    }
  }

  /**
   * Shadow read: serve LEGACY to the user; run new silently; compare semantically;
   * emit a ShadowReport. New errors are swallowed (recorded) — never surface.
   */
  private async shadowRecall(ctx: RetrievalContext): Promise<RetrievedMemory[]> {
    const lStart = now();
    const legacyResults = await this.legacy.recall(ctx);
    const legacyLatency = now() - lStart;

    // Run new silently, isolated from the user path.
    const nStart = now();
    let nextResults: RetrievedMemory[] = [];
    let nextError: string | undefined;
    try {
      nextResults = await this.next.recall(ctx);
    } catch (err) {
      nextError = err instanceof Error ? err.message : String(err);
    }
    const nextLatency = now() - nStart;

    if (this.onShadow) {
      const legacyContents = legacyResults.map((m) => m.content);
      const nextContents = nextResults.map((m) => m.content);
      const { onlyLegacy, onlyNew, agreementRate } = compareRecalls(legacyContents, nextContents);
      const severity = nextError
        ? 'HIGH'
        : this.classifySeverity(onlyLegacy, onlyNew, agreementRate);
      this.onShadow({
        requestId: this.requestId(),
        mode: this.mode,
        query: ctx.query,
        legacy: { recalled: legacyContents, latencyMs: legacyLatency },
        next: {
          recalled: nextContents,
          latencyMs: nextLatency,
          ...(nextError ? { error: nextError } : {}),
        },
        divergence: { onlyLegacy, onlyNew, agreementRate, severity },
        at: Date.now(),
      });
    }

    // The user ALWAYS gets the legacy (authoritative) result in shadow mode.
    return legacyResults;
  }
}

// ─── Pure comparison helpers ─────────────────────────────────────────────────

/** Semantic comparison of two recalled-content lists. Pure — reused by replay. */
export function compareRecalls(
  legacy: string[],
  next: string[],
): { onlyLegacy: string[]; onlyNew: string[]; agreementRate: number } {
  const l = new Set(legacy.map(norm));
  const n = new Set(next.map(norm));
  const onlyLegacy = [...l].filter((x) => !n.has(x));
  const onlyNew = [...n].filter((x) => !l.has(x));
  const union = new Set([...l, ...n]);
  const intersection = [...l].filter((x) => n.has(x)).length;
  const agreementRate = union.size === 0 ? 1 : intersection / union.size;
  return { onlyLegacy, onlyNew, agreementRate };
}

function defaultSeverity(
  onlyLegacy: string[],
  _onlyNew: string[],
  agreement: number,
): DivergenceSeverity {
  if (agreement >= 0.99) return 'LOW';
  // Losing a fact legacy had (onlyLegacy) is worse than adding one (onlyNew).
  if (onlyLegacy.length > 0 && agreement < 0.7) return 'CRITICAL';
  if (agreement >= 0.9) return 'MEDIUM';
  return 'HIGH';
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
