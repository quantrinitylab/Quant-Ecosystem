// ============================================================================
// AI Core - Semantic Cache
// ============================================================================

import type { SemanticCacheEntry } from '../types';

/** Default TTL for cache entries: 5 minutes */
const DEFAULT_TTL_MS = 300_000;

/** Default similarity threshold for cache hits */
const DEFAULT_THRESHOLD = 0.92;

/**
 * Semantic Cache
 *
 * In-memory cache that uses Jaccard similarity over word sets to match
 * semantically similar prompts. This approach correctly handles prompts
 * with shared vocabulary regardless of word order.
 */
export class SemanticCache {
  private entries: SemanticCacheEntry[] = [];
  private defaultTtl: number;

  constructor(defaultTtl: number = DEFAULT_TTL_MS) {
    this.defaultTtl = defaultTtl;
  }

  /**
   * Get a cached response for a semantically similar prompt
   */
  get(prompt: string, threshold: number = DEFAULT_THRESHOLD): string | null {
    this.evictExpired();

    const queryWords = this.extractWordSet(prompt);

    let bestMatch: SemanticCacheEntry | null = null;
    let bestSimilarity = -1;

    for (const entry of this.entries) {
      const entryWords = this.extractWordSet(entry.prompt);
      const similarity = this.jaccardSimilarity(queryWords, entryWords);
      if (similarity >= threshold && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = entry;
      }
    }

    return bestMatch ? bestMatch.response : null;
  }

  /**
   * Store a prompt-response pair in the cache
   */
  set(prompt: string, response: string, ttl?: number): void {
    const embedding = this.computeEmbedding(prompt);
    const entry: SemanticCacheEntry = {
      prompt,
      response,
      embedding,
      createdAt: Date.now(),
      ttl: ttl ?? this.defaultTtl,
    };
    this.entries.push(entry);
  }

  /**
   * Invalidate all cache entries
   */
  invalidate(): void {
    this.entries = [];
  }

  /**
   * Get the number of entries in the cache
   */
  size(): number {
    this.evictExpired();
    return this.entries.length;
  }

  /**
   * Extract a normalized word set from text (for Jaccard similarity)
   */
  extractWordSet(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    return new Set(words);
  }

  /**
   * Compute Jaccard similarity between two word sets.
   * Returns |A intersect B| / |A union B|.
   */
  jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;

    let intersectionSize = 0;
    for (const word of a) {
      if (b.has(word)) {
        intersectionSize++;
      }
    }

    const unionSize = a.size + b.size - intersectionSize;
    if (unionSize === 0) return 0;

    return intersectionSize / unionSize;
  }

  /**
   * Compute a simple word-frequency vector embedding (kept for interface compatibility)
   */
  computeEmbedding(text: string): number[] {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    const vocab = new Map<string, number>();

    for (const word of words) {
      if (!vocab.has(word)) {
        vocab.set(word, vocab.size);
      }
    }

    const vector = new Array(Math.max(vocab.size, 1)).fill(0);
    for (const word of words) {
      const idx = vocab.get(word);
      if (idx !== undefined) {
        vector[idx]++;
      }
    }

    const magnitude = Math.sqrt(vector.reduce((sum: number, v: number) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  /**
   * Compute cosine similarity between two vectors (kept for backward compatibility)
   */
  cosineSimilarity(a: number[], b: number[]): number {
    const minLen = Math.min(a.length, b.length);
    if (minLen === 0) return 0;

    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < minLen; i++) {
      dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
      magA += (a[i] ?? 0) * (a[i] ?? 0);
      magB += (b[i] ?? 0) * (b[i] ?? 0);
    }

    for (let i = minLen; i < a.length; i++) {
      magA += (a[i] ?? 0) * (a[i] ?? 0);
    }
    for (let i = minLen; i < b.length; i++) {
      magB += (b[i] ?? 0) * (b[i] ?? 0);
    }

    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * Evict expired entries
   */
  private evictExpired(): void {
    const now = Date.now();
    this.entries = this.entries.filter((entry) => now - entry.createdAt < entry.ttl);
  }
}
