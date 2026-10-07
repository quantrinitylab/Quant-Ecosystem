// ============================================================================
// Proactive Search - Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProactiveSearch } from './proactive';
import type { VectorClient } from './vector-client';

describe('ProactiveSearch', () => {
  let mockVectorClient: VectorClient;
  let mockEmbedFn: ReturnType<typeof vi.fn<(text: string) => Promise<number[]>>>;
  let proactive: ProactiveSearch;

  beforeEach(() => {
    vi.clearAllMocks();

    mockVectorClient = {
      search: vi.fn(),
    } as unknown as VectorClient;

    mockEmbedFn = vi.fn<(text: string) => Promise<number[]>>().mockResolvedValue([0.1, 0.2, 0.3]);

    proactive = new ProactiveSearch(mockVectorClient, mockEmbedFn);
  });

  describe('getRelatedItems', () => {
    it('should return related items from multiple collections', async () => {
      vi.mocked(mockVectorClient.search).mockResolvedValue([
        { id: 'related-1', score: 0.92, payload: { title: 'Related Email', type: 'email' } },
        { id: 'related-2', score: 0.85, payload: { title: 'Related Doc', type: 'file' } },
      ]);

      const results = await proactive.getRelatedItems({
        type: 'email',
        id: 'email-123',
        content: 'Meeting notes about project update',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(mockEmbedFn).toHaveBeenCalledWith('Meeting notes about project update');
      expect(mockVectorClient.search).toHaveBeenCalled();
    });

    it('should return empty results for empty content', async () => {
      const results = await proactive.getRelatedItems({
        type: 'email',
        id: 'email-123',
        content: '',
      });

      expect(results).toHaveLength(0);
      expect(mockEmbedFn).not.toHaveBeenCalled();
    });

    it('should return empty results for whitespace-only content', async () => {
      const results = await proactive.getRelatedItems({
        type: 'email',
        id: 'email-123',
        content: '   ',
      });

      expect(results).toHaveLength(0);
    });

    it('should filter out results below minimum score', async () => {
      vi.mocked(mockVectorClient.search).mockResolvedValue([
        { id: 'high', score: 0.9, payload: { title: 'High Score' } },
        { id: 'low', score: 0.3, payload: { title: 'Low Score' } },
      ]);

      const results = await proactive.getRelatedItems(
        { type: 'email', id: 'email-1', content: 'test content' },
        { minScore: 0.5 },
      );

      const ids = results.map((r) => r.id);
      expect(ids).toContain('high');
      expect(ids).not.toContain('low');
    });

    it('should respect limit parameter', async () => {
      vi.mocked(mockVectorClient.search).mockResolvedValue([
        { id: 'r1', score: 0.95, payload: {} },
        { id: 'r2', score: 0.9, payload: {} },
        { id: 'r3', score: 0.85, payload: {} },
      ]);

      const results = await proactive.getRelatedItems(
        { type: 'email', id: 'e1', content: 'test' },
        { limit: 2 },
      );

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should sort results by score descending', async () => {
      vi.mocked(mockVectorClient.search)
        .mockResolvedValueOnce([{ id: 'a', score: 0.7, payload: {} }])
        .mockResolvedValueOnce([{ id: 'b', score: 0.95, payload: {} }])
        .mockResolvedValueOnce([{ id: 'c', score: 0.8, payload: {} }])
        .mockResolvedValue([]);

      const results = await proactive.getRelatedItems({
        type: 'email',
        id: 'e1',
        content: 'test content',
      });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    });

    it('should handle vector client errors gracefully', async () => {
      vi.mocked(mockVectorClient.search).mockRejectedValue(new Error('Connection refused'));

      const results = await proactive.getRelatedItems({
        type: 'email',
        id: 'email-1',
        content: 'test content',
      });

      expect(results).toHaveLength(0);
    });

    it('should search only specified collections', async () => {
      vi.mocked(mockVectorClient.search).mockResolvedValue([{ id: 'r1', score: 0.9, payload: {} }]);

      await proactive.getRelatedItems(
        { type: 'email', id: 'e1', content: 'test' },
        { collections: ['emails-vectors', 'files-vectors'] },
      );

      expect(mockVectorClient.search).toHaveBeenCalledTimes(2);
    });

    it('should extract type from collection name', async () => {
      vi.mocked(mockVectorClient.search)
        .mockResolvedValueOnce([{ id: 'r1', score: 0.9, payload: {} }])
        .mockResolvedValue([]);

      const results = await proactive.getRelatedItems(
        { type: 'email', id: 'e1', content: 'test' },
        { collections: ['emails-vectors'] },
      );

      if (results.length > 0) {
        expect(results[0]!.type).toBe('emails');
      }
    });
  });
});
