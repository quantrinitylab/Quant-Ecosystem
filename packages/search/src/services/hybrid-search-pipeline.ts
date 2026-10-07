// ============================================================================
// Hybrid Search Pipeline - Full orchestration: BM25 + Vector + Reranker + Explain
// ============================================================================

import type { SearchClient } from './search-client';
import type { VectorClient } from './vector-client';
import type { CohereReranker, RerankResult } from './reranker';
import type { EmbeddingProvider } from './embedding-indexer';
import {
  HybridSearchEngine,
  type HybridSearchOptions,
  type HybridSearchResult,
} from './hybrid-search';
import { SearchExplainer, type ExplanationResult, type ExplainContext } from './search-explainer';

/** Final pipeline result with explanation */
export interface PipelineSearchResult {
  id: string;
  score: number;
  document: Record<string, unknown>;
  explanation: ExplanationResult;
}

/** Options for the pipeline search */
export interface PipelineSearchOptions {
  index: string;
  collection: string;
  limit?: number;
  bm25Weight?: number;
  vectorWeight?: number;
  rerankerTopN?: number;
  filter?: string | string[];
  vectorFilter?: HybridSearchOptions['vectorFilter'];
  explainContext?: Partial<ExplainContext>;
}

export interface HybridSearchPipelineOptions {
  defaultLimit?: number;
  defaultRerankerTopN?: number;
}

/**
 * HybridSearchPipeline - Single entry point for all search requests
 *
 * Orchestrates:
 * 1. Generate query embedding via EmbeddingProvider
 * 2. Parallel BM25 + vector search (via HybridSearchEngine)
 * 3. Fuse scores
 * 4. Rerank top-50 via Cohere
 * 5. Attach explanations via SearchExplainer
 * 6. Return final results
 *
 * Graceful fallback: if reranker fails, return fused results.
 * If vector fails, return BM25-only. If BM25 fails, return vector-only.
 */
export class HybridSearchPipeline {
  private readonly searchClient: SearchClient;
  private readonly vectorClient: VectorClient;
  private readonly reranker: CohereReranker;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly hybridEngine: HybridSearchEngine;
  private readonly explainer: SearchExplainer;
  private readonly defaultLimit: number;
  private readonly defaultRerankerTopN: number;

  constructor(
    searchClient: SearchClient,
    vectorClient: VectorClient,
    reranker: CohereReranker,
    embeddingProvider: EmbeddingProvider,
    options?: HybridSearchPipelineOptions,
  ) {
    this.searchClient = searchClient;
    this.vectorClient = vectorClient;
    this.reranker = reranker;
    this.embeddingProvider = embeddingProvider;
    this.hybridEngine = new HybridSearchEngine(searchClient, vectorClient);
    this.explainer = new SearchExplainer();
    this.defaultLimit = options?.defaultLimit ?? 10;
    this.defaultRerankerTopN = options?.defaultRerankerTopN ?? 10;
  }

  async search(query: string, options: PipelineSearchOptions): Promise<PipelineSearchResult[]> {
    const limit = options.limit ?? this.defaultLimit;
    const rerankerTopN = options.rerankerTopN ?? this.defaultRerankerTopN;

    // Step 1: Generate query embedding
    let embedding: number[];
    try {
      const [emb] = await this.embeddingProvider.embed([query]);
      embedding = emb!;
    } catch {
      // If embedding fails, fall back to BM25-only search
      return this.fallbackBm25Only(query, options, limit);
    }

    // Step 2+3: Hybrid search (BM25 + vector fusion)
    let fusedResults: HybridSearchResult[];
    try {
      fusedResults = await this.hybridEngine.hybridSearch(query, embedding, {
        index: options.index,
        collection: options.collection,
        limit: 50,
        bm25Weight: options.bm25Weight ?? 0.7,
        vectorWeight: options.vectorWeight ?? 0.3,
        filter: options.filter,
        vectorFilter: options.vectorFilter,
      });
    } catch {
      // If both fail, try each independently
      fusedResults = await this.fallbackIndividualSearch(query, embedding, options);
    }

    if (fusedResults.length === 0) {
      return [];
    }

    // Step 4: Rerank top-50 via Cohere
    let finalResults: HybridSearchResult[];
    try {
      const docsForRerank = fusedResults.slice(0, 50).map((r) => ({
        id: r.id,
        text: this.extractText(r.document),
        score: r.score,
      }));

      const reranked: RerankResult[] = await this.reranker.rerank(
        query,
        docsForRerank,
        rerankerTopN,
      );

      // Map reranked results back to hybrid results with reranker score
      finalResults = reranked.map((rr) => {
        const original = fusedResults.find((f) => f.id === rr.id) ?? fusedResults[0]!;
        return {
          ...original,
          score: rr.relevanceScore,
          document: {
            ...original.document,
            rerankerScore: rr.relevanceScore,
          },
        };
      });
    } catch {
      // Fallback: return fused results without reranking
      finalResults = fusedResults.slice(0, limit);
    }

    // Step 5: Attach explanations
    const explainContext: ExplainContext = {
      query,
      userTopics: options.explainContext?.userTopics,
      userFollowing: options.explainContext?.userFollowing,
      trendingTopics: options.explainContext?.trendingTopics,
    };

    return finalResults.slice(0, limit).map((result) => ({
      id: result.id,
      score: result.score,
      document: result.document,
      explanation: this.explainer.explain(result, explainContext),
    }));
  }

