// ============================================================================
// AI Core — MemoryPort Interface (PR-M01)
//
// CEO Order #0040: Future-proof interface for Memory as Reasoning Infrastructure.
// Memory is NOT storage. Memory is the ability to retrieve the right information
// at the right time for the right reason.
//
// ADR Reference: ADR-005 (Memory Port Architecture)
// QAP Satisfied: QAP-006 (Every interface is replaceable)
//
// Design Principles:
// - Hierarchical (6 levels: working → world)
// - Every memory has provenance, score, and explainability
// - Controlled forgetting (decay, pin, privacy-delete)
// - Budget-aware retrieval (never exceed token budget)
// - No direct prompt injection (normalize → deduplicate → rank → compress)
// ============================================================================

/**
 * Memory hierarchy levels (CEO Order #0031).
 * Each level has different owner, TTL, retrieval strategy, and security boundary.
 */
export enum MemoryLevel {
  /** Level 0: Current request scope. Discarded after response. */
  WORKING = 0,
  /** Level 1: Current conversation/session. Persists across turns. */
  CONVERSATION = 1,
  /** Level 2: User preferences, facts, patterns. Long-lived. */
  USER = 2,
  /** Level 3: Documents, files, repos owned by user. Permanent until deleted. */
  KNOWLEDGE = 3,
  /** Level 4: Organization/team shared knowledge. Scoped by org/tenant. */
  ORGANIZATION = 4,
  /** Level 5: Public/world knowledge. Shared across all users. */
  WORLD = 5,
}

/**
 * Memory provenance — every memory carries its origin story (CEO Order #0037).
 */
export interface MemoryProvenance {
  /** Where this memory came from */
  source: string;
  /** When it was first created */
  createdAt: number;
  /** When it was last updated */
  updatedAt: number;
  /** Confidence score (0-1): how certain are we this is accurate */
  confidence: number;
  /** Why this memory was stored */
  reason: string;
  /** Which other memories reference this one */
  referencedBy: string[];
  /** Version of the embedding model used (for re-embedding on model change) */
  embeddingVersion: string | null;
  /** Owner userId (or orgId for Level 4, null for Level 5) */
  owner: string | null;
  /** Access control: who can read this memory */
  acl: string[];
}

/**
 * A single memory entry with full metadata.
 */
export interface MemoryEntry {
  /** Unique identifier */
  id: string;
  /** Hierarchy level */
  level: MemoryLevel;
  /** The actual content (text) */
  content: string;
  /** Normalized key/label for deduplication (CEO Order #0038) */
  key: string;
  /** Provenance metadata */
  provenance: MemoryProvenance;
  /** Composite score: importance × freshness × confidence × usage × trust (CEO Order #0033) */
  score: number;
  /** Individual score components for explainability */
  scoreComponents: {
    importance: number;
    freshness: number;
    confidence: number;
    usage: number;
    trust: number;
  };
  /** Whether this memory is pinned (never auto-expires) (CEO Order #0036) */
  pinned: boolean;
  /** Optional TTL timestamp — null = no auto-expiry */
  expiresAt: number | null;
  /** How many times this memory has been retrieved */
  retrievalCount: number;
  /** Tags for categorization */
  tags: string[];
}

/**
 * Retrieval options for memory search.
 */
export interface MemoryRetrievalOptions {
  /** Which levels to search (default: all applicable) */
  levels?: MemoryLevel[];
  /** Maximum number of results */
  limit?: number;
  /** Minimum score threshold */
  minScore?: number;
  /** Token budget for returned memories (CEO Order #0035) */
  tokenBudget?: number;
  /** Filter by tags */
  tags?: string[];
  /** Owner filter (userId/orgId) */
  owner?: string;
}

/**
 * Retrieval result with explainability (CEO Order #0039).
 */
export interface MemoryRetrievalResult {
  /** The memory entry */
  entry: MemoryEntry;
  /** Why this memory was retrieved */
  retrievalReason: string;
  /** Relevance score to the query (0-1) */
  relevance: number;
}

/**
 * Memory statistics for observability.
 */
