// ============================================================================
// Queue - Dead Letter Queue
// Tracks failed BullMQ jobs with replay capability
// ============================================================================

import { randomUUID } from 'node:crypto';

/** A failed job record in the dead letter queue */
export interface DeadLetterRecord {
  id: string;
  queue: string;
  jobId: string;
  jobName: string;
  error: string;
  failedAt: number;
  attempts: number;
  payload: unknown;
  replayedAt?: number;
}

/** Filters for querying DLQ entries */
export interface DeadLetterFilters {
  queue?: string;
}

/** Statistics by queue */
export interface DeadLetterStats {
  total: number;
  byQueue: Record<string, number>;
}

/**
 * QueueDeadLetter - In-memory dead letter queue for failed BullMQ jobs.
 *
 * Stores failed job records with metadata (original queue, error, attempts).
 * Provides replay capability and filtering by queue name.
 */
export class QueueDeadLetter {
  private records: Map<string, DeadLetterRecord> = new Map();

  /**
   * Add a failed job to the dead letter queue.
   */
  enqueue(record: Omit<DeadLetterRecord, 'id'>): DeadLetterRecord {
    const id = randomUUID();
    const entry: DeadLetterRecord = { id, ...record };
    this.records.set(id, entry);
    return entry;
  }

  /**
   * Mark a job for replay. Returns the record if found.
   */
  replay(id: string): DeadLetterRecord | null {
    const record = this.records.get(id);
    if (!record) return null;

    record.replayedAt = Date.now();
    return record;
  }

  /**
   * Get all DLQ entries, optionally filtered by queue name.
   */
  getAll(filters?: DeadLetterFilters): DeadLetterRecord[] {
    const entries = Array.from(this.records.values());

    if (filters?.queue) {
      return entries.filter((r) => r.queue === filters.queue);
    }

    return entries;
  }

  /**
   * Get statistics: total count and count by queue.
   */
  getStats(): DeadLetterStats {
    const byQueue: Record<string, number> = {};

    for (const record of this.records.values()) {
      byQueue[record.queue] = (byQueue[record.queue] ?? 0) + 1;
    }

    return {
      total: this.records.size,
      byQueue,
    };
  }

  /**
   * Remove entries older than the specified duration.
   */
  purge(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    let removed = 0;

    for (const [id, record] of this.records) {
      if (record.failedAt < cutoff) {
        this.records.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get a single record by ID.
   */
  get(id: string): DeadLetterRecord | null {
    return this.records.get(id) ?? null;
  }

  /**
   * Get total number of records.
   */
  size(): number {
    return this.records.size;
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.records.clear();
  }
}
