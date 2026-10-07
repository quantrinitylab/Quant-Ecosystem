// ============================================================================
// AI Core — Memory Interfaces (PR-M01 v2.3)
//
// Architecture: Engine → MemoryService → [Ports] → [Backends]
// CEO Score: 9.5/10 with pre-merge refinements applied.
//
// Principles:
// - Each interface = ONE responsibility
// - Storage model ≠ Retrieval model
// - Engine sees ONLY MemoryService (never individual ports)
// - No algorithm in contracts
// - MemoryRecord is immutable (event-sourcing compatible)
// - Levels/kinds are branded strings (extensible + compile-time typo safety)
// - Request-object APIs over positional args (never break on new modalities)
// - Forgetting is a policy, not a hard delete (GDPR/audit/rollback friendly)
// - Compression is its own capability, orchestrated by the service
// - observe(turn) is the primary Engine facade; service coordinates the pipeline
//
// STATUS: FROZEN as of PR-M01 v2.3. Further changes require an ADR + PR-M02
// evidence. Implementation quality is now proven by DefaultMemoryService, not
// by more interface edits.
//
// ROADMAP (deliberately deferred — not blockers for PR-M01):
// - MemoryRecord.content may evolve to a typed multimodal payload. For now,
//   `content` stays the canonical text/caption; binaries go via `ref` +
//   `metadata`. We do NOT use `payload: unknown` — it erases type safety at
//   every read site for no gain over ref/metadata.
// - MemoryStore may gain exists() / updateMetadata() / batchStore() when a
//   concrete backend (PR-M02) proves the need. Not added speculatively.
// ============================================================================

// ─── Branded primitives (extensible strings + compile-time safety) ──────────

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** A memory kind (e.g. 'fact', 'preference', 'episodic'). Branded to prevent typos. */
export type MemoryKind = Brand<string, 'MemoryKind'>;
/** A memory level (e.g. 'working', 'conversation', 'user', 'knowledge'). Branded. */
export type MemoryLevel = Brand<string, 'MemoryLevel'>;

/** Construct a MemoryKind from a raw string (single, auditable coercion point). */
export const asKind = (s: string): MemoryKind => s as MemoryKind;
/** Construct a MemoryLevel from a raw string (single, auditable coercion point). */
export const asLevel = (s: string): MemoryLevel => s as MemoryLevel;

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
  kind: MemoryKind;
  /** Extensible level: 'working' | 'conversation' | 'user' | 'knowledge' | 'org' | 'world' | custom */
  level: MemoryLevel;
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

// ─── Write Request (request-object, never break on new modalities) ──────────

/**
 * What to remember. A request object (not positional args) so future modalities
 * (image, audio, document, structured fact) extend WITHOUT breaking callers.
 */
export interface RememberRequest {
  /** Who owns this memory. */
  actor: string;
  /** The primary textual content (or a caption/description for non-text). */
  content: string;
  /** Extensible kind: 'fact' | 'preference' | 'episodic' | 'document' | custom. */
  kind: MemoryKind;
  /** Extensible level: 'working' | 'conversation' | 'user' | 'knowledge' | ... */
  level: MemoryLevel;
  /** Modality of the payload. Defaults to 'text'. */
  modality?: 'text' | 'image' | 'audio' | 'document' | 'structured' | string;
  /** Optional pointer to a binary/large payload (e.g. S3 key) for non-text modalities. */
  ref?: string;
  /** Session/conversation scope this was learned in. */
  session?: string;
  /** Freeform metadata — schema owned by the writer. */
  metadata?: Record<string, unknown>;
}

/**
 * How to forget. Forgetting is a POLICY, not an unconditional hard delete.
 * Default is 'archive' so audit/rollback/GDSR-grace flows stay possible.
 */