export interface MemoryStats {
  /** Total entries per level */
  countByLevel: Record<MemoryLevel, number>;
  /** Total memory size (approximate tokens) */
  totalTokens: number;
  /** Cache hit rate (for semantic cache layer) */
  cacheHitRate: number;
  /** Average retrieval latency (ms) */
  avgRetrievalLatencyMs: number;
  /** Number of memories decayed in last cycle */
  decayedLastCycle: number;
  /** Number of pinned memories */
  pinnedCount: number;
}

/**
 * MemoryPort — The core interface for Quant's Memory Reasoning Infrastructure.
 *
 * This interface defines the CONTRACT between the AI Engine and memory.
 * Implementations can be in-memory (dev), Prisma-backed (prod), or hybrid.
 *
 * CEO Philosophy: "Storage is not Memory. Memory is the ability to retrieve
 * the right information at the right time for the right reason."
 */
export interface MemoryPort {
  // ─── Core Operations ──────────────────────────────────────────────────────

  /**
   * Store a memory entry. Deduplicates by key (CEO Order #0038).
   * If a memory with the same key+owner exists, updates it instead of duplicating.
   */
  store(userId: string, entry: Omit<MemoryEntry, 'id' | 'retrievalCount'>): Promise<MemoryEntry>;

  /**
   * Retrieve relevant memories for a query.
   * Does NOT return raw results — applies: normalize → deduplicate → rank → compress (CEO Order #0034).
   * Respects token budget (CEO Order #0035).
   */
  retrieve(userId: string, query: string, options?: MemoryRetrievalOptions): Promise<MemoryRetrievalResult[]>;

  /**
   * Semantic search across memories (lower-level than retrieve; no budget/compression).
   */
  search(userId: string, query: string, options?: MemoryRetrievalOptions): Promise<MemoryEntry[]>;

  // ─── History ──────────────────────────────────────────────────────────────

  /**
   * Get conversation history for a user/session.
   */
  getHistory(userId: string, sessionId?: string, limit?: number): Promise<Array<{ role: string; content: string; timestamp: number }>>;

  /**
   * Append a turn to conversation history.
   */
  appendHistory(userId: string, sessionId: string, role: string, content: string): Promise<void>;

  // ─── Summarization ────────────────────────────────────────────────────────

  /**
   * Summarize a set of memories or conversation history into a condensed form.
   * Used for context compression when approaching token budget limits.
   */
  summarize(userId: string, sessionId?: string): Promise<string | null>;

  // ─── Lifecycle (CEO Order #0036: Controlled Forgetting) ───────────────────

  /**
   * Forget a specific memory (soft-delete with audit trail).
   */
  forget(memoryId: string, reason: string): Promise<boolean>;

  /**
   * Apply decay to all memories below a threshold. Reduces scores over time.
   * Low-score, unpinned memories are eligible for garbage collection.
   */
  decay(userId: string): Promise<number>;

  // ─── Importance Management ────────────────────────────────────────────────

  /**
   * Promote a memory (increase importance score). Used by feedback loop.
   */
  promote(memoryId: string, boostFactor?: number): Promise<MemoryEntry | null>;

  /**
   * Demote a memory (decrease importance score). Used on negative feedback.
   */
  demote(memoryId: string, decayFactor?: number): Promise<MemoryEntry | null>;

  /**
   * Pin a memory so it never auto-expires.
   */
  pin(memoryId: string): Promise<MemoryEntry | null>;

  /**
   * Unpin a memory (subject to normal TTL/decay again).
   */
  unpin(memoryId: string): Promise<MemoryEntry | null>;

  // ─── Explainability (CEO Order #0039) ─────────────────────────────────────

  /**
   * Explain why a memory exists and how it's used.
   * Returns a human-readable explanation: source, usage count, relevance history.
   */
  explain(memoryId: string): Promise<string>;

  // ─── Observability ────────────────────────────────────────────────────────

  /**
   * Get memory statistics for a user (or global if no userId).
   */
  stats(userId?: string): Promise<MemoryStats>;
}
