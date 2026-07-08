// ============================================================================
// AI Core — VectorMemoryRetriever (PR-M05)
//
// Semantic retrieval behind the frozen MemoryRetriever port (ADR-005). Combines
// vector similarity with recency, pin, and keyword signals into a single hybrid
// score. Model-agnostic: the embedding model and vector backend are injected
// ports (ADR-003) — no provider is hardcoded, no default implementation shipped.
//
// Graceful fallback is handled UPSTREAM: DefaultMemoryService runs retrievers in
// parallel with Promise.allSettled and drops any that throw. Wire this retriever
// AND PrismaMemoryRetriever together — if the vector backend is down, this one
// throws, is dropped, and the keyword retriever still answers.
// ============================================================================

import type { MemoryRetriever, RetrievalContext, RetrievedMemory } from './memory-port';
import { asKind, asLevel } from './memory-port';
import type { MemoryRecordRow } from './prisma-memory-store';
import { type MemoryRetrieverPrismaClient, isRecallableState } from './prisma-memory-retriever';

// ─── Model-agnostic ports (interfaces + DI only, no defaults) ────────────────

/** Turns text into a vector. Backed by OpenAI / Bedrock / a Quant model / local. */
export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
}

/** A semantic hit: a memory logicalId and its similarity (0-1). */
export interface VectorQueryHit {
  id: string;
  score: number;
}

/** Vector index abstraction (Qdrant / pgvector / Pinecone all fit). */
export interface VectorBackend {
  readonly name: string;
  upsert(record: {
    id: string;
    vector: number[];
    ownerId: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  query(args: { vector: number[]; ownerId: string; limit: number }): Promise<VectorQueryHit[]>;
}

/** Hybrid score weights. Configurable; must be interpreted as relative. */
export interface RetrievalWeights {
  semantic: number;
  recency: number;
  pin: number;
  keyword: number;
}

export const DEFAULT_RETRIEVAL_WEIGHTS: RetrievalWeights = {
  semantic: 0.65,
  recency: 0.2,
  pin: 0.1,
  keyword: 0.05,
};

/** Per-retrieval observability record. Emitted via an injected sink (onTrace). */
export interface RetrievalTrace {
  backend: string;
  latencyMs: number;
  candidates: number;
  selected: number;
  weights: RetrievalWeights;
}

export interface VectorMemoryRetrieverOptions {
  embedder: EmbeddingProvider;
  vectorBackend: VectorBackend;
  /** Loader for hydrating candidate rows (same Prisma client as the store). */
  client: MemoryRetrieverPrismaClient;
  weights?: Partial<RetrievalWeights>;
  /** How many semantic candidates to fetch before hybrid re-ranking. */
  candidateLimit?: number;
  /** Recency half-window in ms (older than this contributes ~0 recency). */
  recencyWindowMs?: number;
  /** Optional observability sink. */
  onTrace?: (trace: RetrievalTrace) => void;
}

// ─── Implementation ───────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

export class VectorMemoryRetriever implements MemoryRetriever {
  private readonly embedder: EmbeddingProvider;
  private readonly vectorBackend: VectorBackend;
  private readonly client: MemoryRetrieverPrismaClient;
  private readonly weights: RetrievalWeights;
  private readonly candidateLimit: number;
  private readonly recencyWindowMs: number;
  private readonly onTrace: ((trace: RetrievalTrace) => void) | undefined;

  constructor(opts: VectorMemoryRetrieverOptions) {
    this.embedder = opts.embedder;
    this.vectorBackend = opts.vectorBackend;
    this.client = opts.client;
    this.weights = { ...DEFAULT_RETRIEVAL_WEIGHTS, ...(opts.weights ?? {}) };
    this.candidateLimit = opts.candidateLimit ?? 50;
    this.recencyWindowMs = opts.recencyWindowMs ?? 30 * DAY_MS;
    this.onTrace = opts.onTrace;
  }

  async retrieve(ctx: RetrievalContext): Promise<RetrievedMemory[]> {
    const start = Date.now();

    // 1. Embed the query and fetch semantic candidates (owner-scoped).
    const queryVector = await this.embedder.embed(ctx.query);
    const hits = await this.vectorBackend.query({
      vector: queryVector,
      ownerId: ctx.actor,
      limit: this.candidateLimit,
    });

    if (hits.length === 0) {
      this.trace(start, 0, 0);
      return [];
    }

    // 2. Hydrate the candidate rows (latest non-deleted version per logicalId).
    const ids = hits.map((h) => h.id);
    const rows = await this.client.memoryRecord.findMany({
      where: { logicalId: { in: ids }, deletedAt: null },
    });
    const rowById = latestByLogicalId(rows);

    // 3. Hybrid re-rank.
    const now = Date.now();
    const levels = ctx.levels && ctx.levels.length > 0 ? new Set<string>(ctx.levels) : null;
    const queryWords = new Set(
      ctx.query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );

    const results: RetrievedMemory[] = [];
    for (const hit of hits) {
      const row = rowById.get(hit.id);
      if (!row) continue;
      if (row.archivedAt !== null) continue;
      if (row.expiresAt !== null && row.expiresAt.getTime() <= now) continue;
      if (levels && !levels.has(row.level)) continue;
      if (!isRecallableState(row.metadata)) continue; // exclude pending/rejected

      const semantic = clamp01(hit.score);
      const recency = this.recencyScore(row.createdAt.getTime(), now);
      const pin = row.pinned ? 1 : 0;
      const keyword = keywordScore(queryWords, row.content);

      const relevance =
        this.weights.semantic * semantic +
        this.weights.recency * recency +
        this.weights.pin * pin +
        this.weights.keyword * keyword;

      results.push({
        id: row.logicalId,
        content: row.content,
        source: 'vector',
        relevance,
        kind: asKind(row.kind),
        level: asLevel(row.level),
        backend: this.vectorBackend.name,
        reason: 'hybrid',
        confidence: semantic,
      });
    }

    results.sort((a, b) => b.relevance - a.relevance);
    const selected = ctx.limit !== undefined ? results.slice(0, ctx.limit) : results;
    this.trace(start, hits.length, selected.length);
    return selected;
  }

  private recencyScore(createdAtMs: number, now: number): number {
    const age = now - createdAtMs;
    if (age <= 0) return 1;
    return Math.max(0, 1 - age / this.recencyWindowMs);
  }

  private trace(start: number, candidates: number, selected: number): void {
    if (!this.onTrace) return;
    this.onTrace({
      backend: this.vectorBackend.name,
      latencyMs: Date.now() - start,
      candidates,
      selected,
      weights: this.weights,
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function latestByLogicalId(rows: MemoryRecordRow[]): Map<string, MemoryRecordRow> {
  const map = new Map<string, MemoryRecordRow>();
  for (const row of rows) {
    const existing = map.get(row.logicalId);
    if (!existing || row.version > existing.version) map.set(row.logicalId, row);
  }
  return map;
}

function keywordScore(queryWords: Set<string>, content: string): number {
  if (queryWords.size === 0) return 0;
  const words = content
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  let overlap = 0;
  for (const q of queryWords) {
    const hit = words.some(
      (w) => w === q || (w.length >= 3 && q.length >= 3 && (w.includes(q) || q.includes(w))),
    );
    if (hit) overlap++;
  }
  return overlap / queryWords.size;
}
