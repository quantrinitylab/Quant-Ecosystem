// ============================================================================
// Performance Package - Cache Invalidation
// TTL-based, event-driven, tag-based, stampede prevention, probabilistic early expiration
// ============================================================================

import type { InvalidationEvent, InvalidationStrategy, StampedeConfig } from '../types';

/** Invalidation subscription callback */
type InvalidationCallback = (event: InvalidationEvent) => void;

/** Dependency tracking entry */
interface DependencyEntry {
  key: string;
  dependsOn: Set<string>;
  dependedBy: Set<string>;
}

/** Singleflight entry for stampede prevention */
interface SingleflightEntry<T> {
  promise: Promise<T>;
  startedAt: number;
  subscriberCount: number;
}

/** TTL tracking entry */
interface TTLEntry {
  key: string;
  expiresAt: number;
  tags: string[];
  earlyExpirationProbability: number;
}

/**
 * CacheInvalidator implements multiple invalidation strategies:
 * - TTL-based expiration with proactive cleanup
 * - Event-driven pub/sub invalidation
 * - Tag-based group invalidation
 * - Stampede prevention using singleflight pattern
 * - Probabilistic early expiration to prevent thundering herd
 */
export class CacheInvalidator {
  private readonly subscribers: Map<string, Set<InvalidationCallback>>;
  private readonly globalSubscribers: Set<InvalidationCallback>;
  private readonly ttlEntries: Map<string, TTLEntry>;
  private readonly tagIndex: Map<string, Set<string>>;
  private readonly dependencies: Map<string, DependencyEntry>;
  private readonly singleflightMap: Map<string, SingleflightEntry<unknown>>;
  private readonly stampedeConfig: StampedeConfig;
  private readonly eventLog: InvalidationEvent[];
  private readonly maxEventLogSize: number;
  private eventCounter: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null;

  constructor(stampedeConfig: Partial<StampedeConfig> = {}) {
    this.subscribers = new Map();
    this.globalSubscribers = new Set();
    this.ttlEntries = new Map();
    this.tagIndex = new Map();
    this.dependencies = new Map();
    this.singleflightMap = new Map();
    this.eventLog = [];
    this.maxEventLogSize = 1000;
    this.eventCounter = 0;
    this.cleanupInterval = null;

    this.stampedeConfig = {
      enabled: stampedeConfig.enabled ?? true,
      lockTimeoutMs: stampedeConfig.lockTimeoutMs ?? 5000,
      probabilisticEarlyExpiration: stampedeConfig.probabilisticEarlyExpiration ?? true,
      beta: stampedeConfig.beta ?? 1.0,
    };
  }

