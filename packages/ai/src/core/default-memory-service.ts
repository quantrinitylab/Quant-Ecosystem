// ============================================================================
// AI Core — DefaultMemoryService (PR-M02)
//
// The orchestration layer. Implements the FROZEN MemoryService facade (ADR-005)
// over injected capability ports. This is where retrieval quality is actually
// decided: merge, dedup, ranking, budget allocation.
//
// It knows NOTHING about backends. Ports (Prisma store, Qdrant retriever, Redis
// cache, graph) are injected. Swapping a backend = injecting a different port,
// never editing this file or the Engine.
//
//   Engine → MemoryService.observe(turn)
//                 │
//                 ├── ConversationLog.append(turn)
//                 ├── MemoryExtractor.extract(...)
//                 ├── MemoryStore.store(...)      (per extracted record)
//                 └── indexer?(...)               (optional vector indexing)
//
//   Engine → MemoryService.recall(ctx)
//                 │
//                 ├── run all MemoryRetrievers (parallel)
//                 ├── MergeStrategy.merge(...)
//                 ├── Deduplicator.dedupe(...)
//                 └── BudgetAllocator.fit(..., ctx.budget)
// ============================================================================

import type {
  MemoryService,
  MemoryStore,
  MemoryRetriever,
  ConversationLog,
  ConversationTurn,
  MemoryExtractor,
  MemoryCompressor,
  MemoryMaintenance,
  MemoryRecord,
  RememberRequest,
  RetrievalContext,
  RetrievedMemory,
  ForgetPolicy,
  MemoryKind,
  MemoryLevel,
} from './memory-port';
import { asKind, asLevel } from './memory-port';
import type { MemoryConflictResolver } from './memory-conflict';

// ─── Pluggable recall strategies (defaults provided, all injectable) ─────────

/** Combine per-retriever result lists into one ranked list. */
export interface MergeStrategy {
  merge(perRetriever: RetrievedMemory[][]): RetrievedMemory[];
}

/** Remove duplicate memories (same id, or near-identical content). */
export interface Deduplicator {
  dedupe(memories: RetrievedMemory[]): RetrievedMemory[];
}

/** Trim a ranked list to fit a token budget. */
export interface BudgetAllocator {
  fit(memories: RetrievedMemory[], budget: number | undefined): RetrievedMemory[];
}

/** Optional audit sink for privileged memory operations (forget). */
export type MemoryAuditSink = (event: {
  action: 'forget';
  memoryId: string;
  policy: ForgetPolicy;
  at: number;
}) => Promise<void>;

/** Optional side-effect after a record is stored (e.g. vector indexing). */
export type MemoryIndexer = (record: MemoryRecord) => Promise<void>;

/**
 * Soft-archive capability (removes a memory from recall while retaining it for
 * audit). Distinct from MemoryStore.delete (hard). When present, superseded
 * facts are archived rather than deleted. Deferred in ADR-005, realized here.
 */
export interface MemoryArchiver {
  archive(id: string, reason: string): Promise<boolean>;
}

// ─── Default strategy implementations ────────────────────────────────────────

const TOKENS_PER_CHAR = 0.25; // ~4 chars/token, matches token-counter heuristic
const estimateTokens = (text: string): number => Math.ceil(text.length * TOKENS_PER_CHAR);

/** Highest-relevance-wins on id collision, then sort by relevance descending. */
export class DefaultMergeStrategy implements MergeStrategy {
  merge(perRetriever: RetrievedMemory[][]): RetrievedMemory[] {
    const bestById = new Map<string, RetrievedMemory>();
    for (const list of perRetriever) {
      for (const mem of list) {
        const existing = bestById.get(mem.id);
        if (!existing || mem.relevance > existing.relevance) {
          bestById.set(mem.id, mem);
        }
      }
    }
    return [...bestById.values()].sort((a, b) => b.relevance - a.relevance);
  }
}

/** Dedupe by id first, then by normalized content (collapses paraphrase-free repeats). */
export class DefaultDeduplicator implements Deduplicator {
  dedupe(memories: RetrievedMemory[]): RetrievedMemory[] {
    const seenIds = new Set<string>();
    const seenContent = new Set<string>();
    const out: RetrievedMemory[] = [];
    for (const mem of memories) {
      if (seenIds.has(mem.id)) continue;
      const key = mem.content.trim().toLowerCase().replace(/\s+/g, ' ');
      if (seenContent.has(key)) continue;
      seenIds.add(mem.id);
      seenContent.add(key);
      out.push(mem);
    }
    return out;
  }
}

