// ============================================================================
// Data Pipeline Package - Dead Letter Queue
// ============================================================================

import type {
  DeadLetterEntry,
  DeadLetterError,
  DLQConfig,
  DLQEntryStatus,
  ErrorCategory,
  Message,
  RetryPolicy,
} from '../types';

/** Statistics for the DLQ */
interface DLQStats {
  totalEntries: number;
  pendingCount: number;
  retryingCount: number;
  exhaustedCount: number;
  resolvedCount: number;
  purgedCount: number;
  oldestEntry: number | null;
  newestEntry: number | null;
  byErrorType: Record<string, number>;
}

/**
 * DeadLetterQueue - Failed message management system
 * Handles error categorization, retry scheduling with exponential backoff,
 * max retry tracking, and manual replay capabilities.
 */
export class DeadLetterQueue {
  private entries: Map<string, DeadLetterEntry> = new Map();
  private config: DLQConfig;
  private entryCounter: number = 0;

  constructor(config?: Partial<DLQConfig>) {
    this.config = {
      maxRetries: config?.maxRetries ?? 5,
      retryPolicy: config?.retryPolicy ?? {
        maxRetries: 5,
        initialDelay: 1000,
        maxDelay: 300000,
        backoffMultiplier: 2,
        retryableErrors: ['transient', 'timeout', 'rate_limit'],
      },
      maxAge: config?.maxAge ?? 7 * 24 * 60 * 60 * 1000,
      maxSize: config?.maxSize ?? 10000,
      alertThreshold: config?.alertThreshold ?? 100,
      autoRetryEnabled: config?.autoRetryEnabled ?? true,
    };
  }

  /**
   * Enqueue a failed message into the DLQ
   */
  public enqueue(
    message: Message,
    error: Error | string,
    category: ErrorCategory = 'unknown'
  ): DeadLetterEntry {
    const id = `dlq-${++this.entryCounter}-${Date.now()}`;

    const deadLetterError: DeadLetterError = {
      type: category,
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    };

    const isRetryable = this.config.retryPolicy.retryableErrors.includes(category);
    const nextRetryAt = isRetryable
      ? Date.now() + this.config.retryPolicy.initialDelay
      : null;

    const entry: DeadLetterEntry = {
      id,
      originalMessage: message,
      error: deadLetterError,
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      firstFailedAt: Date.now(),
      lastFailedAt: Date.now(),
      nextRetryAt,
      status: isRetryable ? 'pending' : 'exhausted',
      metadata: {
        originalTopic: message.topic,
        originalPartition: message.partition,
        originalOffset: message.offset,
      },
    };

    // Enforce max size by removing oldest resolved entries
    if (this.entries.size >= this.config.maxSize) {
      this.evictOldEntries();
    }

    this.entries.set(id, entry);
    return entry;
  }

  /**
   * Dequeue entries that are ready for retry
   */
  public dequeue(maxCount: number = 10): DeadLetterEntry[] {
    const now = Date.now();
    const ready: DeadLetterEntry[] = [];

    for (const entry of this.entries.values()) {
      if (ready.length >= maxCount) break;

      if (
        entry.status === 'pending' &&
        entry.nextRetryAt !== null &&
        entry.nextRetryAt <= now
      ) {
        entry.status = 'retrying';
        ready.push(entry);
      }
    }

    return ready;
  }

  /**
   * Retry a specific entry or mark it as failed again
   */
  public retry(entryId: string, success: boolean): DeadLetterEntry | null {
    const entry = this.entries.get(entryId);
    if (!entry) return null;

    if (success) {
      entry.status = 'resolved';
      entry.nextRetryAt = null;
      return entry;
    }

    entry.retryCount++;
    entry.lastFailedAt = Date.now();

    if (entry.retryCount >= entry.maxRetries) {
      entry.status = 'exhausted';
      entry.nextRetryAt = null;
    } else {
      entry.status = 'pending';
      entry.nextRetryAt = this.calculateNextRetry(entry.retryCount);
    }

    return entry;
  }

  /**
   * Retry a batch of entries
   */
  public retryBatch(entryIds: string[]): DeadLetterEntry[] {
    const results: DeadLetterEntry[] = [];

    for (const id of entryIds) {
      const entry = this.entries.get(id);
      if (entry && (entry.status === 'exhausted' || entry.status === 'pending')) {
        entry.status = 'pending';
        entry.retryCount = 0;
        entry.nextRetryAt = Date.now();
        results.push(entry);
      }
    }

    return results;
  }

