// ============================================================================
// QuantCooks CP-1 — the tool registry (§2.1 D1/D2, §7, §8).
// ============================================================================
//
// One registry, in the backend, wrapping the same services the UI calls.
// Every one of the 58 tools (54 manifest + 2 ratified Craft twins + the
// 2 design-companion amendments from C-7 step 4) is
// REGISTERED here with final schemas, a pricing rule and a permission
// tier; executors are either live (Tier A — thin wraps of the existing
// services; an executor never re-implements a service operation) or
// fail-closed (Tier B — throws its named *_NOT_CONFIGURED code, §8).
//
// The registry is the single source for four generated surfaces (§2.1
// D3): the REST tool endpoints, the OpenAPI document, the @quant/
// quant-tools definitions QuantAI consumes, and the MCP tools/list.
//
// Invoke pipeline (single execution path for REST, MCP and QuantAI —
// they differ only in how ToolContext is built):
//   tool exists → delegation claim check (§7.1: CP-3 not landed, any
//   claimed agent/delegation refuses DELEGATION_NOT_CONFIGURED) → zod
//   validation → consent gate (§4: before configuration, always) →
//   accepted-quote validation (§6.2) → tier-2 confirmation for agent
//   surfaces (§7.4, refusal carries the quote) → credits reserve when a
//   CreditsExecutionPort is configured (CP-2; null in CP-1) → executor →
//   settle-at-quote / release-on-failure → audit record (§7.5 shape).
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { ToolContext } from './context';
import { claimsDelegation, isAgentSurface } from './context';
import {
  pricingRuleFor,
  paramsHash,
  type CreditsExecutionPort,
  type PricingRule,
  type QuoteRecord,
  type QuoteStore,
} from './pricing';
import type { JobService } from './jobs';
import type { StoragePort } from '../services/storage.adapter';
import type { ProjectService } from '../services/project.service';
import type { LayerService } from '../services/layer.service';
import type { AssetService } from '../services/asset.service';
import type { TemplateService } from '../services/template.service';
import type { EffectsService } from '../services/effects.service';
import type { BrandKitService } from '../services/brand-kit.service';
import type { CollaborationService } from '../services/collaboration.service';
import type { AIVideoService } from '../services/ai-video.service';
import type { AutoEditOrchestrator } from '../services/auto-edit-orchestrator.service';
import type { CraftRenderService } from '../services/craft-render.service';
import type { PhotoEditService } from '../services/photo-edit.service';
import type { DesignService } from '../services/design.service';

export type ToolMode = 'sync' | 'async';
export type RegistrationTier = 'A' | 'B';

export interface ToolDefinition {
  name: string;
  group: string;
  /** Written for an LLM reader: what it does, when to use it, what it costs. */
  description: string;
  mode: ToolMode;
  tier: RegistrationTier;
  permissionTier: 0 | 1 | 2 | 3;
  /** Catalogue discovery readable by any signed-in caller (§7.2). */
  publicCatalogue?: boolean;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  example?: { input: unknown; output?: unknown };
  /** Tier B fail-closed code (§8 matrix), also the availability reason. */
  notConfiguredCode?: string;
  /** Dynamic availability (storage / credits ledger / companion deps). */
  availability?: (deps: ToolDeps) => { available: boolean; reason?: string };
  /** Consent gate (§4): runs before any configuration check, always. */
  consentCheck?: (input: never) => void;
  execute: (input: never, ctx: ToolContext, deps: ToolDeps) => Promise<unknown>;
}

export interface ToolDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any;
  storage: StoragePort | null;
  projects: ProjectService;
  layers: LayerService;
  assets: AssetService;
  templates: TemplateService;
  effects: EffectsService;
  brandKits: BrandKitService;
  collaboration: CollaborationService;
  aiVideo: AIVideoService;
  orchestrator: AutoEditOrchestrator;
  jobs: JobService;
  craftRenders: CraftRenderService;
  photoEdits: PhotoEditService;
  design: DesignService;
  /** Null until CP-2 wires @quant/credits (§6.2). */
  credits: CreditsExecutionPort | null;
  quotes: QuoteStore;
  audit: AuditSink;
  /** Set by buildToolRegistry after construction (tool 31 quotes via it). */
  registry?: ToolRegistry;
  /** Probed media duration (seconds) for an owned asset, when available. */
  durationProbe?: (assetId: string, userId: string) => Promise<number | null>;
}