/** Greedily include memories (assumed pre-ranked) until the token budget is spent. */
export class DefaultBudgetAllocator implements BudgetAllocator {
  fit(memories: RetrievedMemory[], budget: number | undefined): RetrievedMemory[] {
    if (budget === undefined || budget <= 0) return memories;
    const out: RetrievedMemory[] = [];
    let used = 0;
    for (const mem of memories) {
      const cost = estimateTokens(mem.content);
      if (used + cost > budget) continue; // skip over-budget, keep scanning smaller ones
      used += cost;
      out.push(mem);
    }
    return out;
  }
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

export interface DefaultMemoryServiceDeps {
  /** Durable write/delete of records. */
  store: MemoryStore;
  /** One or more retrievers (vector, keyword, graph...). Queried in parallel and merged. */
  retrievers: MemoryRetriever[];
  /** Append-only dialogue history. */
  conversationLog: ConversationLog;
  /** Decides what (if anything) to remember from a turn. */
  extractor: MemoryExtractor;
  /** Summarizes a session when asked. */
  compressor: MemoryCompressor;
  /** Lifecycle ops (optional; enables soft-archive on forget). */
  maintenance?: MemoryMaintenance;
  /** Optional post-store side effect (e.g. vector indexing). */
  indexer?: MemoryIndexer;
  /** Optional audit sink for forget operations. */
  audit?: MemoryAuditSink;
  /**
   * Optional fact-supersession engine. When present, a new fact that supersedes
   * or contradicts an existing one retires the old memory before storing.
   */
  conflictResolver?: MemoryConflictResolver;
  /** Optional soft-archive port. Superseded facts are archived if present, else deleted. */
  archiver?: MemoryArchiver;
  /** How many existing memories to consider when resolving conflicts (default 20). */
  conflictScanLimit?: number;
  /** Strategy overrides (defaults used if omitted). */
  merge?: MergeStrategy;
  deduplicator?: Deduplicator;
  budgeter?: BudgetAllocator;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * DefaultMemoryService — the reference orchestration of the memory ports.
 *
 * Backend-agnostic. All backends arrive via DI. This is Quant's "brain"; the
 * ports are its plugins.
 */
export class DefaultMemoryService implements MemoryService {
  private readonly store: MemoryStore;
  private readonly retrievers: MemoryRetriever[];
  private readonly conversationLog: ConversationLog;
  private readonly extractor: MemoryExtractor;
  private readonly compressor: MemoryCompressor;
  private readonly maintenance: MemoryMaintenance | undefined;
  private readonly indexer: MemoryIndexer | undefined;
  private readonly audit: MemoryAuditSink | undefined;
  private readonly conflictResolver: MemoryConflictResolver | undefined;
  private readonly archiver: MemoryArchiver | undefined;
  private readonly conflictScanLimit: number;
  private readonly merger: MergeStrategy;
  private readonly deduplicator: Deduplicator;
  private readonly budgeter: BudgetAllocator;

  constructor(deps: DefaultMemoryServiceDeps) {
    this.store = deps.store;
    this.retrievers = deps.retrievers;
    this.conversationLog = deps.conversationLog;
    this.extractor = deps.extractor;
    this.compressor = deps.compressor;
    this.maintenance = deps.maintenance;
    this.indexer = deps.indexer;
    this.audit = deps.audit;
    this.conflictResolver = deps.conflictResolver;
    this.archiver = deps.archiver;
    this.conflictScanLimit = deps.conflictScanLimit ?? 20;
    this.merger = deps.merge ?? new DefaultMergeStrategy();
    this.deduplicator = deps.deduplicator ?? new DefaultDeduplicator();
    this.budgeter = deps.budgeter ?? new DefaultBudgetAllocator();
  }

  // ─── Observe pipeline (primary Engine facade) ──────────────────────────────

  async observe(turn: ConversationTurn): Promise<void> {
    // 1. Persist the raw turn (append-only).
    await this.conversationLog.append(turn);

    // 2. Ask the extractor what (if anything) is worth remembering.
    const extracted = await this.extractor.extract(
      turn.actor,
      turn.session,
      turn.role,
      turn.content,
    );
    if (extracted.length === 0) return;

    // 3. Persist each extracted record (with conflict resolution).
    for (const record of extracted) {
      await this.persist(record);
    }
  }

