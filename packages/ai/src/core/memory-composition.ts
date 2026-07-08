// ============================================================================
// AI Core — Memory Composition Root (PR-M04C)
//
// Wires the memory object graph into a single runnable DefaultMemoryService:
//
//   DefaultMemoryService
//     ├── PrismaMemoryStore        (durable writes)
//     ├── PrismaMemoryRetriever    (keyword/recency reads — M05 swaps in vectors)
//     ├── DefaultMemoryExtractor   (what to remember)
//     ├── ConversationLog          (raw dialogue)
//     ├── MemoryCompressor         (summarize)
//     └── MemoryMaintenance?       (optional lifecycle)
//
// This is the seam where the narrow Prisma interfaces meet the concrete client.
// Everything below the factory is swappable via the options bag.
// ============================================================================

import type {
  ConversationLog,
  ConversationTurn,
  MemoryCompressor,
  MemoryExtractor,
  MemoryMaintenance,
} from './memory-port';
import { DefaultMemoryService, type MemoryIndexer } from './default-memory-service';
import type { MemoryRetriever } from './memory-port';
import { DefaultMemoryExtractor } from './default-memory-extractor';
import {
  PrismaMemoryStore,
  PrismaMemoryArchiver,
  type MemoryPrismaClient,
  type MemoryArchiverPrismaClient,
} from './prisma-memory-store';
import { DefaultMemoryConflictResolver, type MemoryConflictResolver } from './memory-conflict';
import { PrismaMemoryRetriever, type MemoryRetrieverPrismaClient } from './prisma-memory-retriever';
import {
  VectorMemoryRetriever,
  type EmbeddingProvider,
  type VectorBackend,
  type RetrievalWeights,
  type RetrievalTrace,
} from './vector-memory-retriever';
import { VectorMemoryIndexer, type MemoryEmbeddingPrismaClient } from './vector-memory-indexer';

// ─── Default ConversationLog (ephemeral; swap for a durable one in prod) ─────

/**
 * In-process conversation log. This is a DEV/TEST default — raw dialogue is
 * ephemeral here. Production injects a durable log (e.g. AIMessage-backed).
 * The extracted MEMORIES are durable regardless (Prisma); only the raw
 * turn-by-turn transcript is in-process in this default.
 */
export class InMemoryConversationLog implements ConversationLog {
  private turns = new Map<string, Array<{ role: string; content: string; timestamp: number }>>();

  private key(actor: string, session: string): string {
    return `${actor}::${session}`;
  }

  async append(turn: ConversationTurn): Promise<void> {
    const k = this.key(turn.actor, turn.session);
    const list = this.turns.get(k) ?? [];
    list.push({ role: turn.role, content: turn.content, timestamp: Date.now() });
    this.turns.set(k, list);
  }

  async recent(
    actor: string,
    session: string,
    limit = 50,
  ): Promise<Array<{ role: string; content: string; timestamp: number }>> {
    const list = this.turns.get(this.key(actor, session)) ?? [];
    return list.slice(-limit);
  }

  async clear(actor: string, session: string): Promise<void> {
    this.turns.delete(this.key(actor, session));
  }
}