  /**
   * Purge entries by status or age
   */
  public purge(options: { status?: DLQEntryStatus; olderThan?: number } = {}): number {
    let purgedCount = 0;
    const now = Date.now();

    for (const [id, entry] of this.entries.entries()) {
      let shouldPurge = false;

      if (options.status && entry.status === options.status) {
        shouldPurge = true;
      }

      if (options.olderThan && (now - entry.firstFailedAt) > options.olderThan) {
        shouldPurge = true;
      }

      if (!options.status && !options.olderThan) {
        shouldPurge = entry.status === 'resolved' || entry.status === 'purged';
      }

      if (shouldPurge) {
        entry.status = 'purged';
        this.entries.delete(id);
        purgedCount++;
      }
    }

    return purgedCount;
  }

  /**
   * Get statistics about the DLQ
   */
  public getStats(): DLQStats {
    let pendingCount = 0;
    let retryingCount = 0;
    let exhaustedCount = 0;
    let resolvedCount = 0;
    let purgedCount = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;
    const byErrorType: Record<string, number> = {};

    for (const entry of this.entries.values()) {
      switch (entry.status) {
        case 'pending': pendingCount++; break;
        case 'retrying': retryingCount++; break;
        case 'exhausted': exhaustedCount++; break;
        case 'resolved': resolvedCount++; break;
        case 'purged': purgedCount++; break;
      }

      if (oldestEntry === null || entry.firstFailedAt < oldestEntry) {
        oldestEntry = entry.firstFailedAt;
      }
      if (newestEntry === null || entry.firstFailedAt > newestEntry) {
        newestEntry = entry.firstFailedAt;
      }

      const errType = entry.error.type;
      byErrorType[errType] = (byErrorType[errType] ?? 0) + 1;
    }

    return {
      totalEntries: this.entries.size,
      pendingCount,
      retryingCount,
      exhaustedCount,
      resolvedCount,
      purgedCount,
      oldestEntry,
      newestEntry,
      byErrorType,
    };
  }

  /**
   * Get a specific entry by ID
   */
  public getEntry(id: string): DeadLetterEntry | null {
    return this.entries.get(id) ?? null;
  }

  /**
   * Get entries filtered by status
   */
  public getEntriesByStatus(status: DLQEntryStatus): DeadLetterEntry[] {
    const results: DeadLetterEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.status === status) {
        results.push(entry);
      }
    }
    return results;
  }

  /**
   * Get entries filtered by error category
   */
  public getEntriesByErrorType(category: ErrorCategory): DeadLetterEntry[] {
    const results: DeadLetterEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.error.type === category) {
        results.push(entry);
      }
    }
    return results;
  }

  /**
   * Check if alert threshold is exceeded
   */
  public isAlertThresholdExceeded(): boolean {
    const pendingAndExhausted = Array.from(this.entries.values()).filter(
      e => e.status === 'pending' || e.status === 'exhausted'
    ).length;
    return pendingAndExhausted >= this.config.alertThreshold;
  }

  /**
   * Calculate the next retry time using exponential backoff
   */
  private calculateNextRetry(retryCount: number): number {
    const delay = Math.min(
      this.config.retryPolicy.initialDelay *
        Math.pow(this.config.retryPolicy.backoffMultiplier, retryCount),
      this.config.retryPolicy.maxDelay
    );

    // Add jitter (up to 10% of delay)
    const jitter = Math.random() * delay * 0.1;

    return Date.now() + delay + jitter;
  }

  /**
   * Evict oldest resolved/purged entries when max size is reached
   */
  private evictOldEntries(): void {
    const sortedEntries = Array.from(this.entries.entries())
      .filter(([_, e]) => e.status === 'resolved' || e.status === 'exhausted')
      .sort(([_, a], [__, b]) => a.firstFailedAt - b.firstFailedAt);

    const toRemove = Math.max(1, Math.floor(this.config.maxSize * 0.1));
    for (let i = 0; i < Math.min(toRemove, sortedEntries.length); i++) {
      this.entries.delete(sortedEntries[i][0]);
    }
  }
}
