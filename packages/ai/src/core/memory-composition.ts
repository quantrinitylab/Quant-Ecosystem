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
import { DefaultMemoryExtractor } from './default-memory-extractor';
import { PrismaMemoryStore, type MemoryPrismaClient } from './prisma-memory-store';
import { PrismaMemoryRetriever, type MemoryRetrieverPrismaClient } from './prisma-memory-retriever';

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
export type MemoryDbClient = MemoryPrismaClient & MemoryRetrieverPrismaClient;

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
  /** Optional post-store side effect (e.g. vector indexing in M05). */
  indexer?: MemoryIndexer;
  /** Owner type stamped on stored records (default 'user'). */
  defaultOwnerType?: string;
  /** How many candidates the retriever scans per recall. */
  retrieverScanLimit?: number;
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

  const retriever = new PrismaMemoryRetriever({
    client: opts.prisma,
    ...(opts.retrieverScanLimit !== undefined ? { scanLimit: opts.retrieverScanLimit } : {}),
  });

  return new DefaultMemoryService({
    store,
    retrievers: [retriever],
    conversationLog: opts.conversationLog ?? new InMemoryConversationLog(),
    extractor: opts.extractor ?? new DefaultMemoryExtractor(),
    compressor: opts.compressor ?? new NoopMemoryCompressor(),
    ...(opts.maintenance !== undefined ? { maintenance: opts.maintenance } : {}),
    ...(opts.indexer !== undefined ? { indexer: opts.indexer } : {}),
  });
}
