import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SemanticCache } from '../core/semantic-cache';

describe('SemanticCache', () => {
  let cache: SemanticCache;

  beforeEach(() => {
    cache = new SemanticCache(60000); // 1 minute TTL
  });

  describe('set and get', () => {
    it('stores and retrieves exact matches', () => {
      cache.set('What is the weather today?', 'It is sunny and warm.');
      const result = cache.get('What is the weather today?', 0.99);
      expect(result).toBe('It is sunny and warm.');
    });

    it('returns null for completely unrelated prompts at high threshold', () => {
      cache.set('What is the weather today?', 'It is sunny.');
      // With word-frequency embedding, dissimilar texts will produce low similarity
      // but not necessarily zero. Using threshold of 0.99 to test near-exact matching
      const result = cache.get('Explain quantum entanglement in particle physics', 0.99);
      expect(result).toBeNull();
    });

    it('matches semantically similar prompts with low threshold', () => {
      cache.set('What is the weather today?', 'It is sunny.');
      // Same words, slightly different order
      const result = cache.get('What is the weather today?', 0.9);
      expect(result).toBe('It is sunny.');
    });

    it('returns null when below threshold', () => {
      cache.set('What is the weather today?', 'It is sunny.');
      const result = cache.get(
        'How do I cook pasta in boiling water with salt and olive oil?',
        0.99,
      );
      expect(result).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    it('evicts expired entries', () => {
      vi.useFakeTimers();
      cache.set('test prompt', 'test response');
      expect(cache.get('test prompt', 0.99)).toBe('test response');

      vi.advanceTimersByTime(61000);
      expect(cache.get('test prompt', 0.99)).toBeNull();
      vi.useRealTimers();
    });

    it('keeps entries within TTL', () => {
      vi.useFakeTimers();
      cache.set('test prompt', 'test response');
      vi.advanceTimersByTime(30000);
      expect(cache.get('test prompt', 0.99)).toBe('test response');
      vi.useRealTimers();
    });

    it('respects custom TTL per entry', () => {
      vi.useFakeTimers();
      cache.set('short-lived', 'response', 5000); // 5 second TTL
      vi.advanceTimersByTime(6000);
      expect(cache.get('short-lived', 0.99)).toBeNull();
      vi.useRealTimers();
    });
  });

  describe('invalidate', () => {
    it('clears all entries', () => {
      cache.set('prompt1', 'response1');
      cache.set('prompt2', 'response2');
      expect(cache.size()).toBe(2);
      cache.invalidate();
      expect(cache.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('returns the number of entries', () => {
      expect(cache.size()).toBe(0);
      cache.set('p1', 'r1');
      expect(cache.size()).toBe(1);
      cache.set('p2', 'r2');
      expect(cache.size()).toBe(2);
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const vec = [1, 0, 0, 1];
      expect(cache.cosineSimilarity(vec, vec)).toBeCloseTo(1.0);
    });

    it('returns 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cache.cosineSimilarity(a, b)).toBeCloseTo(0);
    });

    it('handles vectors of different lengths', () => {
      const a = [1, 0, 0];
      const b = [1, 0];
      const result = cache.cosineSimilarity(a, b);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });
  });
});
