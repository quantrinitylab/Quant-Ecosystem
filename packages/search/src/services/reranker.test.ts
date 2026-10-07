// ============================================================================
// Cohere Reranker - Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CohereReranker } from './reranker';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('CohereReranker', () => {
  let reranker: CohereReranker;

  beforeEach(() => {
    vi.clearAllMocks();
    reranker = new CohereReranker('test-api-key', 'https://api.cohere.ai/v1/rerank');
  });

  const sampleDocs = [
    { id: 'doc-1', text: 'TypeScript is a programming language' },
    { id: 'doc-2', text: 'JavaScript runs in browsers' },
    { id: 'doc-3', text: 'Python is used for data science' },
    { id: 'doc-4', text: 'Rust is a systems language' },
    { id: 'doc-5', text: 'Go is used for microservices' },
  ];

  describe('rerank', () => {
    it('should rerank documents using Cohere API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { index: 2, relevance_score: 0.98 },
            { index: 0, relevance_score: 0.85 },
            { index: 4, relevance_score: 0.72 },
          ],
        }),
      });

      const results = await reranker.rerank('data science', sampleDocs, 3);

      expect(results).toHaveLength(3);
      expect(results[0]!.id).toBe('doc-3');
      expect(results[0]!.relevanceScore).toBe(0.98);
      expect(results[1]!.id).toBe('doc-1');
      expect(results[1]!.relevanceScore).toBe(0.85);
      expect(results[2]!.id).toBe('doc-5');
      expect(results[2]!.relevanceScore).toBe(0.72);
    });

    it('should call Cohere API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ index: 0, relevance_score: 0.9 }],
        }),
      });

      await reranker.rerank('query', sampleDocs, 1);

      expect(mockFetch).toHaveBeenCalledWith('https://api.cohere.ai/v1/rerank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
        },
        body: JSON.stringify({
          model: 'rerank-english-v3.0',
          query: 'query',
          documents: sampleDocs.map((d) => d.text),
          top_n: 1,
        }),
      });
    });

    it('should fall back to original ordering on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const results = await reranker.rerank('query', sampleDocs, 3);

      expect(results).toHaveLength(3);
      expect(results[0]!.id).toBe('doc-1');
      expect(results[1]!.id).toBe('doc-2');
      expect(results[2]!.id).toBe('doc-3');
    });

    it('should fall back to original ordering on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const results = await reranker.rerank('query', sampleDocs, 2);

      expect(results).toHaveLength(2);
      expect(results[0]!.id).toBe('doc-1');
      expect(results[1]!.id).toBe('doc-2');
    });

    it('should respect topN parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { index: 0, relevance_score: 0.9 },
            { index: 1, relevance_score: 0.8 },
          ],
        }),
      });

      const results = await reranker.rerank('query', sampleDocs, 2);

      expect(results).toHaveLength(2);
    });

    it('should preserve original index in results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { index: 3, relevance_score: 0.95 },
            { index: 1, relevance_score: 0.7 },
          ],
        }),
      });

      const results = await reranker.rerank('systems', sampleDocs, 2);

      expect(results[0]!.originalIndex).toBe(3);
      expect(results[1]!.originalIndex).toBe(1);
    });

    it('should use original score in fallback when available', async () => {
      mockFetch.mockRejectedValue(new Error('timeout'));

      const docsWithScores = [
        { id: 'doc-1', text: 'first', score: 0.9 },
        { id: 'doc-2', text: 'second', score: 0.7 },
      ];

      const results = await reranker.rerank('query', docsWithScores, 2);

      expect(results[0]!.relevanceScore).toBe(0.9);
      expect(results[1]!.relevanceScore).toBe(0.7);
    });
  });
});
