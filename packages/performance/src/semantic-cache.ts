// ============================================================================
// Performance Package - Semantic LLM Cache
// Caches LLM responses based on embedding similarity with TTL eviction
// ============================================================================

/** Cached entry for an LLM response */
export interface SemanticCacheEntry {
  prompt: string;
  embedding: number[];
  response: string;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
}

/** Result from a cache lookup */
export interface SemanticCacheHit {
  response: string;
  similarity: number;
  prompt: string;
  hitCount: number;
}

/** Cache statistics */
export interface SemanticCacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

/**
 * SemanticLLMCache caches LLM responses and retrieves them based on
 * cosine similarity between prompt embeddings. Supports TTL-based eviction.
 */
export class SemanticLLMCache {
  private readonly entries: Map<string, SemanticCacheEntry>;
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;
  private hits: number;
  private misses: number;
  private evictions: number;

  constructor(config: { maxSize?: number; defaultTtlMs?: number } = {}) {
    this.entries = new Map();
    this.maxSize = config.maxSize ?? 1000;
    this.defaultTtlMs = config.defaultTtlMs ?? 3600000; // 1 hour
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Look up a cached response by finding the closest embedding
   * above the similarity threshold.
   */
  get(promptEmbedding: number[], threshold: number = 0.92): SemanticCacheHit | null {
    this.evictExpired();

    let bestMatch: SemanticCacheEntry | null = null;
    let bestSimilarity = -1;

    for (const [, entry] of this.entries) {
      const similarity = this.cosineSimilarity(promptEmbedding, entry.embedding);
      if (similarity >= threshold && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      bestMatch.hitCount++;
      this.hits++;
      return {
        response: bestMatch.response,
        similarity: bestSimilarity,
        prompt: bestMatch.prompt,
        hitCount: bestMatch.hitCount,
      };
    }

    this.misses++;
    return null;
  }

  /**
   * Store an LLM response with its embedding for future similarity lookups.
   * If a cache entry with the same prompt already exists, it is replaced.
   */
  set(prompt: string, embedding: number[], response: string, ttlMs?: number): void {
    this.evictExpired();

    const key = this.generateKey(prompt);

    // If same prompt already cached, replace it (deduplication)
    if (!this.entries.has(key)) {
      // Only evict if adding a new entry and at capacity
      if (this.entries.size >= this.maxSize) {
        this.evictLeastUsed();
      }
    }

    const now = Date.now();

    this.entries.set(key, {
      prompt,
      embedding,
      response,
      createdAt: now,
      expiresAt: now + (ttlMs ?? this.defaultTtlMs),
      hitCount: 0,
    });
  }

  /**
   * Invalidate cache entries matching a pattern (substring match on prompt).
   */
  invalidate(pattern: string): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.prompt.includes(pattern)) {
        this.entries.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats(): SemanticCacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Compute cosine similarity between two vectors */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /** Remove expired entries */
  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        this.evictions++;
      }
    }
  }

  /** Evict the least-used entry */
  private evictLeastUsed(): void {
    let leastKey: string | null = null;
    let leastHits = Infinity;

    for (const [key, entry] of this.entries) {
      if (entry.hitCount < leastHits) {
        leastHits = entry.hitCount;
        leastKey = key;
      }
    }

    if (leastKey) {
      this.entries.delete(leastKey);
      this.evictions++;
    }
  }

  /** Generate a content-addressable key from a prompt (hash-only, no timestamp) */
  private generateKey(prompt: string): string {
    // Simple hash for key generation - content-addressable so same prompt always maps to same key
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `sem_${hash}`;
  }
}
