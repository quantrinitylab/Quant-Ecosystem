// ============================================================================
// Answers module — Retriever ports: adapters + offline test doubles
// quantmail-superhub · Task 15.1 (Requirements 8.1, 8.4)
// ============================================================================
//
// PURPOSE
//   Concrete implementations of the Retriever's injectable seams
//   (`EmbeddingPort`, `VectorSearchPort`, `KeywordSearchPort`):
//
//     • `createUnifiedEmbeddingPort` — embeds the query via `@quant/ai`
//       (`UnifiedAIService.generateEmbedding`). Because that engine fails
//       closed in production (Phase-1), the Retriever inherits fail-closed
//       query embedding for free.
//
//     • In-memory ports (`InMemoryVectorSearchPort`, `InMemoryKeywordSearchPort`)
//       — a dependency-free corpus that applies the userId ownership filter and
//       the source filter exactly as a real store must. These are the DEFAULT
//       ports so the Retriever is fully testable offline (no Qdrant/Meilisearch
//       required), and they double as a reference for the authz contract.
//
//     • Store-backed seam adapters (`createVectorStoreSearchPort`,
//       `createKeywordStoreSearchPort`) — thin adapters that target the real
//       Qdrant/pgvector + Meilisearch indexes (populated by the `search-indexer`
//       infra service via Kafka CDC). They push the `userId` filter DOWN into
//       the store query and map raw store rows into `RetrievableChunk`s. The
//       low-level store client is itself a port, so the real HTTP/SQL clients
//       drop in without touching Retriever policy code.
//
//   SCOPE: these are the Task 15.1 seams. Fusion/rerank logic is Task 15.2.

import type {
  EmbeddingPort,
  KeywordSearchPort,
  RetrievableChunk,
  SourceType,
  StoreHit,
  StoreSearchParams,
  VectorSearchPort,
} from './retriever.service';

// ---------------------------------------------------------------------------
// Embedding adapter over @quant/ai (fail-closed in production)
// ---------------------------------------------------------------------------

/**
 * The narrow slice of `@quant/ai`'s `UnifiedAIService` the Retriever needs.
 * Declared structurally so the real service satisfies it without a hard import
 * and tests can supply a tiny stub.
 */
export interface QueryEmbeddingEngine {
  generateEmbedding(text: string): Promise<number[]>;
}

/**
 * Adapt a `@quant/ai` engine into an {@link EmbeddingPort}. The engine's own
 * fail-closed behaviour (no silent mock in production) is preserved — a
 * provider outage surfaces as a thrown error from `embedQuery`, so retrieval
 * fails closed rather than embedding the query with a fake vector.
 */
export function createUnifiedEmbeddingPort(engine: QueryEmbeddingEngine): EmbeddingPort {
  return {
    embedQuery(text: string): Promise<number[]> {
      return engine.generateEmbedding(text);
    },
  };
}

// ---------------------------------------------------------------------------
// Scoring helpers (used by the in-memory ports)
// ---------------------------------------------------------------------------

/** Cosine similarity in [-1, 1]; 0 when either vector is empty/zero. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Naive lexical overlap score: fraction of distinct query terms present. */
export function lexicalScore(query: string, text: string): number {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return 0;
  const haystack = text.toLowerCase();
  const distinct = new Set(terms);
  let hits = 0;
  for (const term of distinct) {
    if (haystack.includes(term)) hits++;
  }
  return hits / distinct.size;
}

// ---------------------------------------------------------------------------
// In-memory corpus (the default, offline-testable ports)
// ---------------------------------------------------------------------------

/** A chunk plus its precomputed embedding, as held by the in-memory corpus. */
export interface InMemoryChunk extends RetrievableChunk {
  /** Dense embedding for vector search; optional for keyword-only chunks. */
  embedding?: number[];
}

/**
 * Apply the ownership + source filters that EVERY store must honour. Centralised
 * so the in-memory vector and keyword ports enforce the exact same authz rule
 * (Requirement 8.1): a chunk is eligible only if it is owned by the asking user
 * AND belongs to one of the requested corpora.
 */