// ---------------------------------------------------------------------------
// Audit (§7.5): CP-1 builds the log; CP-3 wires the events/persistence.
// Records carry paramsHash, never raw params (prompts are user content).
// ---------------------------------------------------------------------------

export interface ToolAuditRecord {
  auditId: string;
  at: string;
  tool: string;
  surface: ToolContext['surface'];
  actorUserId: string;
  agentId?: string;
  delegationId?: string;
  paramsHash: string;
  quoteId?: string;
  creditCost?: number;
  jobId?: string;
  outcome: 'success' | 'refused' | 'failed';
  errorCode?: string;
}

export type AuditSink = (record: ToolAuditRecord) => void;

export class InMemoryAuditSink {
  readonly records: ToolAuditRecord[] = [];
  readonly sink: AuditSink = (record) => {
    this.records.push(record);
  };
}

/** A Tier B executor: registered, specced, quotable-in-shape — refuses. */
export function failClosed(code: string, message: string) {
  return async (): Promise<never> => {
    throw createAppError(message, 503, code);
  };
}

export interface ToolAvailability {
  available: boolean;
  reason?: string;
}

export interface ToolSummary {
  name: string;
  group: string;
  description: string;
  mode: ToolMode;
  tier: RegistrationTier;
  permissionTier: 0 | 1 | 2 | 3;
  availability: 'available' | 'not_configured';
  notConfiguredReason?: string;
  pricing: PricingRule;
  publicCatalogue: boolean;
}

export function serializeQuote(quote: QuoteRecord) {
  return {
    quoteId: quote.quoteId,
    tool: quote.tool,
    credits: quote.credits,
    breakdown: quote.breakdown,
    expiresAt: quote.expiresAt.toISOString(),
    availability: 'available' as const,
  };
}

export class ToolRegistry {
  private readonly defs = new Map<string, ToolDefinition>();

  constructor(private readonly deps: ToolDeps) {}

  register(def: ToolDefinition): void {
    if (this.defs.has(def.name)) {
      throw new Error(`Tool already registered: ${def.name}`);
    }
    this.defs.set(def.name, def);
  }

  has(name: string): boolean {
    return this.defs.has(name);
  }

  get(name: string): ToolDefinition {
    const def = this.defs.get(name);
    if (!def) {
      throw createAppError(`Unknown tool: ${name}`, 404, 'TOOL_NOT_FOUND');
    }
    return def;
  }

  names(): string[] {
    return [...this.defs.keys()].sort();
  }

  list(): ToolDefinition[] {
    return [...this.defs.values()];
  }

  availabilityOf(def: ToolDefinition): ToolAvailability {
    if (def.availability) return def.availability(this.deps);
    if (def.notConfiguredCode) return { available: false, reason: def.notConfiguredCode };
    return { available: true };
  }

  summary(def: ToolDefinition): ToolSummary {
    const availability = this.availabilityOf(def);
    return {
      name: def.name,
      group: def.group,
      description: def.description,
      mode: def.mode,
      tier: def.tier,
      permissionTier: def.permissionTier,
      availability: availability.available ? 'available' : 'not_configured',
      ...(availability.available ? {} : { notConfiguredReason: availability.reason }),
      pricing: pricingRuleFor(def.name),
      publicCatalogue: def.publicCatalogue ?? false,
    };
  }

  summaries(): ToolSummary[] {
    return this.list().map((def) => this.summary(def));
  }

  // -- quotes (§6) -----------------------------------------------------------

