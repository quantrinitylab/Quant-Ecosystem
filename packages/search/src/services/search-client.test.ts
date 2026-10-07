// ============================================================================
// Search Client - MeiliSearch Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchClient, QUANT_INDEXES } from './search-client';

// Mock the meilisearch module
const mockIndex = {
  updateSearchableAttributes: vi.fn(),
  updateFilterableAttributes: vi.fn(),
  updateSortableAttributes: vi.fn(),
  addDocuments: vi.fn(),
  search: vi.fn(),
  deleteDocument: vi.fn(),
};

const mockClient = {
  createIndex: vi.fn(),
  index: vi.fn(function () {
    return mockIndex;
  }),
  waitForTask: vi.fn(),
};

vi.mock('meilisearch', () => ({
  MeiliSearch: vi.fn(function () {
    return mockClient;
  }),
}));

describe('SearchClient', () => {
  let client: SearchClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new SearchClient('http://localhost:7700', 'test-api-key');
  });

  describe('ensureIndex', () => {
    it('should create an index and configure settings', async () => {
      mockClient.createIndex.mockResolvedValue({ taskUid: 1 });
      mockClient.waitForTask.mockResolvedValue({ status: 'succeeded' });
      mockIndex.updateSearchableAttributes.mockResolvedValue({ taskUid: 2 });
      mockIndex.updateFilterableAttributes.mockResolvedValue({ taskUid: 3 });
      mockIndex.updateSortableAttributes.mockResolvedValue({ taskUid: 4 });

      await client.ensureIndex('emails', {
        primaryKey: 'id',
        searchableAttributes: ['subject', 'body'],
        filterableAttributes: ['userId'],
        sortableAttributes: ['createdAt'],
      });

      expect(mockClient.createIndex).toHaveBeenCalledWith('emails', {
        primaryKey: 'id',
      });
      expect(mockIndex.updateSearchableAttributes).toHaveBeenCalledWith(['subject', 'body']);
      expect(mockIndex.updateFilterableAttributes).toHaveBeenCalledWith(['userId']);
      expect(mockIndex.updateSortableAttributes).toHaveBeenCalledWith(['createdAt']);
      expect(mockClient.waitForTask).toHaveBeenCalledTimes(4);
    });

    it('should skip attribute updates when not specified', async () => {
      mockClient.createIndex.mockResolvedValue({ taskUid: 1 });
      mockClient.waitForTask.mockResolvedValue({ status: 'succeeded' });

      await client.ensureIndex('simple', { primaryKey: 'id' });

      expect(mockClient.createIndex).toHaveBeenCalledWith('simple', {
        primaryKey: 'id',
      });
      expect(mockIndex.updateSearchableAttributes).not.toHaveBeenCalled();
      expect(mockIndex.updateFilterableAttributes).not.toHaveBeenCalled();
      expect(mockIndex.updateSortableAttributes).not.toHaveBeenCalled();
    });
  });

  describe('indexDocument', () => {
    it('should add a single document to the index', async () => {
      mockIndex.addDocuments.mockResolvedValue({ taskUid: 5 });
      mockClient.waitForTask.mockResolvedValue({ status: 'succeeded' });

      await client.indexDocument('posts', { id: 'post_1', content: 'Hello world' });

      expect(mockClient.index).toHaveBeenCalledWith('posts');
      expect(mockIndex.addDocuments).toHaveBeenCalledWith([
        { id: 'post_1', content: 'Hello world' },
      ]);
      expect(mockClient.waitForTask).toHaveBeenCalledWith(5);
    });
  });

  describe('indexBatch', () => {
    it('should add multiple documents to the index', async () => {
      const docs = [
        { id: 'post_1', content: 'First' },
        { id: 'post_2', content: 'Second' },
      ];
      mockIndex.addDocuments.mockResolvedValue({ taskUid: 6 });
      mockClient.waitForTask.mockResolvedValue({ status: 'succeeded' });

      await client.indexBatch('posts', docs);

      expect(mockIndex.addDocuments).toHaveBeenCalledWith(docs);
      expect(mockClient.waitForTask).toHaveBeenCalledWith(6);
    });
  });

  describe('search', () => {
    it('should search with query and return results', async () => {
      const mockResponse = {
        hits: [{ id: 'post_1', content: 'Hello world' }],
        estimatedTotalHits: 1,
        query: 'hello',
      };
      mockIndex.search.mockResolvedValue(mockResponse);

      const result = await client.search('posts', 'hello');

      expect(mockClient.index).toHaveBeenCalledWith('posts');
      expect(mockIndex.search).toHaveBeenCalledWith('hello', undefined);
      expect(result).toEqual(mockResponse);
    });

    it('should search with options', async () => {
      const mockResponse = {
        hits: [{ id: 'post_1', content: 'Hello' }],
        estimatedTotalHits: 1,
        query: 'hello',
      };
      mockIndex.search.mockResolvedValue(mockResponse);

      const result = await client.search('posts', 'hello', {
        filter: 'userId = user_1',
        sort: ['createdAt:desc'],
        limit: 10,
        offset: 0,
      });

      expect(mockIndex.search).toHaveBeenCalledWith('hello', {
        filter: 'userId = user_1',
        sort: ['createdAt:desc'],
        limit: 10,
        offset: 0,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should reject invalid search options', async () => {
      await expect(client.search('posts', 'hello', { limit: -1 } as never)).rejects.toThrow();
    });
  });

  describe('deleteDocument', () => {
    it('should delete a document from the index', async () => {
      mockIndex.deleteDocument.mockResolvedValue({ taskUid: 7 });
      mockClient.waitForTask.mockResolvedValue({ status: 'succeeded' });

      await client.deleteDocument('posts', 'post_1');

      expect(mockClient.index).toHaveBeenCalledWith('posts');
      expect(mockIndex.deleteDocument).toHaveBeenCalledWith('post_1');
      expect(mockClient.waitForTask).toHaveBeenCalledWith(7);
    });
  });

  describe('ensureAllQuantIndexes', () => {
    it('should create all 6 predefined indexes', async () => {
      mockClient.createIndex.mockResolvedValue({ taskUid: 1 });
      mockClient.waitForTask.mockResolvedValue({ status: 'succeeded' });
      mockIndex.updateSearchableAttributes.mockResolvedValue({ taskUid: 2 });
      mockIndex.updateFilterableAttributes.mockResolvedValue({ taskUid: 3 });
      mockIndex.updateSortableAttributes.mockResolvedValue({ taskUid: 4 });

      await client.ensureAllQuantIndexes();

      const indexNames = Object.keys(QUANT_INDEXES);
      expect(indexNames).toHaveLength(6);
      expect(mockClient.createIndex).toHaveBeenCalledTimes(6);

      for (const name of indexNames) {
        expect(mockClient.createIndex).toHaveBeenCalledWith(name, {
          primaryKey: 'id',
        });
      }
    });
  });

  describe('QUANT_INDEXES', () => {
    it('should have all expected indexes defined', () => {
      expect(QUANT_INDEXES).toHaveProperty('emails');
      expect(QUANT_INDEXES).toHaveProperty('messages');
      expect(QUANT_INDEXES).toHaveProperty('posts');
      expect(QUANT_INDEXES).toHaveProperty('videos');
      expect(QUANT_INDEXES).toHaveProperty('users');
      expect(QUANT_INDEXES).toHaveProperty('files');
    });

    it('should have primaryKey set to id for all indexes', () => {
      for (const config of Object.values(QUANT_INDEXES)) {
        expect(config.primaryKey).toBe('id');
      }
    });
  });
});
