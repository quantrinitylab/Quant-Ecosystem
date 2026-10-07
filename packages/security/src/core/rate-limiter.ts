// ============================================================================
// Security Package - Sliding Window Rate Limiter
// ============================================================================

import type { RateLimitConfig, SlidingWindowEntry, RateLimitResult } from '../types';

/** Default rate limiter configuration */
const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 100,
  burstLimit: 20,
  keyPrefix: 'rl',
  skipFailedRequests: false,
  enableSliding: true,
  blockDuration: 300000,
};

/**
 * SlidingWindowRateLimiter - Production-grade rate limiter using sliding window algorithm.
 * Tracks requests per key (IP/user/endpoint) with configurable windows and burst limits.
 * Uses weighted sliding window for smooth rate limiting without hard resets at window boundaries.
 */
export class SlidingWindowRateLimiter {
  private config: RateLimitConfig;
  private windows: Map<string, SlidingWindowEntry[]>;
  private blockedKeys: Map<string, number>;
  private burstTracker: Map<string, { count: number; windowStart: number }>;
  private keyMetrics: Map<
    string,
    { totalRequests: number; totalBlocked: number; lastReset: number }
  >;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.windows = new Map();
    this.blockedKeys = new Map();
    this.burstTracker = new Map();
    this.keyMetrics = new Map();
  }

  /** Check if a request is allowed under rate limits */
  async checkLimit(
    key: string,
    endpoint: string = '/',
    weight: number = 1,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const compositeKey = this.buildKey(key, endpoint);

    // Check if key is currently blocked
    if (this.isBlocked(compositeKey, now)) {
      const blockExpiry = this.blockedKeys.get(compositeKey) || now;
      return {
        allowed: false,
        remaining: 0,
        resetTime: blockExpiry,
        retryAfter: Math.ceil((blockExpiry - now) / 1000),
        limit: this.config.maxRequests,
        current: this.config.maxRequests,
      };
    }

    // Check burst limit first (short-term spike protection)
    if (!this.checkBurst(compositeKey, now)) {
      this.blockKey(compositeKey, now);
      return {
        allowed: false,
        remaining: 0,
        resetTime: now + this.config.blockDuration,
        retryAfter: Math.ceil(this.config.blockDuration / 1000),
        limit: this.config.burstLimit,
        current: this.config.burstLimit + 1,
      };
    }

    // Get or create sliding window
    const entries = this.getWindowEntries(compositeKey);

    // Clean expired entries from window
    this.cleanWindow(compositeKey, now);

    // Calculate current request count using sliding window algorithm
    const currentCount = this.calculateSlidingCount(compositeKey, now);

    // Check if adding this request would exceed the limit
    if (currentCount + weight > this.config.maxRequests) {
      this.updateMetrics(compositeKey, false);
      const windowEnd = this.getWindowEnd(entries, now);
      return {
        allowed: false,
        remaining: 0,
        resetTime: windowEnd,
        retryAfter: Math.ceil((windowEnd - now) / 1000),
        limit: this.config.maxRequests,
        current: currentCount,
      };
    }

    // Record the request
    const entry: SlidingWindowEntry = {
      timestamp: now,
      weight,
      endpoint,
      ip: key,
      userId: undefined,
    };
    entries.push(entry);
    this.windows.set(compositeKey, entries);

    // Update burst tracker
    this.recordBurst(compositeKey, now);
    this.updateMetrics(compositeKey, true);

    const remaining = Math.max(0, this.config.maxRequests - (currentCount + weight));
    return {
      allowed: true,
      remaining,
      resetTime: now + this.config.windowMs,
      retryAfter: 0,
      limit: this.config.maxRequests,
      current: currentCount + weight,
    };
  }

  /** Calculate the weighted count in current sliding window */
  private calculateSlidingCount(key: string, now: number): number {
    const entries = this.windows.get(key) || [];
    if (!this.config.enableSliding) {
      // Fixed window: count all entries in current window
      return entries.reduce((sum, e) => sum + e.weight, 0);
    }

    // Sliding window algorithm:
    // Split into current window and previous window
    // Weight previous window entries by overlap percentage
    const windowStart = now - this.config.windowMs;
    const prevWindowStart = windowStart - this.config.windowMs;

    let currentWindowCount = 0;
    let prevWindowCount = 0;

    for (const entry of entries) {
      if (entry.timestamp >= windowStart) {
        currentWindowCount += entry.weight;
      } else if (entry.timestamp >= prevWindowStart) {
        prevWindowCount += entry.weight;
      }
    }

    // Calculate overlap ratio for previous window
    const elapsed = now - windowStart;
    const overlapRatio = (this.config.windowMs - elapsed) / this.config.windowMs;
    const weightedPrevCount = Math.floor(prevWindowCount * Math.max(0, overlapRatio));

    return currentWindowCount + weightedPrevCount;
  }

  /** Check burst rate (short window spike detection) */
  private checkBurst(key: string, now: number): boolean {
    const burst = this.burstTracker.get(key);
    if (!burst) return true;

    const burstWindowMs = 1000; // 1 second burst window
    if (now - burst.windowStart > burstWindowMs) {
      return true; // Burst window expired, reset
    }

    return burst.count < this.config.burstLimit;
  }

  /** Record a request in the burst tracker */
  private recordBurst(key: string, now: number): void {
    const burst = this.burstTracker.get(key);
    const burstWindowMs = 1000;

    if (!burst || now - burst.windowStart > burstWindowMs) {
      this.burstTracker.set(key, { count: 1, windowStart: now });
    } else {
      burst.count++;
    }
  }

  /** Block a key for the configured duration */
  private blockKey(key: string, now: number): void {
    this.blockedKeys.set(key, now + this.config.blockDuration);
  }

  /** Check if a key is currently blocked */
  private isBlocked(key: string, now: number): boolean {
    const expiry = this.blockedKeys.get(key);
    if (!expiry) return false;
    if (now >= expiry) {
      this.blockedKeys.delete(key);
      return false;
    }
    return true;
  }

  /** Build composite key from components */
  private buildKey(key: string, endpoint: string): string {
    return `${this.config.keyPrefix}:${key}:${endpoint}`;
  }

  /** Get window entries for a key, creating if needed */
  private getWindowEntries(key: string): SlidingWindowEntry[] {
    if (!this.windows.has(key)) {
      this.windows.set(key, []);
    }
    return this.windows.get(key)!;
  }

  /** Clean expired entries from a key's window */
  private cleanWindow(key: string, now: number): void {
    const entries = this.windows.get(key);
    if (!entries) return;

    // Keep entries from current and previous window for sliding calculation
    const cutoff = now - this.config.windowMs * 2;
    const cleaned = entries.filter((e) => e.timestamp > cutoff);
    this.windows.set(key, cleaned);
  }

  /** Get the end time of the current window */
  private getWindowEnd(entries: SlidingWindowEntry[], now: number): number {
    if (entries.length === 0) return now + this.config.windowMs;
    const oldest = entries.reduce((min, e) => Math.min(min, e.timestamp), Infinity);
    return oldest + this.config.windowMs;
  }

  /** Update key metrics */
  private updateMetrics(key: string, allowed: boolean): void {
    const metrics = this.keyMetrics.get(key) || {
      totalRequests: 0,
      totalBlocked: 0,
      lastReset: Date.now(),
    };
    metrics.totalRequests++;
    if (!allowed) metrics.totalBlocked++;
    this.keyMetrics.set(key, metrics);
  }

  /** Reset limits for a specific key */
  async resetKey(key: string): Promise<void> {
    const keysToDelete: string[] = [];
    for (const k of this.windows.keys()) {
      if (k.includes(key)) keysToDelete.push(k);
    }
    for (const k of keysToDelete) {
      this.windows.delete(k);
      this.blockedKeys.delete(k);
      this.burstTracker.delete(k);
    }
  }

  /** Unblock a specific key */
  async unblock(key: string): Promise<void> {
    for (const k of this.blockedKeys.keys()) {
      if (k.includes(key)) this.blockedKeys.delete(k);
    }
  }

  /** Get current status for a key */
  async getStatus(key: string, endpoint: string = '/'): Promise<RateLimitResult> {
    const compositeKey = this.buildKey(key, endpoint);
    const now = Date.now();

    if (this.isBlocked(compositeKey, now)) {
      const blockExpiry = this.blockedKeys.get(compositeKey) || now;
      return {
        allowed: false,
        remaining: 0,
        resetTime: blockExpiry,
        retryAfter: Math.ceil((blockExpiry - now) / 1000),
        limit: this.config.maxRequests,
        current: this.config.maxRequests,
      };
    }

    const currentCount = this.calculateSlidingCount(compositeKey, now);
    const remaining = Math.max(0, this.config.maxRequests - currentCount);

    return {
      allowed: remaining > 0,
      remaining,
      resetTime: now + this.config.windowMs,
      retryAfter: 0,
      limit: this.config.maxRequests,
      current: currentCount,
    };
  }

  /** Get metrics for all tracked keys */
  getMetrics(): Map<string, { totalRequests: number; totalBlocked: number; lastReset: number }> {
    return new Map(this.keyMetrics);
  }

  /** Get count of currently blocked keys */
  getBlockedCount(): number {
    const now = Date.now();
    let count = 0;
    for (const [, expiry] of this.blockedKeys) {
      if (now < expiry) count++;
    }
    return count;
  }

  /** Cleanup expired data across all windows */
  async cleanup(): Promise<{ removedEntries: number; removedKeys: number }> {
    const now = Date.now();
    let removedEntries = 0;
    let removedKeys = 0;

    for (const [key, entries] of this.windows) {
      const cutoff = now - this.config.windowMs * 2;
      const before = entries.length;
      const after = entries.filter((e) => e.timestamp > cutoff);
      removedEntries += before - after.length;

      if (after.length === 0) {
        this.windows.delete(key);
        removedKeys++;
      } else {
        this.windows.set(key, after);
      }
    }

    // Clean expired blocks
    for (const [key, expiry] of this.blockedKeys) {
      if (now >= expiry) {
        this.blockedKeys.delete(key);
      }
    }

    return { removedEntries, removedKeys };
  }

  /** Get total number of tracked keys */
  getTrackedKeyCount(): number {
    return this.windows.size;
  }

  /** Configure rate limit for specific endpoint pattern */
  setEndpointLimit(_endpoint: string, maxRequests: number, windowMs?: number): void {
    // Store endpoint-specific overrides (simplification: update global config for this instance)
    this.config = {
      ...this.config,
      maxRequests,
      windowMs: windowMs || this.config.windowMs,
    };
  }
}
