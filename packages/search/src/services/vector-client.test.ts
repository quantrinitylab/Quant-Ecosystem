// ============================================================================
// Vector Client - Qdrant Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VectorClient } from './vector-client';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('VectorClient', () => {
  let client: VectorClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new VectorClient('http://localhost', 6333);
  });

  describe('constructor options', () => {
    it('should include api-key header when apiKey is provided', async () => {
      const authClient = new VectorClient('http://localhost', 6333, { apiKey: 'test-secret-key' });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            config: { params: { vectors: { size: 768 } } },
            points_count: 100,
            status: 'green',
          },
        }),
      });

      await authClient.getCollectionInfo('test-collection');

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:6333/collections/test-collection', {
        headers: { 'api-key': 'test-secret-key' },
      });
    });

    it('should use https protocol when https option is true', async () => {
      const httpsClient = new VectorClient('http://localhost', 6333, { https: true });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            config: { params: { vectors: { size: 768 } } },
            points_count: 0,
            status: 'green',
          },
        }),
      });

      await httpsClient.getCollectionInfo('test');

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('https://');
    });

    it('should include both api-key header and Content-Type for write operations', async () => {
      const authClient = new VectorClient('http://localhost', 6333, { apiKey: 'my-key' });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ result: true }),
      });

      await authClient.createCollection('secured', 768);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:6333/collections/secured',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json', 'api-key': 'my-key' },
        }),
      );
    });
  });

  describe('createCollection', () => {
    it('should create a collection with the correct vector size', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ result: true }),
      });

      await client.createCollection('test-collection', 768);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:6333/collections/test-collection', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: { size: 768, distance: 'Cosine' },
        }),
      });
    });

    it('should throw on invalid collection name', async () => {
      await expect(client.createCollection('', 768)).rejects.toThrow();
    });

    it('should throw on invalid vector size', async () => {
      await expect(client.createCollection('test', -1)).rejects.toThrow();
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Collection already exists',
      });

      await expect(client.createCollection('test', 768)).rejects.toThrow(
        'Failed to create collection',
      );
    });
  });

  describe('upsertPoints', () => {
    it('should upsert points to a collection', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ result: { status: 'completed' } }),
      });

      const points = [
        { id: 'point-1', vector: [0.1, 0.2, 0.3], payload: { text: 'hello' } },
        { id: 'point-2', vector: [0.4, 0.5, 0.6], payload: { text: 'world' } },
      ];

      await client.upsertPoints('test-collection', points);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:6333/collections/test-collection/points',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [
              { id: 'point-1', vector: [0.1, 0.2, 0.3], payload: { text: 'hello' } },
              { id: 'point-2', vector: [0.4, 0.5, 0.6], payload: { text: 'world' } },
            ],
          }),
        },
      );
    });

    it('should throw on empty points array', async () => {
      await expect(client.upsertPoints('test', [])).rejects.toThrow();
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Server error',
      });

      await expect(client.upsertPoints('test', [{ id: '1', vector: [0.1] }])).rejects.toThrow(
        'Failed to upsert points',
      );
    });
  });

  describe('search', () => {
    it('should search with a vector and return results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: [
            { id: 'point-1', score: 0.95, payload: { text: 'hello' } },
            { id: 'point-2', score: 0.82, payload: { text: 'world' } },
          ],
        }),
      });

      const results = await client.search('test-collection', [0.1, 0.2, 0.3], 5);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:6333/collections/test-collection/points/search',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: [0.1, 0.2, 0.3],
            limit: 5,
            with_payload: true,
          }),
        },
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ id: 'point-1', score: 0.95, payload: { text: 'hello' } });
      expect(results[1]).toEqual({ id: 'point-2', score: 0.82, payload: { text: 'world' } });
    });

    it('should search with filter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: [{ id: 'point-1', score: 0.9, payload: { type: 'email' } }],
        }),
      });

      const filter = {
        must: [{ key: 'type', match: { value: 'email' } }],
      };

      const results = await client.search('test-collection', [0.1], 10, filter);

      const calledBody = JSON.parse((mockFetch.mock.calls[0]![1] as { body: string }).body);
      expect(calledBody.filter).toEqual(filter);
      expect(results).toHaveLength(1);
      expect(results[0]!.payload).toEqual({ type: 'email' });
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Collection not found',
      });

      await expect(client.search('missing', [0.1], 5)).rejects.toThrow('Failed to search');
    });
  });

  describe('deletePoints', () => {
    it('should delete points by IDs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ result: { status: 'completed' } }),
      });

      await client.deletePoints('test-collection', ['point-1', 'point-2']);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:6333/collections/test-collection/points/delete',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: ['point-1', 'point-2'] }),
        },
      );
    });

    it('should throw on empty IDs array', async () => {
      await expect(client.deletePoints('test', [])).rejects.toThrow();
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Error',
      });

      await expect(client.deletePoints('test', ['1'])).rejects.toThrow('Failed to delete points');
    });
  });

  describe('getCollectionInfo', () => {
    it('should return collection information', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            config: { params: { vectors: { size: 768 } } },
            points_count: 1000,
            status: 'green',
          },
        }),
      });

      const info = await client.getCollectionInfo('test-collection');

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:6333/collections/test-collection', {
        headers: {},
      });
      expect(info).toEqual({
        name: 'test-collection',
        vectorSize: 768,
        pointsCount: 1000,
        status: 'green',
      });
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Not found',
      });

      await expect(client.getCollectionInfo('missing')).rejects.toThrow(
        'Failed to get collection info',
      );
    });
  });
});