export interface ForgetPolicy {
  /** 'archive' = soft, reversible, retained for audit; 'hard' = irreversible erase (e.g. GDPR). */
  mode: 'archive' | 'hard';
  /** Why (audit trail). */
  reason: string;
  /** Who requested it (audit trail). */
  requestedBy?: string;
}

// ─── Retrieval Types (separate from storage) ────────────────────────────────

/**
 * What comes back from retrieval. Independent of storage model.
 * A retriever may source from Qdrant, Neo4j, Redis, or hybrid — caller doesn't know.
 */
export interface RetrievedMemory {
  id: string;
  content: string;
  /** Logical source of the memory (e.g. 'prisma', 'qdrant', 'graph', 'cache') */
  source: string;
  /** Implementation-provided relevance (0-1). Opaque to caller. */
  relevance: number;
  /** Optional kind for context-building */
  kind?: MemoryKind;
  /** Optional level */
  level?: MemoryLevel;
  // ─── Provenance (for merged multi-backend results + explainability) ───────
  /** Which backend produced this hit (e.g. 'qdrant', 'redis', 'postgres', 'graph'). */
  backend?: string;
  /** Human-readable why (e.g. 'semantic similarity', 'recency', 'keyword match'). */
  reason?: string;
  /** Backend's own confidence in this hit (0-1). Distinct from merged relevance. */
  confidence?: number;
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
  levels?: MemoryLevel[];
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
 * A single dialogue turn. Request object so new fields (attachments, tool calls,
 * token counts) extend the API without breaking callers.
 */
export interface ConversationTurn {
  actor: string;
  session: string;
  role: string;
  content: string;
}

/**
 * ConversationLog — append-only dialogue turns.
 * NOT memory. Raw conversation. Memory is EXTRACTED from this by MemoryExtractor.
 */
export interface ConversationLog {
  append(turn: ConversationTurn): Promise<void>;
  recent(
    actor: string,
    session: string,
    limit?: number,
  ): Promise<Array<{ role: string; content: string; timestamp: number }>>;
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

/**
 * MemoryCompressor — turn a span of turns/memories into a compact summary.
 * ONE job: compression. HOW (map-reduce, LLM summarize, extractive) is implementation.
 * MemoryService orchestrates WHEN to call this (e.g. approaching token limits).
 */
export interface MemoryCompressor {
  /** Compress a session's history into a summary string (or null if nothing to compress). */
  compress(actor: string, session: string): Promise<string | null>;
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
   * Observe a conversation turn. The PRIMARY facade the Engine uses.
   * The Engine just says "I observed this turn" — the service coordinates
   * everything internally: ConversationLog.append → MemoryExtractor.extract →
   * MemoryStore.store → optional vector indexing. The Engine never orchestrates
   * logging and extraction by hand.
   */
  observe(turn: ConversationTurn): Promise<void>;

  /**
   * Remember something explicitly (bypasses extraction — caller already knows
   * this is worth storing). MemoryService decides WHERE and HOW to store it
   * (may go to MemoryStore, may go to vector index, may go to graph — caller doesn't know).
   * Takes a request object so new modalities extend the API without breaking callers.
   */
  remember(input: RememberRequest): Promise<void>;

  /**
   * Recall relevant memories for a context.
   * MemoryService orchestrates: which backends to query, how to merge, how to budget.
   * Returns ready-to-use context (compressed, deduplicated, budget-aware).
   */
  recall(ctx: RetrievalContext): Promise<RetrievedMemory[]>;

  /**
   * Forget a specific memory according to a policy (archive by default, hard-delete for GDPR).
   * Not an unconditional delete — the policy governs reversibility and audit retention.
   */
  forget(memoryId: string, policy: ForgetPolicy): Promise<boolean>;

  /**
   * Compress/summarize conversation history for a session.
   * Orchestration entrypoint: the service decides WHEN (token limits) and
   * delegates the actual work to a MemoryCompressor. The Engine calls this;
   * it never touches the compressor directly.
   */
  compress(actor: string, session: string): Promise<string | null>;
}
