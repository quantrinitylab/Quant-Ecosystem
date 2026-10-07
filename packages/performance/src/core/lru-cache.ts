// ============================================================================
// Performance Package - LRU Cache with Doubly-Linked List
// O(1) get/put operations via Map + linked list nodes
// ============================================================================

import type { LRUConfig, LRUNode } from '../types';

/** Cache statistics */
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRatio: number;
}

/**
 * LRU Cache implementation using a doubly-linked list for O(1) operations.
 * The Map provides O(1) key lookup while the linked list maintains access order.
 * Most recently accessed items move to the head; eviction happens from the tail.
 */
export class LRUCache<T = unknown> {
  private readonly config: LRUConfig;
  private readonly map: Map<string, LRUNode<T>>;
  private head: LRUNode<T> | null;
  private tail: LRUNode<T> | null;
  private currentSize: number;
  private hits: number;
  private misses: number;
  private evictions: number;

  constructor(config: Partial<LRUConfig> = {}) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      ttlMs: config.ttlMs ?? 60000,
      enableStats: config.enableStats ?? true,
      onEvict: config.onEvict,
      warmUpKeys: config.warmUpKeys ?? [],
    };
    this.map = new Map();
    this.head = null;
    this.tail = null;
    this.currentSize = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get a value by key. Moves the node to the head (most recently used).
   * Returns undefined if key not found or entry has expired.
   * Time complexity: O(1)
   */
  get(key: string): T | undefined {
    const node = this.map.get(key);

    if (!node) {
      this.misses++;
      return undefined;
    }

    // Check TTL expiration
    if (this.isExpired(node)) {
      this.removeNode(node);
      this.map.delete(key);
      this.currentSize--;
      this.misses++;
      return undefined;
    }

    // Move to head (most recently used)
    node.accessedAt = Date.now();
    this.moveToHead(node);
    this.hits++;

    return node.value;
  }

  /**
   * Put a key-value pair into the cache.
   * If key exists, update value and move to head.
   * If cache is full, evict from tail (least recently used).
   * Time complexity: O(1)
   */
  put(key: string, value: T, ttl?: number): void {
    const existingNode = this.map.get(key);

    if (existingNode) {
      // Update existing node
      existingNode.value = value;
      existingNode.accessedAt = Date.now();
      existingNode.ttl = ttl ?? this.config.ttlMs;
      this.moveToHead(existingNode);
      return;
    }

    // Create new node
    const newNode: LRUNode<T> = {
      key,
      value,
      prev: null,
      next: null,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      ttl: ttl ?? this.config.ttlMs,
      size: 1,
    };

    // Evict if at capacity
    while (this.currentSize >= this.config.maxSize) {
      this.evictLRU();
    }

    // Add to head
    this.addToHead(newNode);
    this.map.set(key, newNode);
    this.currentSize++;
  }

  /**
   * Delete a key from the cache.
   * Time complexity: O(1)
   */
  delete(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;

    this.removeNode(node);
    this.map.delete(key);
    this.currentSize--;
    return true;
  }

  /**
   * Check if a key exists and is not expired.
   * Does NOT update access time (peek semantics).
   */
  has(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    if (this.isExpired(node)) {
      this.removeNode(node);
      this.map.delete(key);
      this.currentSize--;
      return false;
    }
    return true;
  }

  /**
   * Peek at a value without updating its position in the LRU order.
   */
  peek(key: string): T | undefined {
    const node = this.map.get(key);
    if (!node || this.isExpired(node)) return undefined;
    return node.value;
  }

  /** Clear all entries from the cache */
  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
    this.currentSize = 0;
  }

  /** Get current cache size */
  size(): number {
    return this.currentSize;
  }

  /** Get cache statistics */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      size: this.currentSize,
      hitRatio: total === 0 ? 0 : this.hits / total,
    };
  }

  /** Reset statistics counters */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Warm up the cache with predefined keys using a loader function.
   * Useful for pre-populating frequently accessed data.
   */
  async warmUp(loader: (key: string) => Promise<T>): Promise<number> {
    let loaded = 0;
    for (const key of this.config.warmUpKeys ?? []) {
      try {
        const value = await loader(key);
        this.put(key, value);
        loaded++;
      } catch {
        // Skip failed warm-up entries
      }
    }
    return loaded;
  }

  /**
   * Get all keys in LRU order (most recent first).
   */
  keys(): string[] {
    const keys: string[] = [];
    let current = this.head;
    while (current) {
      if (!this.isExpired(current)) {
        keys.push(current.key);
      }
      current = current.next;
    }
    return keys;
  }

  /**
   * Iterate entries from most to least recently used.
   */
  entries(): Array<[string, T]> {
    const result: Array<[string, T]> = [];
    let current = this.head;
    while (current) {
      if (!this.isExpired(current)) {
        result.push([current.key, current.value]);
      }
      current = current.next;
    }
    return result;
  }

  /**
   * Remove all expired entries (garbage collection pass).
   */
  prune(): number {
    let pruned = 0;
    let current = this.tail;
    while (current) {
      const prev = current.prev;
      if (this.isExpired(current)) {
        this.removeNode(current);
        this.map.delete(current.key);
        this.currentSize--;
        pruned++;
      }
      current = prev;
    }
    return pruned;
  }

  /**
   * Update the TTL for an existing key without changing LRU order.
   */
  touch(key: string, newTtl?: number): boolean {
    const node = this.map.get(key);
    if (!node || this.isExpired(node)) return false;
    node.ttl = newTtl ?? this.config.ttlMs;
    node.createdAt = Date.now();
    return true;
  }

  /**
   * Get the least recently used key (candidate for eviction).
   */
  getLRUKey(): string | undefined {
    return this.tail?.key;
  }

  /**
   * Get the most recently used key.
   */
  getMRUKey(): string | undefined {
    return this.head?.key;
  }

  // ===========================================================================
  // Private linked list operations - all O(1)
  // ===========================================================================

  /** Add a node to the head of the doubly-linked list */
  private addToHead(node: LRUNode<T>): void {
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  /** Remove a node from the doubly-linked list */
  private removeNode(node: LRUNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = null;
    node.next = null;
  }

  /** Move an existing node to the head (most recently used position) */
  private moveToHead(node: LRUNode<T>): void {
    if (node === this.head) return;
    this.removeNode(node);
    this.addToHead(node);
  }

  /** Evict the least recently used node (from the tail) */
  private evictLRU(): void {
    if (!this.tail) return;

    const evicted = this.tail;
    this.removeNode(evicted);
    this.map.delete(evicted.key);
    this.currentSize--;
    this.evictions++;

    if (this.config.onEvict) {
      this.config.onEvict(evicted.key, evicted.value);
    }
  }

  /** Check if a node has expired based on its TTL */
  private isExpired(node: LRUNode<T>): boolean {
    if (node.ttl <= 0) return false; // TTL of 0 means no expiration
    return Date.now() - node.createdAt > node.ttl;
  }
}
