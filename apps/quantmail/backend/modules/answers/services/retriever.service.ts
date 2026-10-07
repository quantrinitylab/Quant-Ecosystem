// ============================================================================
// Answers module — authz-scoped Retriever (Pillar 4: Perplexity answer engine)
// quantmail-superhub · Task 15.1 (Requirements 8.1, 8.4)
//                    · Task 15.2 (Requirement 8.5) — fusion + rerank
// ============================================================================
//
// PURPOSE
//   Implements the entry point of the Retriever interface
//   (design §"INTERFACE Retriever"):
//
//       FUNCTION retrieve(userId, query, sources, k) RETURNS RankedChunk[]
//         POSTCONDITION: results carry source provenance (emailId / repo+path / url)
//
//   The Retriever is the retrieval half of the RAG answer engine. It turns a
//   user's natural-language query into a ranked list of `RankedChunk`s drawn
//   from that user's OWN data (email, repos, optionally the web), each carrying
//   the provenance needed for the Answer Engine to cite it (Task 16.1).
//
//   Two guarantees are enforced here:
//
//     1. PER-USER OWNERSHIP FILTER (Requirement 8.1) — retrieval is restricted
//        to documents the asking user owns and NEVER returns a document owned
//        by another user. This is defence-in-depth:
//          (a) the `userId` is pushed DOWN into both store queries (the vector
//              store and the keyword store) so the authz filter is applied at
//              the source, and
//          (b) every chunk that comes back is DEFENSIVELY re-checked here — any
//              chunk whose `userId` does not match the asking user is dropped
//              (fail closed). A misconfigured/over-broad store can never leak
//              another tenant's chunk through the Retriever.
//
//     2. SOURCE PROVENANCE (Requirement 8.4) — every returned `RankedChunk`
//        carries a `provenance` discriminated union: `emailId` for an email
//        chunk, `repo`+`path`(+`commit`) for a repo chunk, and `url` for a web
//        chunk. A chunk whose stored `sourceRef` cannot be resolved into a
//        valid provenance is dropped rather than returned without attribution
//        (the postcondition must hold for every emitted chunk).
//
// SEAMS / TESTABILITY
//   The vector store (Qdrant/pgvector), the keyword store (Meilisearch), and
//   the query embedder (`@quant/ai`) are all hidden behind injectable ports
//   (`VectorSearchPort`, `KeywordSearchPort`, `EmbeddingPort`). This keeps the
//   authz + provenance logic pure and unit-testable offline (the in-memory
//   ports below are the default), while the production wiring injects adapters
//   that target the real Qdrant/pgvector + Meilisearch indexes populated by the
//   `search-indexer` infra service (which already consumes Kafka CDC).
//
// FUSION + RERANK (Task 15.2, Requirement 8.5)
//   The two stores return independently-ranked hit lists in different score
//   spaces (cosine similarity vs. lexical overlap), so their raw scores are not
//   comparable. Rather than the earlier naive "take the max score and union the
//   sources" combine, the Retriever now fuses the two RANKED lists with
//   **Reciprocal Rank Fusion (RRF)**:
//
//       fusedScore(chunk) = Σ_store  weight[store] / (rrfK + rank_store(chunk))
//
//   where `rank_store(chunk)` is the chunk's 1-based position in that store's
//   eligible result list and `rrfK` is a smoothing constant (Cormack et al.).
//   RRF is rank-based, so it is robust to incomparable score scales, and a
//   chunk surfaced highly by BOTH stores accumulates contributions from both —
//   so it outranks a chunk surfaced highly by only one. The `rrfK` constant and
//   the per-store `weights` are configurable (constructor `fusion` dep and/or a
//   per-call override), with sensible defaults ({@link DEFAULT_RRF_K},
//   {@link DEFAULT_STORE_WEIGHTS}).
//
//   An optional cross-encoder {@link RerankPort} is an injectable seam applied
//   to the fused candidate list. When none is injected (the offline default),
//   the RRF ordering itself is the final rerank, so the Retriever stays fully
//   testable without a live reranker model. Ownership (Req 8.1) and provenance
//   (Req 8.4) guarantees from Task 15.1 are preserved: foreign or
//   unattributable chunks are dropped BEFORE rank assignment, so they never
//   influence the fused ranking nor leak through.
//
//   Grounded generation with citations remains Task 16.1.