function eligible(chunk: RetrievableChunk, params: StoreSearchParams): boolean {
  return chunk.userId === params.userId && params.sources.includes(chunk.sourceType);
}

/** In-memory vector store: cosine kNN over an owned, source-filtered corpus. */
export class InMemoryVectorSearchPort implements VectorSearchPort {
  constructor(private readonly corpus: InMemoryChunk[] = []) {}

  add(...chunks: InMemoryChunk[]): this {
    this.corpus.push(...chunks);
    return this;
  }

  async search(params: StoreSearchParams & { embedding: number[] }): Promise<StoreHit[]> {
    const hits: StoreHit[] = [];
    for (const chunk of this.corpus) {
      if (!eligible(chunk, params)) continue; // authz + source filter in-store
      const score = cosineSimilarity(params.embedding, chunk.embedding ?? []);
      hits.push({ chunk: stripEmbedding(chunk), score });
    }
    return sortAndCap(hits, params.k);
  }
}

/** In-memory keyword store: lexical overlap over an owned, source-filtered corpus. */
export class InMemoryKeywordSearchPort implements KeywordSearchPort {
  constructor(private readonly corpus: InMemoryChunk[] = []) {}

  add(...chunks: InMemoryChunk[]): this {
    this.corpus.push(...chunks);
    return this;
  }

  async search(params: StoreSearchParams): Promise<StoreHit[]> {
    const hits: StoreHit[] = [];
    for (const chunk of this.corpus) {
      if (!eligible(chunk, params)) continue; // authz + source filter in-store
      const score = lexicalScore(params.query, chunk.text);
      if (score <= 0) continue;
      hits.push({ chunk: stripEmbedding(chunk), score });
    }
    return sortAndCap(hits, params.k);
  }
}

function stripEmbedding(chunk: InMemoryChunk): RetrievableChunk {
  // The Retriever never needs the raw vector; return a clean RetrievableChunk.
  const { embedding: _embedding, ...rest } = chunk;
  void _embedding;
  return rest;
}

function sortAndCap(hits: StoreHit[], k: number): StoreHit[] {
  return hits
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.chunk.id < b.chunk.id ? -1 : a.chunk.id > b.chunk.id ? 1 : 0;
    })
    .slice(0, k);
}

// ---------------------------------------------------------------------------
// Store-backed seam adapters (Qdrant/pgvector + Meilisearch)
// ---------------------------------------------------------------------------

/**
 * Low-level vector store client (Qdrant/pgvector). The adapter ALWAYS passes
 * `userId` so the authz filter is applied inside the store query. The real
 * client issues a Qdrant `search` with a `userId` payload filter, or a pgvector
 * `ORDER BY embedding <-> $1 WHERE user_id = $2` query.
 */
export interface VectorStoreClient {
  query(input: {
    userId: string;
    embedding: number[];
    k: number;
    sourceTypes: SourceType[];
  }): Promise<StoreHit[]>;
}

/**
 * Low-level keyword store client (Meilisearch). The adapter ALWAYS passes
 * `userId` so the index query filters on the owner attribute
 * (`filter: userId = ...`).
 */
export interface KeywordStoreClient {
  query(input: {
    userId: string;
    query: string;
    k: number;
    sourceTypes: SourceType[];
  }): Promise<StoreHit[]>;
}

/**
 * Wrap a {@link VectorStoreClient} as a {@link VectorSearchPort}, forwarding the
 * owner filter into the store query (Requirement 8.1, defence-in-depth layer a).
 */
export function createVectorStoreSearchPort(client: VectorStoreClient): VectorSearchPort {
  return {
    search(params) {
      return client.query({
        userId: params.userId,
        embedding: params.embedding,
        k: params.k,
        sourceTypes: params.sources,
      });
    },
  };
}

/**
 * Wrap a {@link KeywordStoreClient} as a {@link KeywordSearchPort}, forwarding
 * the owner filter into the store query (Requirement 8.1).
 */
export function createKeywordStoreSearchPort(client: KeywordStoreClient): KeywordSearchPort {
  return {
    search(params) {
      return client.query({
        userId: params.userId,
        query: params.query,
        k: params.k,
        sourceTypes: params.sources,
      });
    },
  };
}
