import { describe, it, expect, vi } from 'vitest';
import { BatchEmbedder, type EmbeddingProvider } from './embedder';

function createMockProvider(vectors: number[][]): EmbeddingProvider {
  return {
    embed: vi.fn().mockResolvedValue(vectors),
  };
}

describe('BatchEmbedder', () => {
  describe('embedText', () => {
    it('embeds a single text and returns the vector', async () => {
      const mockVector = [0.1, 0.2, 0.3];
      const provider = createMockProvider([mockVector]);
      const embedder = new BatchEmbedder(provider);

      const result = await embedder.embedText('hello world');

      expect(result).toEqual(mockVector);
      expect(provider.embed).toHaveBeenCalledWith(['hello world']);
    });

    it('returns empty array for empty text', async () => {
      const provider = createMockProvider([]);
      const embedder = new BatchEmbedder(provider);

      const result = await embedder.embedText('');

      expect(result).toEqual([]);
      expect(provider.embed).not.toHaveBeenCalled();
    });

    it('returns empty array for whitespace-only text', async () => {
      const provider = createMockProvider([]);
      const embedder = new BatchEmbedder(provider);

      const result = await embedder.embedText('   ');

      expect(result).toEqual([]);
      expect(provider.embed).not.toHaveBeenCalled();
    });
  });

  describe('embedBatch', () => {
    it('embeds multiple texts and returns vectors', async () => {
      const mockVectors = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];
      const provider = createMockProvider(mockVectors);
      const embedder = new BatchEmbedder(provider);

      const result = await embedder.embedBatch(['hello', 'world']);

      expect(result).toEqual(mockVectors);
      expect(provider.embed).toHaveBeenCalledWith(['hello', 'world']);
    });

    it('filters out empty strings before embedding', async () => {
      const mockVectors = [[0.1, 0.2, 0.3]];
      const provider = createMockProvider(mockVectors);
      const embedder = new BatchEmbedder(provider);

      const result = await embedder.embedBatch(['hello', '', '  ']);

      expect(result).toEqual(mockVectors);
      expect(provider.embed).toHaveBeenCalledWith(['hello']);
    });

    it('returns empty array when all texts are empty', async () => {
      const provider = createMockProvider([]);
      const embedder = new BatchEmbedder(provider);

      const result = await embedder.embedBatch(['', '  ', '\t']);

      expect(result).toEqual([]);
      expect(provider.embed).not.toHaveBeenCalled();
    });
  });
});