import { createAppError } from '@quant/server-core';
// Cross-cutting ownership filter (Task 23.1, Req 22.1/22.3): the Retriever
// INHERITS the mail-domain ownership rule via an injectable port rather than
// re-deriving the `userId` check inline, so the answer engine and the mail
// domain agree on "who may read a chunk". Imported from neutral shared infra
// (not a sibling module's services), so no module boundary is crossed.
import { ownerOnlyAuthz, type OwnershipAuthzPort } from '../../../shared/ownership-authz';
// Observability (Task 23.1, Req 23.2): every retrieval operation emits a span.
import { noopSpanPort, withSpan, type SpanPort } from '../../../shared/observability';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** The three corpora a chunk can originate from (mirrors Prisma `DocumentChunkSource`). */
export type SourceType = 'email' | 'repo' | 'web';

/** All known source types, in a stable order. */
export const ALL_SOURCE_TYPES: readonly SourceType[] = ['email', 'repo', 'web'] as const;

/**
 * The raw provenance reference stored alongside a chunk (`DocumentChunk.sourceRef`).
 * Its shape depends on the chunk's `sourceType`:
 *   - email → `{ emailId }`
 *   - repo  → `{ repo, path, commit? }`
 *   - web   → `{ url }`
 * Stored as JSON, so it is modelled here as an open record and validated when
 * derived into a {@link ChunkProvenance}.
 */
export type SourceRef = Record<string, unknown>;

/**
 * Resolved, type-safe provenance attached to every returned chunk
 * (Requirement 8.4). A discriminated union so the Answer Engine can render the
 * right citation shape per source.
 */
export type ChunkProvenance =
  | { kind: 'email'; emailId: string }
  | { kind: 'repo'; repo: string; path: string; commit?: string }
  | { kind: 'web'; url: string };

/**
 * A chunk as returned by a store (vector or keyword). Carries everything the
 * Retriever needs to apply the ownership filter and derive provenance.
 */
export interface RetrievableChunk {
  /** Stable chunk id (`DocumentChunk.id`). */
  id: string;
  /** OWNER of the chunk — the ownership-filter key (Requirement 8.1). */
  userId: string;
  sourceType: SourceType;
  /** Raw provenance reference; resolved into {@link ChunkProvenance}. */
  sourceRef: SourceRef;
  /** The chunk's text content. */
  text: string;
  /** Vector-store point id (Qdrant), when known. */
  embeddingId?: string | null;
}

/** Which store(s) surfaced a chunk in this retrieval. */
export type RetrievedBy = 'vector' | 'keyword';

/**
 * A ranked, attributable chunk — the Retriever's output element.
 * POSTCONDITION (Req 8.4): `provenance` is always present and well-formed.
 */
export interface RankedChunk {
  chunkId: string;
  /** Always equal to the asking user (Requirement 8.1, asserted defensively). */
  userId: string;
  sourceType: SourceType;
  text: string;
  /** Relevance score; higher is more relevant. */
  score: number;
  /** Which store(s) surfaced this chunk (union when both did). */
  retrievedBy: RetrievedBy[];
  /** Source attribution for citation (emailId / repo+path / url). */
  provenance: ChunkProvenance;
}

// ---------------------------------------------------------------------------
// Injectable ports (seams)
// ---------------------------------------------------------------------------

/** Common parameters every store query receives. `userId` is the authz filter. */
export interface StoreSearchParams {
  /** The asking user. Stores MUST scope results to chunks owned by this user. */
  userId: string;
  /** The natural-language query. */
  query: string;
  /** Max number of hits to return. */
  k: number;
  /** Restrict to these corpora (already validated & non-empty). */
  sources: SourceType[];
}

/** A single hit from a store, pairing the chunk with its store-local score. */
export interface StoreHit {
  chunk: RetrievableChunk;
  /** Store-local relevance score; higher is more relevant. */
  score: number;
}

/**
 * Embeds the query into a dense vector. The production adapter delegates to
 * `@quant/ai` (`UnifiedAIService.generateEmbedding`) — which fails closed in
 * production when no provider is configured (Phase-1 behaviour), so the
 * Retriever inherits that fail-closed property for free.
 */
export interface EmbeddingPort {
  embedQuery(text: string): Promise<number[]>;
}

/**
 * Vector (kNN) search over Qdrant/pgvector. The adapter MUST apply the
 * `userId` ownership filter inside the store query (not only on the way out).
 */
export interface VectorSearchPort {
  search(params: StoreSearchParams & { embedding: number[] }): Promise<StoreHit[]>;
}

/**
 * Keyword (lexical) search over Meilisearch. The adapter MUST apply the
 * `userId` ownership filter inside the store query.
 */
export interface KeywordSearchPort {
  search(params: StoreSearchParams): Promise<StoreHit[]>;
}

// ---------------------------------------------------------------------------
// Fusion + rerank seams (Task 15.2, Requirement 8.5)
// ---------------------------------------------------------------------------