  /**
   * Register a key with TTL for automatic invalidation.
   */
  registerTTL(key: string, ttlMs: number, tags: string[] = []): void {
    const entry: TTLEntry = {
      key,
      expiresAt: Date.now() + ttlMs,
      tags,
      earlyExpirationProbability: 0,
    };

    this.ttlEntries.set(key, entry);

    // Index by tags
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }
  }

  /**
   * Check if a key should be considered expired, including
   * probabilistic early expiration to prevent thundering herd.
   */
  shouldInvalidate(key: string): boolean {
    const entry = this.ttlEntries.get(key);
    if (!entry) return false;

    const now = Date.now();
    const remaining = entry.expiresAt - now;

    // Definitely expired
    if (remaining <= 0) return true;

    // Probabilistic early expiration (XFetch algorithm)
    if (this.stampedeConfig.probabilisticEarlyExpiration) {
      const ttl = entry.expiresAt - (entry.expiresAt - remaining);
      const delta = remaining;
      const beta = this.stampedeConfig.beta;
      // P(expire) = exp(-delta / (beta * ttl))
      // Higher probability as we approach expiration
      const probability = Math.exp(-delta / (beta * Math.max(remaining, 1)));
      const random = Math.random();
      if (random < probability * 0.1) {
        return true;
      }
    }

    return false;
  }

  /**
   * Invalidate by TTL - check all entries and invalidate expired ones.
   */
  invalidateExpired(): string[] {
    const invalidated: string[] = [];
    const now = Date.now();

    for (const [key, entry] of this.ttlEntries) {
      if (now >= entry.expiresAt) {
        this.invalidateKey(key, 'TTL');
        invalidated.push(key);
      }
    }

    return invalidated;
  }

  /**
   * Invalidate a specific key and notify subscribers.
   */
  invalidateKey(key: string, strategy: InvalidationStrategy = 'EVENT_DRIVEN'): void {
    const entry = this.ttlEntries.get(key);
    const tags = entry?.tags ?? [];

    // Remove from TTL tracking
    this.ttlEntries.delete(key);

    // Remove from tag index
    for (const tag of tags) {
      const tagSet = this.tagIndex.get(tag);
      if (tagSet) {
        tagSet.delete(key);
        if (tagSet.size === 0) this.tagIndex.delete(tag);
      }
    }

    // Create invalidation event
    const event = this.createEvent(strategy, key, tags);

    // Notify key-specific subscribers
    const keySubscribers = this.subscribers.get(key);
    if (keySubscribers) {
      for (const callback of keySubscribers) {
        callback(event);
      }
    }

    // Notify global subscribers
    for (const callback of this.globalSubscribers) {
      callback(event);
    }

    // Cascade to dependents
    this.cascadeDependencies(key, strategy);
  }

  /**
   * Invalidate all entries with a matching tag.
   */
  invalidateByTag(tag: string): string[] {
    const keys = this.tagIndex.get(tag);
    if (!keys || keys.size === 0) return [];

    const invalidated: string[] = [];
    const keysCopy = [...keys]; // Copy since invalidateKey modifies the set

    for (const key of keysCopy) {
      this.invalidateKey(key, 'TAG_BASED');
      invalidated.push(key);
    }

    return invalidated;
  }

  /**
   * Invalidate using a pattern (glob-style matching).
   */
  invalidateByPattern(pattern: string): string[] {
    const regex = this.globToRegex(pattern);
    const invalidated: string[] = [];

    for (const key of this.ttlEntries.keys()) {
      if (regex.test(key)) {
        this.invalidateKey(key, 'PATTERN');
        invalidated.push(key);
      }
    }

    return invalidated;
  }

  /**
   * Subscribe to invalidation events for a specific key.
   */
  subscribe(key: string, callback: InvalidationCallback): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(key);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) this.subscribers.delete(key);
      }
    };
  }

  /**
   * Subscribe to all invalidation events globally.
   */
  subscribeAll(callback: InvalidationCallback): () => void {
    this.globalSubscribers.add(callback);
    return () => { this.globalSubscribers.delete(callback); };
  }

  /**
   * Register a dependency between cache keys.
   * When parent is invalidated, dependent is also invalidated.
   */
  addDependency(key: string, dependsOn: string): void {
    // Set up the dependent entry
    if (!this.dependencies.has(key)) {
      this.dependencies.set(key, { key, dependsOn: new Set(), dependedBy: new Set() });
    }
    this.dependencies.get(key)!.dependsOn.add(dependsOn);

    // Set up the parent entry
    if (!this.dependencies.has(dependsOn)) {
      this.dependencies.set(dependsOn, { key: dependsOn, dependsOn: new Set(), dependedBy: new Set() });
    }
    this.dependencies.get(dependsOn)!.dependedBy.add(key);
  }

  /**
   * Singleflight pattern: ensures only one request is in-flight for a given key.
   * All concurrent callers share the same promise result.
   */
  async singleflight<T>(key: string, loader: () => Promise<T>): Promise<T> {
    // Check if there is already an in-flight request
    const existing = this.singleflightMap.get(key) as SingleflightEntry<T> | undefined;
    if (existing) {
      existing.subscriberCount++;
      return existing.promise;
    }

    // Create new singleflight entry
    const promise = loader().finally(() => {
      this.singleflightMap.delete(key);
    });

    const entry: SingleflightEntry<T> = {
      promise,
      startedAt: Date.now(),
      subscriberCount: 1,
    };

    this.singleflightMap.set(key, entry as SingleflightEntry<unknown>);

    // Add timeout protection
    if (this.stampedeConfig.lockTimeoutMs > 0) {
      const timeout = new Promise<T>((_, reject) => {
        setTimeout(() => {
          this.singleflightMap.delete(key);
          reject(new Error(`Singleflight timeout for key: ${key}`));
        }, this.stampedeConfig.lockTimeoutMs);
      });

      return Promise.race([promise, timeout]);
    }

    return promise;
  }

  /**
   * Get event log for auditing.
   */
  getEventLog(limit: number = 100): InvalidationEvent[] {
    return this.eventLog.slice(-limit);
  }

  /**
   * Get active entry count.
   */
  getActiveEntryCount(): number {
    return this.ttlEntries.size;
  }

  /**
   * Get tags and their associated key counts.
   */
  getTagStats(): Map<string, number> {
    const stats = new Map<string, number>();
    for (const [tag, keys] of this.tagIndex) {
      stats.set(tag, keys.size);
    }
    return stats;
  }

  /**
   * Start periodic cleanup of expired entries.
   */
  startCleanup(intervalMs: number = 10000): void {
    this.stopCleanup();
    this.cleanupInterval = setInterval(() => {
      this.invalidateExpired();
    }, intervalMs);
  }

  /** Stop periodic cleanup */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /** Get pending singleflight count */
  getPendingSingleflightCount(): number {
    return this.singleflightMap.size;
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Cascade invalidation to dependent keys */
  private cascadeDependencies(key: string, strategy: InvalidationStrategy): void {
    const entry = this.dependencies.get(key);
    if (!entry) return;

    for (const dependentKey of entry.dependedBy) {
      this.invalidateKey(dependentKey, 'DEPENDENCY');
    }

    // Clean up dependency tracking
    for (const parentKey of entry.dependsOn) {
      const parent = this.dependencies.get(parentKey);
      if (parent) parent.dependedBy.delete(key);
    }
    this.dependencies.delete(key);
  }

  /** Create an invalidation event and log it */
  private createEvent(strategy: InvalidationStrategy, target: string, tags: string[]): InvalidationEvent {
    const event: InvalidationEvent = {
      id: `inv-${++this.eventCounter}`,
      strategy,
      target,
      tags,
      timestamp: Date.now(),
      propagated: true,
      source: 'cache-invalidator',
    };

    this.eventLog.push(event);
    if (this.eventLog.length > this.maxEventLogSize) {
      this.eventLog.shift();
    }

    return event;
  }

  /** Convert glob pattern to regex */
  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }
}
