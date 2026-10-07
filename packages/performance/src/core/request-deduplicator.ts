// ============================================================================
// Performance Package - Request Deduplicator
// Concurrent request coalescing via shared promises, circuit breaker
// ============================================================================

import type { DeduplicationConfig, DeduplicationRequest, PendingRequest } from '../types';

/** Circuit breaker state */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Circuit breaker tracking */
interface CircuitBreaker {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  successCount: number;
  lastStateChange: number;
}

/** Deduplication statistics */
interface DeduplicationStats {
  totalRequests: number;
  deduplicatedRequests: number;
  timeouts: number;
  circuitBreakerTrips: number;
  averageSubscribers: number;
}

/**
 * RequestDeduplicator coalesces concurrent requests for the same resource
 * into a single actual request, sharing the result across all callers.
 * Includes circuit breaker protection and configurable timeout handling.
 */
export class RequestDeduplicator {
  private readonly config: DeduplicationConfig;
  private readonly pending: Map<string, PendingRequest<unknown>>;
  private readonly circuitBreakers: Map<string, CircuitBreaker>;
  private readonly stats: DeduplicationStats;

  constructor(config: Partial<DeduplicationConfig> = {}) {
    this.config = {
      maxPendingRequests: config.maxPendingRequests ?? 1000,
      timeoutMs: config.timeoutMs ?? 10000,
      keyGenerator: config.keyGenerator ?? this.defaultKeyGenerator,
      enableCircuitBreaker: config.enableCircuitBreaker ?? true,
      circuitBreakerThreshold: config.circuitBreakerThreshold ?? 5,
      circuitBreakerResetMs: config.circuitBreakerResetMs ?? 30000,
    };

    this.pending = new Map();
    this.circuitBreakers = new Map();
    this.stats = {
      totalRequests: 0,
      deduplicatedRequests: 0,
      timeouts: 0,
      circuitBreakerTrips: 0,
      averageSubscribers: 0,
    };
  }

  /**
   * Execute a request with deduplication. If a request with the same key
   * is already in-flight, the caller will share the existing promise.
   */
  async execute<T>(
    request: DeduplicationRequest,
    executor: () => Promise<T>
  ): Promise<T> {
    this.stats.totalRequests++;

    const key = this.config.keyGenerator(request);

    // Check circuit breaker
    if (this.config.enableCircuitBreaker && this.isCircuitOpen(key)) {
      throw new Error(`Circuit breaker OPEN for key: ${key}`);
    }

    // Check for existing in-flight request
    const existing = this.pending.get(key) as PendingRequest<T> | undefined;
    if (existing) {
      existing.subscriberCount++;
      this.stats.deduplicatedRequests++;
      return existing.promise;
    }

    // Check capacity
    if (this.pending.size >= this.config.maxPendingRequests) {
      throw new Error('Maximum pending requests exceeded');
    }

    // Create new request with timeout
    const { promise, entry } = this.createPendingRequest<T>(key, executor);

    this.pending.set(key, entry as PendingRequest<unknown>);

    try {
      const result = await promise;
      this.recordSuccess(key);
      return result;
    } catch (error) {
      this.recordFailure(key);
      throw error;
    } finally {
      this.pending.delete(key);
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
    }
  }

  /**
   * Execute with a custom key (bypassing key generator).
   */
  async executeWithKey<T>(
    key: string,
    executor: () => Promise<T>
  ): Promise<T> {
    this.stats.totalRequests++;

    if (this.config.enableCircuitBreaker && this.isCircuitOpen(key)) {
      throw new Error(`Circuit breaker OPEN for key: ${key}`);
    }

    const existing = this.pending.get(key) as PendingRequest<T> | undefined;
    if (existing) {
      existing.subscriberCount++;
      this.stats.deduplicatedRequests++;
      return existing.promise;
    }

    if (this.pending.size >= this.config.maxPendingRequests) {
      throw new Error('Maximum pending requests exceeded');
    }

    const { promise, entry } = this.createPendingRequest<T>(key, executor);
    this.pending.set(key, entry as PendingRequest<unknown>);

    try {
      const result = await promise;
      this.recordSuccess(key);
      return result;
    } catch (error) {
      this.recordFailure(key);
      throw error;
    } finally {
      this.pending.delete(key);
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
    }
  }

  /**
   * Check if a request is currently pending for the given key.
   */
  isPending(key: string): boolean {
    return this.pending.has(key);
  }