  /**
   * Price (tool, params) without executing or reserving. PROVIDER-priced
   * tools refuse with PROVIDER_NOT_CONFIGURED and NO number (§8); tools
   * whose rate row is unset refuse with their own NOT_CONFIGURED code —
   * the same truth the invoke path states.
   */
  async quote(
    name: string,
    rawParams: unknown,
    ctx: ToolContext,
  ): Promise<QuoteRecord & { metering?: 'not_wired' }> {
    const def = this.get(name);
    const params = def.inputSchema.parse(rawParams ?? {}) as Record<string, unknown>;
    const rule = pricingRuleFor(name);
    const base = { userId: ctx.actorUserId, tool: name, paramsHash: paramsHash(params) };

    switch (rule.type) {
      case 'free':
        return this.deps.quotes.issue({ ...base, credits: 0, breakdown: [] });
      case 'not_wired':
        return {
          ...this.deps.quotes.issue({ ...base, credits: 0, breakdown: [] }),
          metering: 'not_wired',
        };
      case 'provider':
        throw createAppError(
          'No generation provider is configured, so no price can be quoted',
          503,
          'PROVIDER_NOT_CONFIGURED',
        );
      case 'plan':
        throw createAppError(
          'Plan-priced tools are quoted as the sum of their step quotes',
          503,
          def.notConfiguredCode ?? 'PLANNER_NOT_CONFIGURED',
        );
      case 'flat': {
        if (rule.credits === null) {
          throw createAppError(
            'This tool is not configured on this deployment',
            503,
            def.notConfiguredCode ?? 'PROVIDER_NOT_CONFIGURED',
          );
        }
        return this.deps.quotes.issue({
          ...base,
          credits: rule.credits,
          breakdown: [{ label: name, credits: rule.credits }],
        });
      }
      case 'per_second': {
        if (rule.creditsPerSecond === null) {
          throw createAppError(
            'This tool is not configured on this deployment',
            503,
            def.notConfiguredCode ?? 'PROVIDER_NOT_CONFIGURED',
          );
        }
        const durationSec =
          typeof params['durationSec'] === 'number' ? (params['durationSec'] as number) : null;
        if (durationSec === null) {
          throw createAppError(
            'A per-second quote needs the probed source duration',
            503,
            def.notConfiguredCode ?? 'PROVIDER_NOT_CONFIGURED',
          );
        }
        const credits = rule.creditsPerSecond * Math.ceil(durationSec);
        return this.deps.quotes.issue({
          ...base,
          credits,
          breakdown: [
            {
              label: `${name} (${rule.creditsPerSecond}/s × ${Math.ceil(durationSec)}s)`,
              credits,
            },
          ],
        });
      }
    }
  }

  // -- invoke (the single execution path, §2.2) ------------------------------

