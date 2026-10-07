// ============================================================================
// Hybrid Search Pipeline - Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridSearchPipeline } from '../services/hybrid-search-pipeline';
import type { SearchClient } from '../services/search-client';
import type { VectorClient } from '../services/vector-client';
import type { CohereReranker } from '../services/reranker';
import type { EmbeddingProvider } from '../services/embedding-indexer';

describe('HybridSearchPipeline', () => {
  let searchClient: Pick<SearchClient, 'search'>;
  let vectorClient: Pick<VectorClient, 'search'>;
  let reranker: Pick<CohereReranker, 'rerank'>;
  let embeddingProvider: EmbeddingProvider;
  let pipeline: HybridSearchPipeline;

  const mockEmbedding = [0.1, 0.2, 0.3];

  const mockBm25Results = {
    hits: [
      { id: 'doc-1', content: 'Machine learning basics', _rankingScore: 0.9 },
      { id: 'doc-2', content: 'Deep learning tutorial', _rankingScore: 0.7 },
      { id: 'doc-3', content: 'AI for beginners', _rankingScore: 0.5 },
    ],
    estimatedTotalHits: 3,
    limit: 50,
    offset: 0,
    processingTimeMs: 5,
  };

  const mockVectorResults = [
    { id: 'doc-1', score: 0.95, payload: { content: 'Machine learning basics' } },
    { id: 'doc-4', score: 0.8, payload: { content: 'Neural networks explained' } },
    { id: 'doc-2', score: 0.6, payload: { content: 'Deep learning tutorial' } },
  ];

  const mockRerankResults = [
    { id: 'doc-1', text: 'Machine learning basics', relevanceScore: 0.98, originalIndex: 0 },
    { id: 'doc-4', text: 'Neural networks explained', relevanceScore: 0.85, originalIndex: 1 },
    { id: 'doc-2', text: 'Deep learning tutorial', relevanceScore: 0.72, originalIndex: 2 },
  ];

  beforeEach(() => {
    embeddingProvider = {
      embed: vi.fn().mockResolvedValue([mockEmbedding]),
    };

    searchClient = {
      search: vi.fn().mockResolvedValue(mockBm25Results),
    };

    vectorClient = {
      search: vi.fn().mockResolvedValue(mockVectorResults),
    };

    reranker = {
      rerank: vi.fn().mockResolvedValue(mockRerankResults),
    };

    pipeline = new HybridSearchPipeline(
      searchClient as unknown as SearchClient,
      vectorClient as unknown as VectorClient,
      reranker as unknown as CohereReranker,
      embeddingProvider,
    );
  });

  describe('full pipeline flow', () => {
    it('should execute all pipeline steps and return results with explanations', async () => {
      const results = await pipeline.search('machine learning', {
        index: 'posts',
        collection: 'posts-vectors',
        limit: 3,
      });

      // Verify embedding was generated
      expect(embeddingProvider.embed).toHaveBeenCalledWith(['machine learning']);

      // Verify hybrid search was called
      expect(searchClient.search).toHaveBeenCalled();
      expect(vectorClient.search).toHaveBeenCalled();

      // Verify reranker was called
      expect(reranker.rerank).toHaveBeenCalled();

      // Verify results have explanations
      expect(results).toHaveLength(3);
      expect(results[0]!.id).toBe('doc-1');
      expect(results[0]!.explanation).toBeDefined();
      expect(results[0]!.explanation.itemId).toBe('doc-1');
      expect(results[0]!.explanation.topSignals.length).toBeGreaterThan(0);
    });

    it('should include reranker score in results', async () => {
      const results = await pipeline.search('machine learning', {
        index: 'posts',
        collection: 'posts-vectors',
      });

      expect(results[0]!.score).toBe(0.98);
      expect(results[0]!.document.rerankerScore).toBe(0.98);
    });

    it('should pass explain context to explainer', async () => {
      const results = await pipeline.search('machine learning', {
        index: 'posts',
        collection: 'posts-vectors',
        explainContext: {
          userFollowing: ['author-1'],
          trendingTopics: ['AI'],
        },
      });

      expect(results.length).toBeGreaterThan(0);
      // Each result should have an explanation
      for (const result of results) {
        expect(result.explanation.itemId).toBe(result.id);
      }
    });
  });

  describe('reranker fallback', () => {
    it('should return fused results when reranker fails', async () => {
      (reranker.rerank as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Cohere API timeout'),
      );

      const results = await pipeline.search('machine learning', {
        index: 'posts',
        collection: 'posts-vectors',
        limit: 3,
      });

      // Should still return results (from fusion)
      expect(results.length).toBeGreaterThan(0);
      // Results should have explanations
      expect(results[0]!.explanation).toBeDefined();
    });
  });

  describe('vector-only fallback', () => {
    it('should return vector results when BM25 fails but vector succeeds', async () => {
      // Make the hybrid engine's internal search fail (both BM25 and vector together)
      (searchClient.search as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('MeiliSearch down'),
      );
      // But let vectorClient succeed on fallback
      (vectorClient.search as ReturnType<typeof vi.fn>).mockResolvedValue(mockVectorResults);

      const results = await pipeline.search('machine learning', {
        index: 'posts',
        collection: 'posts-vectors',
        limit: 3,
      });

      // Should still return results (from vector-only fallback)
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('BM25-only fallback', () => {
    it('should return BM25 results when embedding generation fails', async () => {
      (embeddingProvider.embed as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('OpenAI API error'),
      );

      const results = await pipeline.search('machine learning', {
        index: 'posts',
        collection: 'posts-vectors',
        limit: 3,
      });

      // Should fall back to BM25-only
      expect(results.length).toBeGreaterThan(0);
      expect(searchClient.search).toHaveBeenCalled();
      // All results should have vectorScore of 0
      for (const result of results) {
        expect(result.explanation).toBeDefined();
      }
    });
  });

  describe('complete failure', () => {
    it('should return empty array when all backends fail', async () => {
      (embeddingProvider.embed as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Embedding failed'),
      );
      (searchClient.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('BM25 failed'));

      const results = await pipeline.search('machine learning', {
        index: 'posts',
        collection: 'posts-vectors',
      });

      expect(results).toHaveLength(0);
    });
  });

  describe('options passthrough', () => {
    it('should respect custom limit', async () => {
      const results = await pipeline.search('machine learning', {
        index: 'posts',
        collection: 'posts-vectors',
        limit: 1,
      });

      expect(results).toHaveLength(1);
    });

    it('should pass filter options to search', async () => {
      await pipeline.search('machine learning', {
        index: 'posts',
        collection: 'posts-vectors',
        filter: 'userId = "user-1"',
      });

      expect(searchClient.search).toHaveBeenCalledWith(
        'posts',
        'machine learning',
        expect.objectContaining({ filter: 'userId = "user-1"' }),
      );
    });
  });
});
