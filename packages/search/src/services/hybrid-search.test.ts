// ============================================================================
// Hybrid Search Engine - Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridSearchEngine } from './hybrid-search';
import type { SearchClient } from './search-client';
import type { VectorClient } from './vector-client';

describe('HybridSearchEngine', () => {
  let mockSearchClient: SearchClient;
  let mockVectorClient: VectorClient;
  let engine: HybridSearchEngine;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSearchClient = {
      search: vi.fn(),
    } as unknown as SearchClient;

    mockVectorClient = {
      search: vi.fn(),
    } as unknown as VectorClient;

    engine = new HybridSearchEngine(mockSearchClient, mockVectorClient);
  });

  describe('hybridSearch', () => {
    it('should fuse BM25 and vector results with default weights', async () => {
      vi.mocked(mockSearchClient.search).mockResolvedValue({
        hits: [
          { id: 'doc-1', title: 'First' },
          { id: 'doc-2', title: 'Second' },
          { id: 'doc-4', title: 'Fourth' },
        ],
      } as never);

      vi.mocked(mockVectorClient.search).mockResolvedValue([
        { id: 'doc-2', score: 0.95, payload: { title: 'Second' } },
        { id: 'doc-3', score: 0.8, payload: { title: 'Third' } },
      ]);

      const results = await engine.hybridSearch('test query', [0.1, 0.2], {
        index: 'emails',
        collection: 'emails-vectors',
        limit: 10,
        bm25Weight: 0.7,
        vectorWeight: 0.3,
      });

      expect(results.length).toBeGreaterThan(0);
      // doc-2 appears in both, should have combined score
      const doc2 = results.find((r) => r.id === 'doc-2');
      expect(doc2).toBeDefined();
      expect(doc2!.bm25Score).toBeGreaterThan(0);
      expect(doc2!.vectorScore).toBeGreaterThan(0);
    });

    it('should normalize scores to 0-1 range', async () => {
      vi.mocked(mockSearchClient.search).mockResolvedValue({
        hits: [
          { id: 'doc-1', title: 'A' },
          { id: 'doc-2', title: 'B' },
          { id: 'doc-3', title: 'C' },
        ],
      } as never);

      vi.mocked(mockVectorClient.search).mockResolvedValue([
        { id: 'doc-1', score: 0.99, payload: {} },
      ]);

      const results = await engine.hybridSearch('query', [0.1], {
        index: 'emails',
        collection: 'col',
        limit: 20,
        bm25Weight: 0.7,
        vectorWeight: 0.3,
      });

      for (const r of results) {
        expect(r.bm25Score).toBeGreaterThanOrEqual(0);
        expect(r.bm25Score).toBeLessThanOrEqual(1);
        expect(r.vectorScore).toBeGreaterThanOrEqual(0);
        expect(r.vectorScore).toBeLessThanOrEqual(1);
      }
    });

    it('should handle empty BM25 results', async () => {
      vi.mocked(mockSearchClient.search).mockResolvedValue({
        hits: [],
      } as never);

      vi.mocked(mockVectorClient.search).mockResolvedValue([
        { id: 'doc-1', score: 0.9, payload: { text: 'hello' } },
      ]);

      const results = await engine.hybridSearch('query', [0.1], {
        index: 'emails',
        collection: 'col',
        limit: 10,
        bm25Weight: 0.7,
        vectorWeight: 0.3,
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('doc-1');
      expect(results[0]!.bm25Score).toBe(0);
      expect(results[0]!.vectorScore).toBeGreaterThan(0);
    });

    it('should handle empty vector results', async () => {
      vi.mocked(mockSearchClient.search).mockResolvedValue({
        hits: [{ id: 'doc-1', title: 'Result' }],
      } as never);

      vi.mocked(mockVectorClient.search).mockResolvedValue([]);

      const results = await engine.hybridSearch('query', [0.1], {
        index: 'emails',
        collection: 'col',
        limit: 10,
        bm25Weight: 0.7,
        vectorWeight: 0.3,
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('doc-1');
      expect(results[0]!.vectorScore).toBe(0);
    });

    it('should handle both empty results', async () => {
      vi.mocked(mockSearchClient.search).mockResolvedValue({
        hits: [],
      } as never);

      vi.mocked(mockVectorClient.search).mockResolvedValue([]);

      const results = await engine.hybridSearch('query', [0.1], {
        index: 'emails',
        collection: 'col',
        limit: 10,
        bm25Weight: 0.7,
        vectorWeight: 0.3,
      });

      expect(results).toHaveLength(0);
    });

    it('should deduplicate results appearing in both sources', async () => {
      vi.mocked(mockSearchClient.search).mockResolvedValue({
        hits: [{ id: 'doc-1', title: 'Same' }],
      } as never);

      vi.mocked(mockVectorClient.search).mockResolvedValue([
        { id: 'doc-1', score: 0.9, payload: { title: 'Same' } },
      ]);

      const results = await engine.hybridSearch('query', [0.1], {
        index: 'emails',
        collection: 'col',
        limit: 10,
        bm25Weight: 0.7,
        vectorWeight: 0.3,
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('doc-1');
      expect(results[0]!.score).toBe(results[0]!.bm25Score * 0.7 + results[0]!.vectorScore * 0.3);
    });

    it('should respect limit parameter', async () => {
      vi.mocked(mockSearchClient.search).mockResolvedValue({
        hits: Array.from({ length: 20 }, (_, i) => ({ id: `doc-${i}`, title: `Doc ${i}` })),
      } as never);

      vi.mocked(mockVectorClient.search).mockResolvedValue([]);

      const results = await engine.hybridSearch('query', [0.1], {
        index: 'emails',
        collection: 'col',
        limit: 5,
        bm25Weight: 0.7,
        vectorWeight: 0.3,
      });

      expect(results).toHaveLength(5);
    });

    it('should sort results by fused score descending', async () => {
      vi.mocked(mockSearchClient.search).mockResolvedValue({
        hits: [
          { id: 'doc-1', title: 'First' },
          { id: 'doc-2', title: 'Second' },
        ],
      } as never);

      vi.mocked(mockVectorClient.search).mockResolvedValue([
        { id: 'doc-2', score: 0.99, payload: {} },
        { id: 'doc-1', score: 0.1, payload: {} },
      ]);

      const results = await engine.hybridSearch('query', [0.1], {
        index: 'emails',
        collection: 'col',
        limit: 10,
        bm25Weight: 0.5,
        vectorWeight: 0.5,
      });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    });
  });
});
