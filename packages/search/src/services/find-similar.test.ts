// ============================================================================
// Find Similar Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FindSimilarService } from './find-similar';
import type { VectorClient } from './vector-client';

describe('FindSimilarService', () => {
  let service: FindSimilarService;
  let mockVectorClient: {
    search: ReturnType<typeof vi.fn>;
  };
  let mockEmbedFn: ReturnType<typeof vi.fn<(text: string) => Promise<number[]>>>;

  beforeEach(() => {
    mockVectorClient = {
      search: vi.fn().mockResolvedValue([]),
    };
    mockEmbedFn = vi.fn<(text: string) => Promise<number[]>>().mockResolvedValue([0.1, 0.2, 0.3]);
    service = new FindSimilarService(mockVectorClient as unknown as VectorClient, mockEmbedFn);
  });

  it('should find similar documents across collections', async () => {
    mockVectorClient.search.mockResolvedValue([
      { id: 'doc-1', score: 0.9, payload: { title: 'Similar Doc', snippet: 'Content' } },
      { id: 'doc-2', score: 0.8, payload: { title: 'Another Doc', snippet: 'More content' } },
    ]);

    const results = await service.findSimilar('source-doc', 'test text');

    expect(mockEmbedFn).toHaveBeenCalledWith('test text');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe('doc-1');
    expect(results[0]!.score).toBe(0.9);
    expect(results[0]!.title).toBe('Similar Doc');
  });

  it('should exclude the source document via vector filter', async () => {
    mockVectorClient.search.mockResolvedValue([
      { id: 'doc-1', score: 0.9, payload: { title: 'Result' } },
    ]);

    await service.findSimilar('source-doc', 'test text', {
      collections: ['emails-vectors'],
    });

    expect(mockVectorClient.search).toHaveBeenCalledWith('emails-vectors', [0.1, 0.2, 0.3], 10, {
      must_not: [{ key: 'id', match: { value: 'source-doc' } }],
    });
  });

  it('should respect minScore threshold', async () => {
    mockVectorClient.search.mockResolvedValue([
      { id: 'doc-1', score: 0.9, payload: { title: 'High Score' } },
      { id: 'doc-2', score: 0.3, payload: { title: 'Low Score' } },
    ]);

    const results = await service.findSimilar('source-doc', 'test text', {
      minScore: 0.5,
      collections: ['emails-vectors'],
    });

    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe('doc-1');
  });

  it('should handle empty results', async () => {
    mockVectorClient.search.mockResolvedValue([]);

    const results = await service.findSimilar('source-doc', 'test text');
    expect(results).toEqual([]);
  });

  it('should return empty results for empty text', async () => {
    const results = await service.findSimilar('source-doc', '   ');
    expect(results).toEqual([]);
    expect(mockEmbedFn).not.toHaveBeenCalled();
  });

  it('should respect the limit option', async () => {
    mockVectorClient.search.mockResolvedValue([
      { id: 'doc-1', score: 0.95, payload: {} },
      { id: 'doc-2', score: 0.9, payload: {} },
      { id: 'doc-3', score: 0.85, payload: {} },
    ]);

    const results = await service.findSimilar('source-doc', 'test text', {
      limit: 2,
      collections: ['emails-vectors'],
    });

    expect(results.length).toBe(2);
  });

  it('should handle vector client errors gracefully', async () => {
    mockVectorClient.search.mockRejectedValue(new Error('Connection failed'));

    const results = await service.findSimilar('source-doc', 'test text');
    expect(results).toEqual([]);
  });

  it('should extract type from collection name', async () => {
    mockVectorClient.search.mockImplementation(async (collection: string) => {
      if (collection === 'emails-vectors') {
        return [{ id: 'email-1', score: 0.9, payload: {} }];
      }
      return [];
    });

    const results = await service.findSimilar('source-doc', 'test text', {
      collections: ['emails-vectors'],
    });

    expect(results[0]!.type).toBe('emails');
  });

  it('should search custom collections when specified', async () => {
    mockVectorClient.search.mockResolvedValue([]);

    await service.findSimilar('source-doc', 'test text', {
      collections: ['custom-vectors'],
    });

    expect(mockVectorClient.search).toHaveBeenCalledTimes(1);
    expect(mockVectorClient.search).toHaveBeenCalledWith(
      'custom-vectors',
      expect.any(Array),
      10,
      expect.any(Object),
    );
  });
});
