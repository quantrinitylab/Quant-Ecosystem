// ============================================================================
// QuantAI — Memory Facade Service (M11c Priority 4: REAL integration)
//
// The FIRST production app path that calls the new memory subsystem — through
// the ADR-011 MemoryFacade, mode-controlled by QUANTAI_MEMORY_MODE:
//
//   legacy (default)  → AIMemoryStore only. Byte-identical to today.
//   dual_write        → legacy authoritative; new subsystem written best-effort.
//   shadow            → legacy answers; new subsystem compared; ShadowReport kept.
//   new               → new subsystem authoritative (only after gates pass).
//
// Blast radius is microscopic by design: existing CRUD routes are untouched;
// only the NEW conversational observe/recall path routes through the facade.
// The facade never self-migrates — a human flips the env var (ADR-011).
// ============================================================================

import { randomUUID } from 'node:crypto';
import {
  MemoryFacade,
  createMemoryService,
  type MemoryBackend,
  type ConversationTurn,
  type RetrievalContext,
  type RetrievedMemory,
  type ShadowReport,
  type FacadeMode,
  type MemoryDbClient,
} from '@quant/ai';
import type { MemoryService } from './memory.service';

const VALID_CANARY_MODES: FacadeMode[] = ['legacy', 'dual_write', 'shadow'];
const SHADOW_BUFFER_LIMIT = 500;

/** Adapt the existing QuantAI CRUD store to the facade's MemoryBackend port. */
export class QuantaiLegacyBackend implements MemoryBackend {
  constructor(private readonly service: MemoryService) {}

  async observe(turn: ConversationTurn): Promise<void> {
    // Conversation-sourced writes arrive as PENDING candidates — the existing
    // review flow (approve/reject) stays the authority, exactly like today.
    this.service.createCandidate(turn.actor, {
      category: 'preferences',
      content: turn.content,
      source: `conversation:${turn.session}`,
      sourceApp: 'quantai',
      explanation: `Observed from ${turn.role} turn in session ${turn.session}`,
      accessScopes: ['quantai'],
      tags: ['conversation'],
    });
  }

  async recall(ctx: RetrievalContext): Promise<RetrievedMemory[]> {
    const entries = this.service.listMemories(ctx.actor, { search: ctx.query });
    return entries.map((m) => ({
      id: m.id,
      content: m.content,
      source: 'quantai-store',
      relevance: 0.5, // legacy store has no scoring — constant, preserved as-is
      backend: 'ai-memory',
    }));
  }
}

export type QuantaiVectorConfig = NonNullable<Parameters<typeof createMemoryService>[0]['vector']>;

export interface DurableMemoryDatabase {
  readonly durability: 'durable';
  client: MemoryDbClient;
}

export interface DurableMemoryVector {
  readonly durability: 'durable';
  config: QuantaiVectorConfig;
}

export interface DurableShadowReportSink {
  readonly durability: 'durable';
  emit(report: ShadowReport): Promise<void>;
}

export type QuantaiMemoryDependency =
  | 'database'
  | 'vector'
  | 'shadow_report_sink'
  | 'new_authority_approval'
  | 'valid_mode';

export class QuantaiMemoryConfigurationError extends Error {
  readonly code = 'MEMORY_CANARY_CONFIGURATION_INVALID';

  constructor(
    readonly requestedMode: string,
    readonly missing: readonly QuantaiMemoryDependency[],
  ) {
    super(
      missing.includes('valid_mode')
        ? `Unsupported QUANTAI_MEMORY_MODE '${requestedMode}'.`
        : missing.includes('new_authority_approval')
          ? "QuantAI memory mode 'new' is blocked until the ADR-011 release gate is approved."
          : `QuantAI memory mode '${requestedMode}' requires durable dependencies: ${missing.join(', ')}.`,
    );
    this.name = 'QuantaiMemoryConfigurationError';
  }
}