  // ─── Explicit write ─────────────────────────────────────────────────────────

  async remember(input: RememberRequest): Promise<void> {
    const record: Omit<MemoryRecord, 'id' | 'createdAt' | 'version'> = {
      content: input.content,
      kind: normalizeKind(input.kind),
      level: normalizeLevel(input.level),
      owner: input.actor,
      pinned: false,
      expiresAt: null,
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.modality ? { modality: input.modality } : {}),
        ...(input.ref ? { ref: input.ref } : {}),
        ...(input.session ? { session: input.session } : {}),
      },
    };
    await this.persist(record);
  }

  // ─── Persist with fact supersession ─────────────────────────────────────────

  /**
   * Store a record after resolving conflicts against existing memories:
   * duplicate → skip; supersedes/contradicts → retire the old, then store new.
   */
  private async persist(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'version'>): Promise<void> {
    if (this.conflictResolver && record.owner && this.retrievers.length > 0) {
      const existing = await this.recall({
        actor: record.owner,
        query: record.content,
        limit: this.conflictScanLimit,
      });
      if (existing.length > 0) {
        const decisions = this.conflictResolver.resolve(
          { content: record.content, kind: record.kind as unknown as string },
          existing.map((e) => ({
            id: e.id,
            content: e.content,
            kind: (e.kind as unknown as string) ?? '',
          })),
        );
        // A duplicate of something we already know → nothing to do.
        if (decisions.some((d) => d.verdict === 'duplicate')) return;
        // Retire everything the new fact supersedes/contradicts.
        for (const d of decisions) {
          if (d.verdict === 'supersedes' || d.verdict === 'contradicts') {
            await this.retire(d.existingId);
          }
        }
      }
    }

    const stored = await this.store.store(record);
    if (this.indexer) await this.indexer(stored);
  }

  /** Remove a superseded memory from recall — archive if possible, else delete. */
  private async retire(id: string): Promise<void> {
    if (this.archiver) await this.archiver.archive(id, 'superseded');
    else await this.store.delete(id);
  }

  // ─── Recall pipeline ──────────────────────────────────────────────────────

  async recall(ctx: RetrievalContext): Promise<RetrievedMemory[]> {
    if (this.retrievers.length === 0) return [];

    // 1. Fan out to every retriever in parallel. One failing backend must not
    //    sink the whole recall — degrade gracefully to the survivors.
    const settled = await Promise.allSettled(this.retrievers.map((r) => r.retrieve(ctx)));
    const perRetriever = settled
      .filter((s): s is PromiseFulfilledResult<RetrievedMemory[]> => s.status === 'fulfilled')
      .map((s) => s.value);

    // 2. Merge → 3. Dedupe → 4. Budget (limit first, then token budget).
    let merged = this.merger.merge(perRetriever);
    merged = this.deduplicator.dedupe(merged);
    if (ctx.limit !== undefined && ctx.limit >= 0) merged = merged.slice(0, ctx.limit);
    return this.budgeter.fit(merged, ctx.budget);
  }

  // ─── Forget (policy-driven, never a blind delete) ───────────────────────────

  async forget(memoryId: string, policy: ForgetPolicy): Promise<boolean> {
    if (this.audit) {
      await this.audit({ action: 'forget', memoryId, policy, at: Date.now() });
    }
    if (policy.mode === 'hard') {
      // Irreversible erasure (e.g. GDPR).
      return this.store.delete(memoryId);
    }
    // Archive: soft, reversible. Demote so decay eventually reclaims it while the
    // record stays available for audit/rollback. (True archival storage awaits a
    // MemoryStore.updateMetadata() capability — see ADR-005 roadmap.)
    if (this.maintenance) return this.maintenance.demote(memoryId);
    return false;
  }

  // ─── Compression (orchestration entrypoint; delegates to the compressor) ────

  async compress(actor: string, session: string): Promise<string | null> {
    return this.compressor.compress(actor, session);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// RememberRequest carries branded kind/level; callers may pass raw strings that
// were widened. Re-brand defensively so stored records are always well-typed.
function normalizeKind(kind: MemoryKind | string): MemoryKind {
  return asKind(kind as string);
}
function normalizeLevel(level: MemoryLevel | string): MemoryLevel {
  return asLevel(level as string);
}