  private async fallbackBm25Only(
    query: string,
    options: PipelineSearchOptions,
    limit: number,
  ): Promise<PipelineSearchResult[]> {
    try {
      const bm25Results = await this.searchClient.search(options.index, query, {
        limit,
        filter: options.filter,
        showRankingScore: true,
      });

      const hits = bm25Results.hits as Array<Record<string, unknown> & { id?: string }>;

      const explainContext: ExplainContext = {
        query,
        userTopics: options.explainContext?.userTopics,
        userFollowing: options.explainContext?.userFollowing,
        trendingTopics: options.explainContext?.trendingTopics,
      };

      return hits.map((hit, idx) => {
        const result: HybridSearchResult = {
          id: String(hit.id ?? idx),
          score:
            typeof hit._rankingScore === 'number'
              ? (hit._rankingScore as number)
              : 1 - idx / Math.max(hits.length, 1),
          bm25Score:
            typeof hit._rankingScore === 'number'
              ? (hit._rankingScore as number)
              : 1 - idx / Math.max(hits.length, 1),
          vectorScore: 0,
          document: hit,
        };
        return {
          id: result.id,
          score: result.score,
          document: result.document,
          explanation: this.explainer.explain(result, explainContext),
        };
      });
    } catch {
      return [];
    }
  }

  private async fallbackIndividualSearch(
    query: string,
    embedding: number[],
    options: PipelineSearchOptions,
  ): Promise<HybridSearchResult[]> {
    // Try BM25 only
    try {
      const bm25Results = await this.searchClient.search(options.index, query, {
        limit: 50,
        filter: options.filter,
        showRankingScore: true,
      });

      const hits = bm25Results.hits as Array<Record<string, unknown> & { id?: string }>;
      return hits.map((hit, idx) => ({
        id: String(hit.id ?? idx),
        score:
          typeof hit._rankingScore === 'number'
            ? (hit._rankingScore as number)
            : 1 - idx / Math.max(hits.length, 1),
        bm25Score:
          typeof hit._rankingScore === 'number'
            ? (hit._rankingScore as number)
            : 1 - idx / Math.max(hits.length, 1),
        vectorScore: 0,
        document: hit,
      }));
    } catch {
      // Try vector only
      try {
        const vectorResults = await this.vectorClient.search(
          options.collection,
          embedding,
          50,
          options.vectorFilter,
        );

        return vectorResults.map((r) => ({
          id: r.id,
          score: r.score,
          bm25Score: 0,
          vectorScore: r.score,
          document: r.payload,
        }));
      } catch {
        return [];
      }
    }
  }

  private extractText(document: Record<string, unknown>): string {
    // Try common text fields
    if (typeof document.content === 'string') return document.content;
    if (typeof document.text === 'string') return document.text;
    if (typeof document.title === 'string') return document.title;
    if (typeof document.description === 'string') return document.description;
    if (typeof document.bodyPlain === 'string') return document.bodyPlain;
    return JSON.stringify(document).slice(0, 500);
  }
}
