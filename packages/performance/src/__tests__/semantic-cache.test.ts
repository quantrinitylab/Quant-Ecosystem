import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticLLMCache } from '../semantic-cache.js';

describe('SemanticLLMCache', () => {
  let cache: SemanticLLMCache;

  beforeEach(() => {
    cache = new SemanticLLMCache({ maxSize: 100, defaultTtlMs: 60000 });
  });

  it('stores and retrieves a cached response by embedding similarity', () => {
    const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    cache.set('What is TypeScript?', embedding, 'TypeScript is a typed superset of JavaScript.');

    // Same embedding should match perfectly
    const hit = cache.get(embedding, 0.99);
    expect(hit).not.toBeNull();
    expect(hit!.response).toBe('TypeScript is a typed superset of JavaScript.');
    expect(hit!.similarity).toBeCloseTo(1.0, 5);
  });

  it('returns null when no embedding is similar enough', () => {
    const embedding1 = [1, 0, 0, 0, 0];
    const embedding2 = [0, 0, 0, 0, 1]; // orthogonal

    cache.set('Prompt A', embedding1, 'Response A');

    const hit = cache.get(embedding2, 0.9);
    expect(hit).toBeNull();
  });

  it('finds similar embeddings above threshold', () => {
    const embedding1 = [0.9, 0.1, 0.0, 0.0];
    const embedding2 = [0.85, 0.15, 0.05, 0.0]; // very similar

    cache.set('Prompt', embedding1, 'Response');

    const hit = cache.get(embedding2, 0.9);
    expect(hit).not.toBeNull();
    expect(hit!.similarity).toBeGreaterThan(0.9);
  });

  it('evicts expired entries', async () => {
    cache = new SemanticLLMCache({ maxSize: 100, defaultTtlMs: 50 });
    const embedding = [1, 0, 0];
    cache.set('Prompt', embedding, 'Response');

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    const hit = cache.get(embedding);
    expect(hit).toBeNull();
  });

  it('evicts least-used entries when at capacity', () => {
    cache = new SemanticLLMCache({ maxSize: 2, defaultTtlMs: 60000 });

    cache.set('Prompt 1', [1, 0, 0], 'Response 1');
    cache.set('Prompt 2', [0, 1, 0], 'Response 2');

    // Access prompt 2 to increase hit count
    cache.get([0, 1, 0], 0.99);

    // This should evict prompt 1 (least used)
    cache.set('Prompt 3', [0, 0, 1], 'Response 3');

    const stats = cache.getStats();
    expect(stats.size).toBeLessThanOrEqual(2);
  });

  it('invalidates entries matching a pattern', () => {
    cache.set('What is TypeScript?', [1, 0, 0], 'Response 1');
    cache.set('What is JavaScript?', [0, 1, 0], 'Response 2');
    cache.set('How to cook pasta?', [0, 0, 1], 'Response 3');

    const removed = cache.invalidate('What is');
    expect(removed).toBe(2);

    const stats = cache.getStats();
    expect(stats.size).toBe(1);
  });

  it('clears all entries', () => {
    cache.set('Prompt 1', [1, 0, 0], 'Response 1');
    cache.set('Prompt 2', [0, 1, 0], 'Response 2');

    cache.clear();

    const stats = cache.getStats();
    expect(stats.size).toBe(0);
  });

  it('tracks hit and miss statistics', () => {
    cache.set('Prompt', [1, 0, 0], 'Response');

    cache.get([1, 0, 0], 0.99); // hit
    cache.get([0, 1, 0], 0.99); // miss
    cache.get([0, 0, 1], 0.99); // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBeCloseTo(1 / 3, 5);
  });

  it('increments hit count on cache hits', () => {
    cache.set('Prompt', [1, 0, 0], 'Response');

    const hit1 = cache.get([1, 0, 0], 0.99);
    expect(hit1!.hitCount).toBe(1);

    const hit2 = cache.get([1, 0, 0], 0.99);
    expect(hit2!.hitCount).toBe(2);
  });
});