/**
 * Tunables for Reciprocal Rank Fusion. Both fields are optional; omitted values
 * fall back to {@link DEFAULT_RRF_K} / {@link DEFAULT_STORE_WEIGHTS}.
 */
export interface FusionConfig {
  /**
   * The RRF smoothing constant `k` (Cormack et al. 2009). Larger values flatten
   * the rank-weighting curve (later ranks matter relatively more); smaller
   * values sharpen the preference for top ranks. MUST be > 0.
   */
  rrfK?: number;
  /**
   * Per-store multiplier applied to that store's RRF contribution. Lets callers
   * bias the fusion toward semantic (`vector`) or lexical (`keyword`) recall.
   * MUST be >= 0. A weight of 0 effectively ignores that store's ranking.
   */
  weights?: Partial<Record<RetrievedBy, number>>;
}

/** Default RRF constant — the canonical value from the RRF literature. */
export const DEFAULT_RRF_K = 60;

/** Default per-store weights — both stores contribute equally. */
export const DEFAULT_STORE_WEIGHTS: Readonly<Record<RetrievedBy, number>> = {
  vector: 1,
  keyword: 1,
};

/**
 * Optional cross-encoder reranker seam. Given the query and the RRF-fused
 * candidate list, it returns a re-ordered list. Production can inject a
 * cross-encoder model adapter; when no reranker is injected, the RRF ordering
 * is used as-is, keeping the Retriever offline-testable (no live model).
 *
 * A reranker MUST NOT introduce new chunks or violate ownership/provenance — it
 * only re-orders (and may drop) the candidates it is given. The Retriever still
 * caps the final list at `k` after reranking.
 */
export interface RerankPort {
  rerank(query: string, candidates: RankedChunk[]): Promise<RankedChunk[]>;
}

/** Per-call retrieval options (currently: fusion-config overrides). */
export interface RetrieveOptions {
  /** Override the constructor-level {@link FusionConfig} for this call. */
  fusion?: FusionConfig;
}

// ---------------------------------------------------------------------------
// Provenance derivation (Requirement 8.4)
// ---------------------------------------------------------------------------

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Resolve a stored `sourceRef` into a typed {@link ChunkProvenance}.
 * Returns `null` (so the chunk is dropped) when the ref is malformed for its
 * declared `sourceType` — the provenance postcondition must hold for every
 * emitted chunk, so a chunk we cannot attribute is never returned.
 */
