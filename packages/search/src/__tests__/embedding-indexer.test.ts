// ============================================================================
// UGC Embedding Indexer - Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UGCEmbeddingIndexer } from '../services/embedding-indexer';
import type { EmbeddingProvider } from '../services/embedding-indexer';
import type { VectorClient } from '../services/vector-client';

describe('UGCEmbeddingIndexer', () => {
  let embeddingProvider: EmbeddingProvider;
  let vectorClient: Pick<VectorClient, 'upsertPoints' | 'deletePoints'>;
  let indexer: UGCEmbeddingIndexer;

  beforeEach(() => {
    embeddingProvider = {
      embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    };

    vectorClient = {
      upsertPoints: vi.fn().mockResolvedValue(undefined),
      deletePoints: vi.fn().mockResolvedValue(undefined),
    };

    indexer = new UGCEmbeddingIndexer(embeddingProvider, vectorClient as unknown as VectorClient, {
      collection: 'test-collection',
    });
  });

  describe('indexContent', () => {
    it('should generate embedding and upsert to Qdrant', async () => {
      await indexer.indexContent({
        id: 'doc-1',
        text: 'Hello world',
        language: 'en',
        metadata: { userId: 'user-1' },
      });

      expect(embeddingProvider.embed).toHaveBeenCalledWith(['Hello world'], 'en');
      expect(vectorClient.upsertPoints).toHaveBeenCalledWith('test-collection', [
        {
          id: 'doc-1',
          vector: [0.1, 0.2, 0.3],
          payload: {
            text: 'Hello world',
            language: 'en',
            userId: 'user-1',
          },
        },
      ]);
    });

    it('should work without language and metadata', async () => {
      await indexer.indexContent({ id: 'doc-2', text: 'Simple text' });

      expect(embeddingProvider.embed).toHaveBeenCalledWith(['Simple text'], undefined);
      expect(vectorClient.upsertPoints).toHaveBeenCalledWith('test-collection', [
        {
          id: 'doc-2',
          vector: [0.1, 0.2, 0.3],
          payload: {
            text: 'Simple text',
            language: undefined,
          },
        },
      ]);
    });

    it('should throw if embedding generation fails', async () => {
      (embeddingProvider.embed as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await expect(indexer.indexContent({ id: 'doc-3', text: 'Fail text' })).rejects.toThrow(
        'Failed to generate embedding for item doc-3',
      );
    });
  });

  describe('indexBatch', () => {
    it('should batch embed and upsert multiple items', async () => {
      (embeddingProvider.embed as ReturnType<typeof vi.fn>).mockResolvedValue([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);

      await indexer.indexBatch([
        { id: 'doc-a', text: 'First item', language: 'en', metadata: { tag: 'a' } },
        { id: 'doc-b', text: 'Second item', language: 'en', metadata: { tag: 'b' } },
      ]);

      expect(embeddingProvider.embed).toHaveBeenCalledWith(['First item', 'Second item']);
      expect(vectorClient.upsertPoints).toHaveBeenCalledWith('test-collection', [
        {
          id: 'doc-a',
          vector: [0.1, 0.2, 0.3],
          payload: { text: 'First item', language: 'en', tag: 'a' },
        },
        {
          id: 'doc-b',
          vector: [0.4, 0.5, 0.6],
          payload: { text: 'Second item', language: 'en', tag: 'b' },
        },
      ]);
    });

    it('should chunk large batches according to batchSize', async () => {
      const smallBatchIndexer = new UGCEmbeddingIndexer(
        embeddingProvider,
        vectorClient as unknown as VectorClient,
        { collection: 'test-collection', batchSize: 2 },
      );

      (embeddingProvider.embed as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([
          [0.1, 0.2],
          [0.3, 0.4],
        ])
        .mockResolvedValueOnce([[0.5, 0.6]]);

      await smallBatchIndexer.indexBatch([
        { id: 'a', text: 'one' },
        { id: 'b', text: 'two' },
        { id: 'c', text: 'three' },
      ]);

      expect(embeddingProvider.embed).toHaveBeenCalledTimes(2);
      expect(vectorClient.upsertPoints).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeContent', () => {
    it('should delete point from Qdrant', async () => {
      await indexer.removeContent('doc-1');

      expect(vectorClient.deletePoints).toHaveBeenCalledWith('test-collection', ['doc-1']);
    });
  });

  describe('updateContent', () => {
    it('should re-embed and upsert (idempotent via Qdrant upsert)', async () => {
      await indexer.updateContent({
        id: 'doc-1',
        text: 'Updated content',
        language: 'en',
        metadata: { version: 2 },
      });

      expect(embeddingProvider.embed).toHaveBeenCalledWith(['Updated content'], 'en');
      expect(vectorClient.upsertPoints).toHaveBeenCalledWith('test-collection', [
        {
          id: 'doc-1',
          vector: [0.1, 0.2, 0.3],
          payload: {
            text: 'Updated content',
            language: 'en',
            version: 2,
          },
        },
      ]);
    });
  });
});