  async invoke(
    name: string,
    rawParams: unknown,
    ctx: ToolContext,
    opts: { quoteId?: string; idempotencyKey?: string } = {},
  ): Promise<Record<string, unknown>> {
    const auditId = `audit_${randomUUID()}`;
    const auditBase = {
      auditId,
      at: new Date().toISOString(),
      tool: name,
      surface: ctx.surface,
      actorUserId: ctx.actorUserId,
      ...(ctx.agentId ? { agentId: ctx.agentId } : {}),
      ...(ctx.delegationId ? { delegationId: ctx.delegationId } : {}),
      paramsHash: paramsHash(rawParams ?? {}),
    };

    try {
      const def = this.get(name);

      // §7.1/§8: agent/delegation claims cannot be honoured until CP-3
      // ships verification — refuse before anything else runs.
      if (claimsDelegation(ctx)) {
        throw createAppError(
          'Agent delegation is not configured (CP-3); delegated invokes are refused',
          401,
          'DELEGATION_NOT_CONFIGURED',
        );
      }

      const params = def.inputSchema.parse(rawParams ?? {}) as Record<string, unknown>;

      // §4/§8: the consent gate is ours — it runs before configuration.
      def.consentCheck?.(params as never);

      // §6.2: an accepted quote must match this invoke exactly. The hash
      // is taken over the PARSED params — the same value quote() hashed —
      // so schema defaults applied on both sides cannot manufacture a
      // mismatch for identical caller input.
      let quote: QuoteRecord | null = null;
      const quoteId = opts.quoteId;
      if (quoteId) {
        quote = this.deps.quotes.validateForInvoke({
          quoteId,
          userId: ctx.actorUserId,
          tool: name,
          params,
        });
      }

      // §7.4: tier-2 agent-surface invokes need a confirmation; the
      // refusal carries the quote so the host's next step is one
      // round-trip. REST/UI invokes are the user's own hands — the
      // surface owns their confirmation UX (§6.1).
      if (
        isAgentSurface(ctx) &&
        def.permissionTier === 2 &&
        !(ctx.confirmedToolIds ?? []).includes(name)
      ) {
        let attached: ReturnType<typeof serializeQuote> | null = null;
        try {
          attached = serializeQuote(await this.quote(name, rawParams, ctx));
        } catch {
          attached = null; // e.g. PROVIDER-priced: no quote exists to attach
        }
        throw createAppError(
          `'${name}' spends credits or is destructive and requires confirmation first`,
          409,
          'CONFIRMATION_REQUIRED',
          { quote: attached },
        );
      }

      // §6.2 reserve (only when CP-2's port is configured; null in CP-1).
      const rule = pricingRuleFor(name);
      const scopeId = `invoke:${auditId}`;
      let reservedCredits = 0;
      if (this.deps.credits && rule.type === 'flat' && rule.credits !== null && rule.credits > 0) {
        const effectiveQuote = quote ?? (await this.quote(name, rawParams, ctx));
        await this.deps.credits.reserve(ctx.actorUserId, scopeId, effectiveQuote.credits);
        reservedCredits = effectiveQuote.credits;
      }

      // Executors see the caller's context plus the invoke-scoped fields
      // (accepted quote id, idempotency key) — the registry-populated
      // ToolContext extensions (§7.1 note in context.ts).
      const execCtx: ToolContext = {
        ...ctx,
        ...(quoteId ? { quoteId } : {}),
        ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
      };

      let result: unknown;
      try {
        result = await def.execute(params as never, execCtx, this.deps);
      } catch (err) {
        if (reservedCredits > 0) {
          await this.deps.credits.release(scopeId); // settle at 0 (§6.1)
        }
        throw err;
      }
      if (reservedCredits > 0) {
        // Settle at the quoted amount — never above it (§6.1 cap rule).
        await this.deps.credits.settle(scopeId, reservedCredits);
      }

      const resultObject =
        result && typeof result === 'object' ? (result as Record<string, unknown>) : { result };
      const creditBearing =
        (rule.type === 'flat' && rule.credits !== null) || rule.type === 'not_wired';
      const envelope: Record<string, unknown> = {
        tool: name,
        auditId,
        ...resultObject,
        ...(creditBearing && resultObject['creditCost'] === undefined
          ? { creditCost: reservedCredits }
          : {}),
        ...(creditBearing && resultObject['metering'] === undefined
          ? { metering: reservedCredits > 0 ? 'metered' : 'not_wired' }
          : {}),
      };

      this.deps.audit({
        ...auditBase,
        ...(quoteId ? { quoteId } : {}),
        creditCost: reservedCredits,
        ...((envelope['job'] as { id?: string } | undefined)?.id
          ? { jobId: (envelope['job'] as { id: string }).id }
          : (envelope['job_id'] as string | undefined)
            ? { jobId: envelope['job_id'] as string }
            : {}),
        outcome: 'success',
      });
      return envelope;
    } catch (err) {
      const code =
        (err as { code?: string }).code ??
        ((err as { name?: string }).name === 'ZodError' ? 'VALIDATION_ERROR' : 'INTERNAL');
      const statusCode = (err as { statusCode?: number }).statusCode;
      this.deps.audit({
        ...auditBase,
        outcome: statusCode !== undefined && statusCode >= 500 ? 'failed' : 'refused',
        errorCode: code,
      });
      throw err;
    }
  }
}