export function deriveProvenance(
  sourceType: SourceType,
  sourceRef: SourceRef,
): ChunkProvenance | null {
  if (sourceRef == null || typeof sourceRef !== 'object') return null;

  switch (sourceType) {
    case 'email': {
      const emailId = asNonEmptyString(sourceRef['emailId']);
      return emailId ? { kind: 'email', emailId } : null;
    }
    case 'repo': {
      const repo = asNonEmptyString(sourceRef['repo']);
      const path = asNonEmptyString(sourceRef['path']);
      if (!repo || !path) return null;
      const commit = asNonEmptyString(sourceRef['commit']);
      return commit
        ? { kind: 'repo', repo, path, commit }
        : { kind: 'repo', repo, path };
    }
    case 'web': {
      const url = asNonEmptyString(sourceRef['url']);
      return url ? { kind: 'web', url } : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Retriever
// ---------------------------------------------------------------------------

export interface RetrieverDeps {
  embedder: EmbeddingPort;
  vectorStore: VectorSearchPort;
  keywordStore: KeywordSearchPort;
  /**
   * Optional RRF tunables (Task 15.2). Defaults to {@link DEFAULT_RRF_K} +
   * {@link DEFAULT_STORE_WEIGHTS} when omitted. Can be overridden per call via
   * {@link RetrieveOptions.fusion}.
   */
  fusion?: FusionConfig;
  /**
   * Optional cross-encoder reranker (Task 15.2). When omitted, the RRF ordering
   * is the final order — so the Retriever needs no live reranker model offline.
   */
  reranker?: RerankPort;
  /**
   * Cross-cutting ownership filter (Task 23.1, Req 22.1/22.3). Decides whether
   * the asking user may read a candidate chunk; defaults to {@link
   * ownerOnlyAuthz} — the same owner-only rule the mail domain enforces — so a
   * chunk owned by another user/tenant is dropped before ranking. Production
   * wires the shared mail-domain adapter; tests can inject a spy/policy.
   */
  authz?: OwnershipAuthzPort;
  /**
   * Optional observability span port (Task 23.1, Req 23.2). When wired, each
   * `retrieve` call emits an `answers.retrieve` span; defaults to a no-op.
   */
  tracer?: SpanPort;
}

/** Default number of chunks to retrieve when the caller does not specify `k`. */
export const DEFAULT_RETRIEVAL_K = 8;

export class Retriever {
  private readonly embedder: EmbeddingPort;
  private readonly vectorStore: VectorSearchPort;
  private readonly keywordStore: KeywordSearchPort;
  private readonly fusion: FusionConfig;
  private readonly reranker?: RerankPort;
  private readonly authz: OwnershipAuthzPort;
  private readonly tracer: SpanPort;

  constructor(deps: RetrieverDeps) {
    this.embedder = deps.embedder;
    this.vectorStore = deps.vectorStore;
    this.keywordStore = deps.keywordStore;
    this.fusion = deps.fusion ?? {};
    this.reranker = deps.reranker;
    this.authz = deps.authz ?? ownerOnlyAuthz;
    this.tracer = deps.tracer ?? noopSpanPort;
  }

  /**
   * Retrieve the top-`k` chunks relevant to `query` from the asking user's own
   * corpora, each carrying source provenance.
   *
   * @param userId  the asking user — the ownership-filter key (Req 8.1).
   * @param query   the natural-language query.
   * @param sources optional subset of corpora to search; defaults to all.
   * @param k       optional max number of chunks; defaults to {@link DEFAULT_RETRIEVAL_K}.
   *
   * @throws 400 USER_REQUIRED   when `userId` is empty.
   * @throws 400 QUERY_REQUIRED  when `query` is empty/whitespace.
   * @throws 400 INVALID_K       when `k` is not a positive integer.
   * @throws 400 INVALID_SOURCES when `sources` contains no valid corpus.
   */
  async retrieve(
    userId: string,
    query: string,
    sources?: SourceType[],
    k: number = DEFAULT_RETRIEVAL_K,
    options?: RetrieveOptions,
  ): Promise<RankedChunk[]> {
    // ----- 0. Validate inputs ---------------------------------------------
    if (typeof userId !== 'string' || userId.trim().length === 0) {
      throw createAppError('A userId is required to retrieve', 400, 'USER_REQUIRED');
    }
    if (typeof query !== 'string' || query.trim().length === 0) {
      throw createAppError('A non-empty query is required to retrieve', 400, 'QUERY_REQUIRED');
    }
    if (!Number.isInteger(k) || k <= 0) {
      throw createAppError('k must be a positive integer', 400, 'INVALID_K');
    }

    const resolvedSources = this.resolveSources(sources);

    const params: StoreSearchParams = {
      userId,
      query,
      k,
      sources: resolvedSources,
    };

    // Every retrieval operation emits a span (Req 23.2). Input validation above
    // runs OUTSIDE the span; the retrieval work (embed + store queries + fuse +
    // rerank) runs inside, so the span's status reflects the retrieval itself.
    return withSpan(
      this.tracer,
      'answers.retrieve',
      {
        'answers.user_id': userId,
        'answers.k': k,
        'answers.sources': resolvedSources.join(','),
        'answers.query_length': query.length,
      },
      async (span) => {
        // ----- 1. Embed the query (fail-closed @quant/ai) ------------------
        const embedding = await this.embedder.embedQuery(query);

        // ----- 2. Query BOTH stores, ALWAYS scoped to the owner (Req 8.1) --
        // The userId is pushed into each store query so the authz filter is
        // applied at the source. Run the two independent queries concurrently.
        const [vectorHits, keywordHits] = await Promise.all([
          this.vectorStore.search({ ...params, embedding }),
          this.keywordStore.search(params),
        ]);

        // ----- 3. Fuse the two ranked lists with RRF + rerank (Req 8.5) ----
        // Each store returns an independently RANKED hit list in its own score
        // space (cosine vs. lexical), so raw scores are not comparable. We fuse
        // by RANK using Reciprocal Rank Fusion, dropping foreign/unattributable
        // chunks BEFORE rank assignment so the ownership (Req 8.1/22.1) +
        // provenance (Req 8.4) guarantees hold and dropped chunks never perturb
        // the ranking.
        const fused = this.fuse(
          [
            { store: 'vector', hits: vectorHits },
            { store: 'keyword', hits: keywordHits },
          ],
          userId,
          resolvedSources,
          options?.fusion,
        );

        // ----- 4. Optional cross-encoder rerank, then cap at k -------------
        // With no injected reranker, the RRF ordering IS the final order
        // (offline default — no live model required). A reranker only re-orders
        // the fused candidates; the final list is still capped at k.
        const reranked = this.reranker ? await this.reranker.rerank(query, fused) : fused;
        const results = reranked.slice(0, k);

        span.setAttributes({
          'answers.vector_hits': vectorHits.length,
          'answers.keyword_hits': keywordHits.length,
          'answers.result_count': results.length,
        });

        return results;
      },
    );
  }

  /**
   * Reciprocal Rank Fusion of per-store ranked hit lists into a single ranked,
   * attributable `RankedChunk[]`.
   *
   * For each store, eligible hits (owned by `userId`, in `resolvedSources`, with
   * derivable provenance) are walked in store-rank order; the hit at 1-based
   * rank `r` contributes `weight[store] / (rrfK + r)` to its chunk's fused
   * score. Contributions accumulate across stores, so a chunk ranked highly by
   * both stores beats one ranked highly by a single store. The result is sorted
   * by fused score (desc) with a deterministic `chunkId` tie-break, and
   * `retrievedBy` records every store that surfaced the chunk.
   */
  private fuse(
    perStore: Array<{ store: RetrievedBy; hits: StoreHit[] }>,
    userId: string,
    resolvedSources: SourceType[],
    override?: FusionConfig,
  ): RankedChunk[] {
    const rrfK = this.resolveRrfK(override);
    const weights = this.resolveWeights(override);

    const fused = new Map<string, RankedChunk>();

    for (const { store, hits } of perStore) {
      const weight = weights[store];
      let rank = 0; // 1-based rank among ELIGIBLE hits in this store only

      for (const hit of hits) {
        const { chunk } = hit;

        // (a) Ownership: never surface another user's chunk (Req 8.1/22.1).
        //     The decision is delegated to the injectable ownership filter so
        //     the answer engine INHERITS the mail-domain rule (Req 22.3).
        if (
          !this.authz.isAuthorized(
            { principalId: userId },
            { ownerId: chunk.userId, kind: 'chunk', resourceId: chunk.id },
          )
        ) {
          continue;
        }
        // (b) Respect the requested corpora.
        if (!resolvedSources.includes(chunk.sourceType)) continue;
        // (c) Provenance must be derivable (Req 8.4 postcondition).
        const provenance = deriveProvenance(chunk.sourceType, chunk.sourceRef);
        if (!provenance) continue;

        rank += 1;
        const contribution = weight / (rrfK + rank);

        const existing = fused.get(chunk.id);
        if (existing) {
          // Surfaced by this store too: accumulate the RRF contribution and
          // record that both stores contributed.
          existing.score += contribution;
          if (!existing.retrievedBy.includes(store)) existing.retrievedBy.push(store);
        } else {
          fused.set(chunk.id, {
            chunkId: chunk.id,
            userId: chunk.userId,
            sourceType: chunk.sourceType,
            text: chunk.text,
            score: contribution,
            retrievedBy: [store],
            provenance,
          });
        }
      }
    }

    // Stable ordering: fused score desc, then chunkId asc for determinism.
    return [...fused.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.chunkId < b.chunkId ? -1 : a.chunkId > b.chunkId ? 1 : 0;
    });
  }

  /** Resolve the effective RRF constant (per-call override → ctor → default). */
  private resolveRrfK(override?: FusionConfig): number {
    const candidate = override?.rrfK ?? this.fusion.rrfK ?? DEFAULT_RRF_K;
    return Number.isFinite(candidate) && candidate > 0 ? candidate : DEFAULT_RRF_K;
  }

  /** Resolve the effective per-store weights (per-call override → ctor → default). */
  private resolveWeights(override?: FusionConfig): Record<RetrievedBy, number> {
    const merged: Partial<Record<RetrievedBy, number>> = {
      ...this.fusion.weights,
      ...override?.weights,
    };
    const pick = (store: RetrievedBy): number => {
      const w = merged[store];
      return typeof w === 'number' && Number.isFinite(w) && w >= 0
        ? w
        : DEFAULT_STORE_WEIGHTS[store];
    };
    return { vector: pick('vector'), keyword: pick('keyword') };
  }

  /** Validate/normalize the requested corpora; default to all when omitted. */
  private resolveSources(sources?: SourceType[]): SourceType[] {
    if (sources == null) return [...ALL_SOURCE_TYPES];
    const valid = sources.filter((s): s is SourceType =>
      (ALL_SOURCE_TYPES as readonly string[]).includes(s),
    );
    // De-duplicate while preserving the canonical order.
    const unique = ALL_SOURCE_TYPES.filter((s) => valid.includes(s));
    if (unique.length === 0) {
      throw createAppError(
        'sources must include at least one of: email, repo, web',
        400,
        'INVALID_SOURCES',
      );
    }
    return [...unique];
  }
}