/** No-op compressor default (returns null = nothing summarized). */
export class NoopMemoryCompressor implements MemoryCompressor {
  async compress(): Promise<string | null> {
    return null;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * The Prisma client surface the memory stack needs: one delegate that can
 * create / findFirst / findMany / deleteMany on memory_records. A real
 * PrismaClient satisfies this structurally.
 */
export type MemoryDbClient = MemoryPrismaClient &
  MemoryRetrieverPrismaClient &
  MemoryArchiverPrismaClient;

export interface MemoryCompositionOptions {
  /** The (real) Prisma client. Powers both the store and the retriever. */
  prisma: MemoryDbClient;
  /** Override the extractor (default: DefaultMemoryExtractor with rule-based units). */
  extractor?: MemoryExtractor;
  /** Override the conversation log (default: InMemoryConversationLog). */
  conversationLog?: ConversationLog;
  /** Override the compressor (default: NoopMemoryCompressor). */
  compressor?: MemoryCompressor;
  /** Optional lifecycle port (enables soft-archive on forget). */
  maintenance?: MemoryMaintenance;
  /** Optional post-store side effect. Overrides the vector indexer if both set. */
  indexer?: MemoryIndexer;
  /** Owner type stamped on stored records (default 'user'). */
  defaultOwnerType?: string;
  /** How many candidates the keyword retriever scans per recall. */
  retrieverScanLimit?: number;
  /**
   * Fact supersession (PR-M07). Enabled by default with the rule-based resolver;
   * pass `false` to disable, or a custom resolver to override. Superseded facts
   * are soft-archived (retained for audit), not deleted.
   */
  conflictResolver?: MemoryConflictResolver | false;
  /**
   * Optional semantic layer (PR-M05). When provided, a VectorMemoryRetriever is
   * added AHEAD of the keyword retriever, and a VectorMemoryIndexer embeds on
   * store. If the vector backend fails at recall time, the orchestrator drops it
   * and the keyword retriever still answers (graceful fallback).
   */
  vector?: {
    embedder: EmbeddingProvider;
    vectorBackend: VectorBackend;
    /** Prisma client for writing memory_embeddings (usually the same client). */
    embeddingClient: MemoryEmbeddingPrismaClient;
    weights?: Partial<RetrievalWeights>;
    candidateLimit?: number;
    recencyWindowMs?: number;
    embeddingVersion?: number;
    onTrace?: (trace: RetrievalTrace) => void;
  };
}

/**
 * Build a fully-wired DefaultMemoryService. This is the ONE place that knows the
 * concrete backends; callers get back the frozen MemoryService facade.
 */
export function createMemoryService(opts: MemoryCompositionOptions): DefaultMemoryService {
  const store = new PrismaMemoryStore({
    client: opts.prisma,
    ...(opts.defaultOwnerType !== undefined ? { defaultOwnerType: opts.defaultOwnerType } : {}),
  });

  const keywordRetriever = new PrismaMemoryRetriever({
    client: opts.prisma,
    ...(opts.retrieverScanLimit !== undefined ? { scanLimit: opts.retrieverScanLimit } : {}),
  });

  // Semantic layer sits AHEAD of the keyword retriever; the keyword one is the
  // graceful fallback when the vector backend is unavailable.
  const retrievers: MemoryRetriever[] = [];
  let vectorIndexer: MemoryIndexer | undefined;
  if (opts.vector) {
    const v = opts.vector;
    retrievers.push(
      new VectorMemoryRetriever({
        embedder: v.embedder,
        vectorBackend: v.vectorBackend,
        client: opts.prisma,
        ...(v.weights !== undefined ? { weights: v.weights } : {}),
        ...(v.candidateLimit !== undefined ? { candidateLimit: v.candidateLimit } : {}),
        ...(v.recencyWindowMs !== undefined ? { recencyWindowMs: v.recencyWindowMs } : {}),
        ...(v.onTrace !== undefined ? { onTrace: v.onTrace } : {}),
      }),
    );
    vectorIndexer = new VectorMemoryIndexer({
      embedder: v.embedder,
      vectorBackend: v.vectorBackend,
      client: v.embeddingClient,
      ...(v.embeddingVersion !== undefined ? { embeddingVersion: v.embeddingVersion } : {}),
    }).index;
  }
  retrievers.push(keywordRetriever);

  const indexer = opts.indexer ?? vectorIndexer;

  // Fact supersession: enabled by default; superseded facts are soft-archived.
  const conflictResolver: MemoryConflictResolver | undefined =
    opts.conflictResolver === false
      ? undefined
      : (opts.conflictResolver ?? new DefaultMemoryConflictResolver());
  const archiver = conflictResolver ? new PrismaMemoryArchiver(opts.prisma) : undefined;

  return new DefaultMemoryService({
    store,
    retrievers,
    conversationLog: opts.conversationLog ?? new InMemoryConversationLog(),
    extractor: opts.extractor ?? new DefaultMemoryExtractor(),
    compressor: opts.compressor ?? new NoopMemoryCompressor(),
    ...(opts.maintenance !== undefined ? { maintenance: opts.maintenance } : {}),
    ...(indexer !== undefined ? { indexer } : {}),
    ...(conflictResolver !== undefined ? { conflictResolver } : {}),
    ...(archiver !== undefined ? { archiver } : {}),
  });
}
