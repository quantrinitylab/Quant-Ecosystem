// ============================================================================
// Hybrid Search Engine - BM25 + Vector fusion
// ============================================================================

import { z } from 'zod';
import type { SearchClient } from './search-client';
import type { VectorClient, VectorSearchResult } from './vector-client';

export const HybridSearchOptionsSchema = z.object({
  bm25Weight: z.number().min(0).max(1).default(0.7),
  vectorWeight: z.number().min(0).max(1).default(0.3),
  limit: z.number().int().positive().default(20),
  index: z.string().min(1),
  collection: z.string().min(1),
  filter: z.union([z.string(), z.array(z.string())]).optional(),
  vectorFilter: z
    .object({
      must: z
        .array(z.object({ key: z.string(), match: z.object({ value: z.unknown() }) }))
        .optional(),
      must_not: z
        .array(z.object({ key: z.string(), match: z.object({ value: z.unknown() }) }))
        .optional(),
    })
    .optional(),
});

export type HybridSearchOptions = z.infer<typeof HybridSearchOptionsSchema>;

export interface HybridSearchResult {
  id: string;
  score: number;
  bm25Score: number;
  vectorScore: number;
  document: Record<string, unknown>;
}

/**
 * HybridSearchEngine - Fuses BM25 (MeiliSearch) and vector (Qdrant) results
 *
 * Runs both searches in parallel, normalizes scores to 0-1, applies
 * weighted fusion (default 0.7*BM25 + 0.3*vector), deduplicates, and
 * returns merged sorted results.
 */
export class HybridSearchEngine {
  constructor(
    private readonly searchClient: SearchClient,
    private readonly vectorClient: VectorClient,
  ) {}

  async hybridSearch(
    query: string,
    embedding: number[],
    options: HybridSearchOptions,
  ): Promise<HybridSearchResult[]> {
    const opts = HybridSearchOptionsSchema.parse(options);

    const [bm25Results, vectorResults] = await Promise.all([
      this.searchClient.search(opts.index, query, {
        limit: 50,
        filter: opts.filter,
        showRankingScore: true,
      }),
      this.vectorClient.search(opts.collection, embedding, 50, opts.vectorFilter),
    ]);

    const bm25Hits = bm25Results.hits as Array<Record<string, unknown> & { id?: string }>;

    // If MeiliSearch returns numeric _rankingScore, use it for normalization (min-max).
    // Fall back to positional rank if scores are not available.
    const hasMeiliScores = bm25Hits.length > 0 && typeof bm25Hits[0]!._rankingScore === 'number';

    const normalizedBm25 = this.normalizeScores(
      bm25Hits.map((hit, idx) => ({
        id: String(hit.id ?? idx),
        score: hasMeiliScores
          ? (hit._rankingScore as number)
          : 1 - idx / Math.max(bm25Hits.length, 1),
        document: hit,
      })),
    );

    const normalizedVector = this.normalizeScores(
      vectorResults.map((r: VectorSearchResult) => ({
        id: r.id,
        score: r.score,
        document: r.payload,
      })),
    );

    const merged = this.fuseResults(
      normalizedBm25,
      normalizedVector,
      opts.bm25Weight,
      opts.vectorWeight,
    );

    return merged.slice(0, opts.limit);
  }

  private normalizeScores(
    results: Array<{ id: string; score: number; document: Record<string, unknown> }>,
  ): Array<{ id: string; score: number; document: Record<string, unknown> }> {
    if (results.length === 0) return [];

    const maxScore = Math.max(...results.map((r) => r.score));
    const minScore = Math.min(...results.map((r) => r.score));
    const range = maxScore - minScore;

    if (range === 0) {
      return results.map((r) => ({ ...r, score: 1 }));
    }

    return results.map((r) => ({
      ...r,
      score: (r.score - minScore) / range,
    }));
  }

  private fuseResults(
    bm25: Array<{ id: string; score: number; document: Record<string, unknown> }>,
    vector: Array<{ id: string; score: number; document: Record<string, unknown> }>,
    bm25Weight: number,
    vectorWeight: number,
  ): HybridSearchResult[] {
    const resultMap = new Map<string, HybridSearchResult>();

    for (const item of bm25) {
      resultMap.set(item.id, {
        id: item.id,
        score: item.score * bm25Weight,
        bm25Score: item.score,
        vectorScore: 0,
        document: item.document,
      });
    }

    for (const item of vector) {
      const existing = resultMap.get(item.id);
      if (existing) {
        existing.vectorScore = item.score;
        existing.score = existing.bm25Score * bm25Weight + item.score * vectorWeight;
      } else {
        resultMap.set(item.id, {
          id: item.id,
          score: item.score * vectorWeight,
          bm25Score: 0,
          vectorScore: item.score,
          document: item.document,
        });
      }
    }

    return Array.from(resultMap.values()).sort((a, b) => b.score - a.score);
  }
}
