import { InMemoryEmbeddingStore } from '../embeddings/embedding-store.js';

describe('InMemoryEmbeddingStore', () => {
  let store: InMemoryEmbeddingStore;

  beforeEach(() => {
    store = new InMemoryEmbeddingStore();
  });

  it('stores and retrieves embeddings', () => {
    store.addEmbeddings('nb1', [
      {
        chunkId: 'c1',
        vector: [1, 0, 0],
        text: 'hello',
        sourceId: 's1',
        index: 0,
        position: { page: 1 },
      },
    ]);
    const results = store.search('nb1', [1, 0, 0], 1);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('c1');
  });

  it('returns top-K sorted by score descending', () => {
    store.addEmbeddings('nb1', [
      { chunkId: 'c1', vector: [1, 0, 0], text: 'a', sourceId: 's1', index: 0, position: {} },
      { chunkId: 'c2', vector: [0, 1, 0], text: 'b', sourceId: 's1', index: 1, position: {} },
      { chunkId: 'c3', vector: [0.9, 0.1, 0], text: 'c', sourceId: 's1', index: 2, position: {} },
    ]);
    const results = store.search('nb1', [1, 0, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    expect(results[0]!.id).toBe('c1');
  });

  it('computes cosine similarity correctly', () => {
    store.addEmbeddings('nb1', [
      { chunkId: 'c1', vector: [1, 0], text: 'x', sourceId: 's1', index: 0, position: {} },
    ]);
    const results = store.search('nb1', [1, 0], 1);
    expect(results[0]!.score).toBeCloseTo(1.0);

    const results2 = store.search('nb1', [0, 1], 1);
    expect(results2[0]!.score).toBeCloseTo(0.0);
  });

  it('scopes search to specific notebook', () => {
    store.addEmbeddings('nb1', [
      { chunkId: 'c1', vector: [1, 0], text: 'a', sourceId: 's1', index: 0, position: {} },
    ]);
    store.addEmbeddings('nb2', [
      { chunkId: 'c2', vector: [0, 1], text: 'b', sourceId: 's2', index: 0, position: {} },
    ]);
    const results = store.search('nb1', [1, 0], 10);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('c1');
  });
});