  /**
   * Get the number of subscribers for a pending request.
   */
  getSubscriberCount(key: string): number {
    return this.pending.get(key)?.subscriberCount ?? 0;
  }

  /**
   * Cancel a pending request, rejecting all subscribers.
   */
  cancel(key: string): boolean {
    const entry = this.pending.get(key);
    if (!entry) return false;

    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
    }
    this.pending.delete(key);
    return true;
  }

  /**
   * Cancel all pending requests.
   */
  cancelAll(): number {
    const count = this.pending.size;
    for (const [key, entry] of this.pending) {
      if (entry.timeoutId) clearTimeout(entry.timeoutId);
    }
    this.pending.clear();
    return count;
  }

  /**
   * Get current pending request count.
   */
  getPendingCount(): number {
    return this.pending.size;
  }

  /**
   * Get circuit breaker state for a key.
   */
  getCircuitState(key: string): CircuitState {
    const cb = this.circuitBreakers.get(key);
    if (!cb) return 'CLOSED';

    // Check if we should transition from OPEN to HALF_OPEN
    if (cb.state === 'OPEN') {
      const elapsed = Date.now() - cb.lastStateChange;
      if (elapsed >= this.config.circuitBreakerResetMs) {
        cb.state = 'HALF_OPEN';
        cb.lastStateChange = Date.now();
      }
    }

    return cb.state;
  }

  /**
   * Reset circuit breaker for a key.
   */
  resetCircuitBreaker(key: string): void {
    this.circuitBreakers.delete(key);
  }

  /**
   * Reset all circuit breakers.
   */
  resetAllCircuitBreakers(): void {
    this.circuitBreakers.clear();
  }

  /**
   * Get deduplication statistics.
   */
  getStats(): DeduplicationStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats.totalRequests = 0;
    this.stats.deduplicatedRequests = 0;
    this.stats.timeouts = 0;
    this.stats.circuitBreakerTrips = 0;
    this.stats.averageSubscribers = 0;
  }

  /**
   * Get all pending request keys.
   */
  getPendingKeys(): string[] {
    return [...this.pending.keys()];
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Create a pending request with timeout protection */
  private createPendingRequest<T>(
    key: string,
    executor: () => Promise<T>
  ): { promise: Promise<T>; entry: PendingRequest<T> } {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const promise = new Promise<T>((resolve, reject) => {
      // Set up timeout
      if (this.config.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          this.stats.timeouts++;
          this.pending.delete(key);
          reject(new Error(`Request timeout after ${this.config.timeoutMs}ms for key: ${key}`));
        }, this.config.timeoutMs);
      }

      // Execute the actual request
      executor().then(resolve).catch(reject);
    });

    const entry: PendingRequest<T> = {
      key,
      promise,
      startedAt: Date.now(),
      subscriberCount: 1,
      timeoutId,
    };

    return { promise, entry };
  }

  /** Default key generator based on method + URL + body */
  private defaultKeyGenerator(request: DeduplicationRequest): string {
    const parts = [request.method.toUpperCase(), request.url];
    if (request.body) parts.push(request.body);
    return parts.join('::');
  }

  /** Check if circuit breaker is open for a key */
  private isCircuitOpen(key: string): boolean {
    const state = this.getCircuitState(key);
    if (state === 'OPEN') {
      this.stats.circuitBreakerTrips++;
      return true;
    }
    return false;
  }

  /** Record a successful request for circuit breaker */
  private recordSuccess(key: string): void {
    const cb = this.circuitBreakers.get(key);
    if (!cb) return;

    if (cb.state === 'HALF_OPEN') {
      cb.successCount++;
      if (cb.successCount >= 3) {
        cb.state = 'CLOSED';
        cb.failureCount = 0;
        cb.successCount = 0;
        cb.lastStateChange = Date.now();
      }
    }
  }

  /** Record a failed request for circuit breaker */
  private recordFailure(key: string): void {
    if (!this.circuitBreakers.has(key)) {
      this.circuitBreakers.set(key, {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureAt: 0,
        successCount: 0,
        lastStateChange: Date.now(),
      });
    }

    const cb = this.circuitBreakers.get(key)!;
    cb.failureCount++;
    cb.lastFailureAt = Date.now();

    if (cb.failureCount >= this.config.circuitBreakerThreshold) {
      cb.state = 'OPEN';
      cb.lastStateChange = Date.now();
    }
  }
}
