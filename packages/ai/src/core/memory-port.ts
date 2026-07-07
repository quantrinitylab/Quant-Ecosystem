// ============================================================================
// AI Core — Memory Interfaces (PR-M01 v2.1)
//
// Architecture: Engine → MemoryService → [Ports] → [Backends]
// CEO Score: 9.2/10 with 5 improvements applied.
//
// Principles:
// - Each interface = ONE responsibility
// - Storage model ≠ Retrieval model
// - Engine sees ONLY MemoryService (never individual ports)
// - No algorithm in contracts
// - MemoryRecord is immutable (event-sourcing compatible)
// - Levels/kinds are strings (extensible, never enum-locked)
// ============================================================================

// ─── Storage Types ──────────────────────────────────────────────────────────

/**
 * A stored memory fact. IMMUTABLE after creation.
 * Updates create new versions; projection derives latest state.
 * Lean — no scoring, no ACL, no algorithm baked in.
 */
export interface MemoryRecord {
  id: string;
  content: string;
  /** Extensible kind: 'fact' | 'preference' | 'episodic' | 'document' | custom */
  kind: string;
  /** Extensible level: 'working' | 'conversation' | 'user' | 'knowledge' | 'org' | 'world' | custom */
  level: string;
  /** Who owns this memory */
  owner: string | null;
  /** When created (immutable) */
  createdAt: number;
  /** Version number (incremented on logical update) */
  version: number;
  /** Never auto-expire if true */
  pinned: boolean;
  /** Optional expiry */
  expiresAt: number | null;
  /** Freeform metadata — schema owned by the writer */
  metadata: Record<string, unknown>;
}

// ─── Retrieval Types (separate from storage) ────────────────────────────────

/**
 * What comes back from retrieval. Independent of storage model.
 * A retriever may source from Qdrant, Neo4j, Redis, or hybrid — caller doesn't know.
 */
export interface RetrievedMemory {
  id: string;
  content: string;
  /** Where this memory came from (e.g. 'prisma', 'qdrant', 'graph', 'cache') */
  source: string;
  /** Implementation-provided relevance (0-1). Opaque to caller. */
  relevance: number;
  /** Optional kind for context-building */
  kind?: string;
  /** Optional level */
  level?: string;
}

/**
 * Context passed to retrieval — future-proof.
 * Retrieval is not always query-based; it can be objective-based.
 */
export interface RetrievalContext {
  /** Who is asking */
  actor: string;
  /** Natural-language query or intent */
  query: string;
  /** What the retrieval is FOR (planning, coding, debugging, summarization, etc.) */
  objective?: string;
  /** Token budget for results */
  budget?: number;
  /** Session/conversation scope */
  session?: string;
  /** Which levels to search */
  levels?: string[];
  /** Max results */
  limit?: number;
  /** Arbitrary constraints (permissions, scopes, active tools, model context window) */
  constraints?: Record<string, unknown>;
}

// ─── Port Interfaces (one responsibility each) ──────────────────────────────

/**
 * MemoryStore — durable write/delete of memory records.
 * ONE job: persist facts. Deduplication strategy is implementation's choice.
 */
export interface MemoryStore {
  store(record: Omit<MemoryRecord, 'id' | 'createdAt' | 'version'>): Promise<MemoryRecord>;
  delete(id: string): Promise<boolean>;
  get(id: string): Promise<MemoryRecord | null>;
}

/**
 * MemoryRetriever — find relevant memories for a context.
 * ONE job: retrieval. HOW (vector, keyword, graph, hybrid) is implementation.
 * Returns RetrievedMemory (NOT MemoryRecord) — decoupled from storage model.
 */
export interface MemoryRetriever {
  retrieve(ctx: RetrievalContext): Promise<RetrievedMemory[]>;
}

/**
 * ConversationLog — append-only dialogue turns.
 * NOT memory. Raw conversation. Memory is EXTRACTED from this by MemoryExtractor.
 */
export interface ConversationLog {
  append(actor: string, session: string, role: string, content: string): Promise<void>;
  recent(actor: string, session: string, limit?: number): Promise<Array<{ role: string; content: string; timestamp: number }>>;
  clear(actor: string, session: string): Promise<void>;
}

/**
 * MemoryExtractor — decides what to remember from conversation.
 * Sits BETWEEN ConversationLog and MemoryStore.
 * Decides: what to remember, what to ignore, what to summarize.
 */
export interface MemoryExtractor {
  /**
   * Given a conversation turn, extract facts worth remembering.
   * Returns records to store (may be empty if nothing memorable).
   */
  extract(
    actor: string,
    session: string,
    role: string,
    content: string,
  ): Promise<Array<Omit<MemoryRecord, 'id' | 'createdAt' | 'version'>>>;
}

/**
 * MemoryMaintenance — lifecycle operations.
 * ONE job: keep memory healthy. Decay, pin, promote/demote.
 */
export interface MemoryMaintenance {
  decay(owner: string): Promise<number>;
  pin(id: string): Promise<boolean>;
  unpin(id: string): Promise<boolean>;
  promote(id: string): Promise<boolean>;
  demote(id: string): Promise<boolean>;
}

// ─── MemoryService (Engine's ONLY dependency) ───────────────────────────────

/**
 * MemoryService — the orchestration layer.
 *
 * Engine calls ONLY this. It never touches stores, retrievers, or logs directly.
 * MemoryService coordinates across all ports and backends internally.
 *
 * This IS Quant's "brain". Stores, retrievers, vector DBs are its plugins.
 */
export interface MemoryService {
  /**
   * Remember something. MemoryService decides WHERE and HOW to store it
   * (may go to MemoryStore, may go to vector index, may go to graph — caller doesn't know).
   */
  remember(actor: string, content: string, kind: string, level: string, metadata?: Record<string, unknown>): Promise<void>;

  /**
   * Recall relevant memories for a context.
   * MemoryService orchestrates: which backends to query, how to merge, how to budget.
   * Returns ready-to-use context (compressed, deduplicated, budget-aware).
   */
  recall(ctx: RetrievalContext): Promise<RetrievedMemory[]>;

  /**
   * Forget a specific memory (with audit).
   */
  forget(memoryId: string, reason: string): Promise<boolean>;

  /**
   * Compress/summarize conversation history for a session.
   * Used when approaching token limits. MemoryService decides strategy.
   */
  compress(actor: string, session: string): Promise<string | null>;
}
