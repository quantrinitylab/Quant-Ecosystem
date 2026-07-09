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

const VALID_MODES: FacadeMode[] = ['legacy', 'dual_write', 'shadow', 'new'];
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

export interface QuantaiMemoryFacadeOptions {
  /** The existing CRUD service (shared instance so both paths see one store). */
  legacyService: MemoryService;
  /** Override mode (default: env QUANTAI_MEMORY_MODE, else 'legacy'). */
  mode?: FacadeMode;
  /** Prisma-shaped client for the NEW subsystem (real client in prod). */
  dbClient?: MemoryDbClient;
  env?: NodeJS.ProcessEnv;
}

export interface QuantaiMemoryFacade {
  facade: MemoryFacade;
  mode: FacadeMode;
  /** Bounded buffer of shadow reports (evidence for MIGRATION_SCOREBOARD rows). */
  shadowReports: ShadowReport[];
}

export function resolveFacadeMode(env: NodeJS.ProcessEnv = process.env): FacadeMode {
  const raw = (env['QUANTAI_MEMORY_MODE'] ?? 'legacy').toLowerCase() as FacadeMode;
  return VALID_MODES.includes(raw) ? raw : 'legacy';
}

/** In-memory MemoryDbClient for environments without a database (dev/tests). */
export function createInMemoryDbClient(): MemoryDbClient {
  interface Row {
    [key: string]: unknown;
    ownerId: string | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
  }
  const rows: Row[] = [];
  let seq = 0;
  return {
    memoryRecord: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const n = ++seq;
        const now = new Date();
        const row: Row = {
          id: `row_${n}`,
          logicalId: `mem_${n}`,
          version: 1,
          archivedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        } as Row;
        rows.push(row);
        return row;
      },
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        rows.filter((r) => {
          const w = where ?? {};
          if ('ownerId' in w && r.ownerId !== w['ownerId']) return false;
          if ('archivedAt' in w && w['archivedAt'] === null && r.archivedAt !== null) return false;
          if ('deletedAt' in w && w['deletedAt'] === null && r.deletedAt !== null) return false;
          return true;
        }),
      updateMany: async ({
        where,
        data,
      }: {
        where?: Record<string, unknown>;
        data?: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const r of rows) {
          if (where?.['logicalId'] !== undefined && r['logicalId'] !== where['logicalId']) continue;
          Object.assign(r, data ?? {});
          count++;
        }
        return { count };
      },
    },
  } as unknown as MemoryDbClient;
}

/**
 * Build the QuantAI memory facade. ONE construction site (composition root):
 * this is the only place the app knows both backends exist.
 */
export function createQuantaiMemoryFacade(opts: QuantaiMemoryFacadeOptions): QuantaiMemoryFacade {
  const mode = opts.mode ?? resolveFacadeMode(opts.env);
  const legacy = new QuantaiLegacyBackend(opts.legacyService);
  const next = createMemoryService({ prisma: opts.dbClient ?? createInMemoryDbClient() });

  const shadowReports: ShadowReport[] = [];
  let requestCounter = 0;

  const facade = new MemoryFacade({
    mode,
    legacy,
    next,
    onShadow: (report) => {
      shadowReports.push(report);
      if (shadowReports.length > SHADOW_BUFFER_LIMIT) shadowReports.shift();
    },
    onSecondaryWriteError: () => {
      /* best-effort by contract (ADR-011): never fails the request */
    },
    requestId: () => `quantai_${Date.now().toString(36)}_${++requestCounter}`,
  });

  return { facade, mode, shadowReports };
}
