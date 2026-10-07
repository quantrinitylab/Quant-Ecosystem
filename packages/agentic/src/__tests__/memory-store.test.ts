import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryStore, EmbeddingProvider } from '../memory/memory-store.js';

describe('MemoryStore - vector similarity search', () => {
  let store: MemoryStore;
  let mockEmbeddingProvider: EmbeddingProvider;

  beforeEach(() => {
    mockEmbeddingProvider = {
      generateEmbedding: vi.fn(),
    };
    store = new MemoryStore('test-agent', mockEmbeddingProvider);
  });

  it('stores items and generates embeddings', async () => {
    (mockEmbeddingProvider.generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValue([
      0.1, 0.2, 0.3,
    ]);

    const id = await store.store({ type: 'note', content: 'Hello world' });

    expect(id).toBeTruthy();
    expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalledWith('Hello world');

    const item = await store.retrieve(id);
    expect(item?.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it('uses vector search when embedding provider is available', async () => {
    // Store items with known embeddings
    (mockEmbeddingProvider.generateEmbedding as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([1, 0, 0]) // first item
      .mockResolvedValueOnce([0, 1, 0]) // second item
      .mockResolvedValueOnce([0.9, 0.1, 0]); // query embedding

    await store.store({ type: 'note', content: 'about emails' });
    await store.store({ type: 'note', content: 'about meetings' });

    const results = await store.retrieveRelevant('emails');

    // Should return the first item as more similar (closer to query vector)
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.content).toBe('about emails');
  });

  it('falls back to keyword search when embedding fails', async () => {
    (mockEmbeddingProvider.generateEmbedding as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([1, 0, 0]) // stored successfully
      .mockRejectedValueOnce(new Error('API error')); // query fails

    await store.store({ type: 'note', content: 'email discussion' });

    const results = await store.retrieveRelevant('email');

    expect(results.length).toBe(1);
    expect(results[0]?.content).toBe('email discussion');
  });

  it('works without embedding provider (keyword fallback)', async () => {
    const plainStore = new MemoryStore('test-agent');

    await plainStore.store({ type: 'note', content: 'AI research paper' });
    await plainStore.store({ type: 'note', content: 'Grocery list' });

    const results = await plainStore.retrieveRelevant('research');

    expect(results.length).toBe(1);
    expect(results[0]?.content).toBe('AI research paper');
  });

  it('setEmbeddingProvider enables vector search after construction', async () => {
    const plainStore = new MemoryStore('test-agent');

    await plainStore.store({ type: 'note', content: 'old item no embedding' });

    const provider: EmbeddingProvider = {
      generateEmbedding: vi.fn().mockResolvedValue([1, 0, 0]),
    };
    plainStore.setEmbeddingProvider(provider);

    await plainStore.store({ type: 'note', content: 'new item with embedding' });

    // The new item should have an embedding
    const recent = await plainStore.getRecent(2);
    const newItem = recent.find((i) => i.content === 'new item with embedding');
    expect(newItem?.embedding).toEqual([1, 0, 0]);
  });

  it('respects limit parameter', async () => {
    const plainStore = new MemoryStore('test-agent');

    await plainStore.store({ type: 'note', content: 'item alpha one' });
    await plainStore.store({ type: 'note', content: 'item alpha two' });
    await plainStore.store({ type: 'note', content: 'item alpha three' });

    const results = await plainStore.retrieveRelevant('alpha', 2);
    expect(results.length).toBe(2);
  });
});