export interface QuantaiMemoryFacadeOptions {
  /** The existing CRUD service (shared instance so both paths see one store). */
  legacyService: MemoryService;
  /** Override mode (default: env QUANTAI_MEMORY_MODE, else 'legacy'). */
  mode?: FacadeMode;
  /** Explicitly tagged durable dependencies. Required by every non-legacy mode. */
  database?: DurableMemoryDatabase;
  vector?: DurableMemoryVector;
  /** Required in shadow mode; work unit 3 supplies the persistent implementation. */
  shadowSink?: DurableShadowReportSink;
  /** Structured operational reporting; must not throw into the user request. */
  onShadowSinkError?: (error: unknown, report: ShadowReport) => void | Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export interface QuantaiMemoryFacade {
  facade: MemoryFacade;
  mode: FacadeMode;
  /** Bounded diagnostic buffer only; never migration evidence authority. */
  shadowReports: ShadowReport[];
}

export function resolveFacadeMode(env: NodeJS.ProcessEnv = process.env): FacadeMode {
  const configured = env['QUANTAI_MEMORY_MODE'];
  if (configured === undefined) return 'legacy';

  const normalized = configured.trim().toLowerCase();
  if (normalized === 'new') {
    throw new QuantaiMemoryConfigurationError(configured, ['new_authority_approval']);
  }
  if (VALID_CANARY_MODES.includes(normalized as FacadeMode)) return normalized as FacadeMode;
  throw new QuantaiMemoryConfigurationError(configured, ['valid_mode']);
}

function assertDurableDependencies(mode: FacadeMode, opts: QuantaiMemoryFacadeOptions): void {
  // This application composition root cannot make Memory V2 authoritative until
  // work unit 5 records the quantitative ADR-011 gate and human approval.
  if (mode === 'new') {
    throw new QuantaiMemoryConfigurationError(mode, ['new_authority_approval']);
  }
  if (mode === 'legacy') return;

  const missing: QuantaiMemoryDependency[] = [];
  if (opts.database?.durability !== 'durable') missing.push('database');
  if (opts.vector?.durability !== 'durable') missing.push('vector');
  if (mode === 'shadow' && opts.shadowSink?.durability !== 'durable') {
    missing.push('shadow_report_sink');
  }
  if (missing.length > 0) throw new QuantaiMemoryConfigurationError(mode, missing);
}

/**
 * Build the single QuantAI facade composition root. Legacy remains unchanged;
 * explicit non-legacy modes fail at startup unless durable dependencies exist.
 */
export function createQuantaiMemoryFacade(opts: QuantaiMemoryFacadeOptions): QuantaiMemoryFacade {
  const mode = opts.mode ?? resolveFacadeMode(opts.env);
  assertDurableDependencies(mode, opts);

  const legacy = new QuantaiLegacyBackend(opts.legacyService);
  const next =
    mode === 'legacy'
      ? legacy
      : createMemoryService({
          prisma: opts.database!.client,
          vector: opts.vector!.config,
        });

  const shadowReports: ShadowReport[] = [];

  const facade = new MemoryFacade({
    mode,
    legacy,
    next,
    onShadow: (report) => {
      // This buffer is diagnostic only. The required sink is evidence authority.
      shadowReports.push(report);
      if (shadowReports.length > SHADOW_BUFFER_LIMIT) shadowReports.shift();

      const sink = opts.shadowSink;
      if (sink) {
        void sink.emit(report).catch((error: unknown) => {
          try {
            void Promise.resolve(opts.onShadowSinkError?.(error, report)).catch(() => undefined);
          } catch {
            /* observability failures never affect the legacy-authoritative request */
          }
        });
      }
    },
    onSecondaryWriteError: () => {
      /* best-effort by contract (ADR-011): never fails the request */
    },
    requestId: () => `quantai_${randomUUID()}`,
  });

  return { facade, mode, shadowReports };
}
