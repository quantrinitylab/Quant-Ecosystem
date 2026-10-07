import { EventEmitter } from 'events';

export interface CacheConfig {
  ttl: number;
  maxSize: number;
  strategy: 'lru' | 'lfu' | 'fifo';
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
  lastAccessed: number;
}

export class CacheManager extends EventEmitter {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    super();
    this.config = {
      ttl: 300000, // 5 minutes default
      maxSize: 10000,
      strategy: 'lru',
      ...config,
    };

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.emit('cache:miss', { key });
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.emit('cache:miss', { key, reason: 'expired' });
      return null;
    }

    // Update access info
    entry.hits++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;

    this.emit('cache:hit', { key, hits: entry.hits });
    return entry.value;
  }

  async set<T>(key: string, value: T, customTTL?: number): Promise<void> {
    // Evict if at max size
    if (this.cache.size >= this.config.maxSize) {
      this.evict();
    }

    const ttl = customTTL || this.config.ttl;
    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttl,
      hits: 0,
      lastAccessed: Date.now(),
    };

    this.cache.set(key, entry);
    this.emit('cache:set', { key, ttl });
  }

  async delete(key: string): Promise<boolean> {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.emit('cache:delete', { key });
    }
    return deleted;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.emit('cache:clear');
  }

  private evict(): void {
    if (this.config.strategy === 'lru') {
      this.evictLRU();
    } else if (this.config.strategy === 'lfu') {
      this.evictLFU();
    } else {
      this.evictFIFO();
    }
    this.stats.evictions++;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.emit('cache:evict', { key: oldestKey, strategy: 'lru' });
    }
  }

  private evictLFU(): void {
    let leastUsedKey: string | null = null;
    let leastHits = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.hits < leastHits) {
        leastHits = entry.hits;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
      this.emit('cache:evict', { key: leastUsedKey, strategy: 'lfu' });
    }
  }

  private evictFIFO(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
      this.emit('cache:evict', { key: firstKey, strategy: 'fifo' });
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.emit('cache:cleanup', { cleaned });
    }
  }

  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
    };
  }
}

export const cacheManager = new CacheManager();
