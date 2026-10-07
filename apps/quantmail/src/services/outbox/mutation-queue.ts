/**
 * Time-Ordered Idempotent Outbox Mutation Queue
 *
 * Queues offline draft dispatches, flag updates, and folder moves.
 * Mutations are ordered chronologically via UUIDv7 and flushed with
 * 'Idempotency-Key: <uuidv7>' headers upon network restoration.
 */

import { generateUuidV7, extractTimestampFromUuidV7 } from './idempotency.js';

export type OutboxMutationType = 'SEND_MAIL' | 'SET_FLAGS' | 'DELETE_MAIL' | 'MOVE_FOLDER';

export interface QueuedMutation<P = any> {
  id: string; // UUIDv7
  type: OutboxMutationType;
  payload: P;
  createdAt: number;
  retryCount: number;
  status: 'QUEUED' | 'IN_FLIGHT' | 'COMPLETED' | 'FAILED';
  lastError?: string;
}

export type MutationFlushHandler = (
  mutation: QueuedMutation,
  idempotencyKey: string,
) => Promise<{ success: boolean; error?: string }>;

export class OutboxMutationQueue {
  private queue: QueuedMutation[] = [];
  private isFlushing = false;
  private maxRetries: number;

  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
  }

  /**
   * Enqueues a new mutation with a time-ordered UUIDv7 key.
   */
  public enqueue<P = any>(type: OutboxMutationType, payload: P): QueuedMutation<P> {
    const id = generateUuidV7();
    const createdAt = extractTimestampFromUuidV7(id);

    const mutation: QueuedMutation<P> = {
      id,
      type,
      payload,
      createdAt,
      retryCount: 0,
      status: 'QUEUED',
    };

    this.queue.push(mutation);
    // Sort chronologically by UUIDv7 string (lexicographical sort on UUIDv7 == time order)
    this.sortQueue();

    return mutation;
  }

  /**
   * Sorts the queue strictly chronologically.
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Flushes all queued mutations sequentially using the supplied handler.
   */
  public async flush(handler: MutationFlushHandler): Promise<{
    processedCount: number;
    failedCount: number;
  }> {
    if (this.isFlushing) {
      return { processedCount: 0, failedCount: 0 };
    }

    this.isFlushing = true;
    let processedCount = 0;
    let failedCount = 0;

    try {
      const pending = this.queue.filter((m) => m.status === 'QUEUED');

      for (const mutation of pending) {
        mutation.status = 'IN_FLIGHT';

        try {
          // Pass mutation.id as Idempotency-Key
          const result = await handler(mutation, mutation.id);

          if (result.success) {
            mutation.status = 'COMPLETED';
            processedCount++;
          } else {
            mutation.retryCount++;
            mutation.lastError = result.error || 'Handler returned failure';
            if (mutation.retryCount >= this.maxRetries) {
              mutation.status = 'FAILED';
            } else {
              mutation.status = 'QUEUED';
            }
            failedCount++;
          }
        } catch (err: any) {
          mutation.retryCount++;
          mutation.lastError = err?.message || 'Unexpected flush error';
          if (mutation.retryCount >= this.maxRetries) {
            mutation.status = 'FAILED';
          } else {
            mutation.status = 'QUEUED';
          }
          failedCount++;
        }
      }

      // Clean up completed mutations
      this.queue = this.queue.filter((m) => m.status !== 'COMPLETED');
    } finally {
      this.isFlushing = false;
    }

    return { processedCount, failedCount };
  }

  public getPending(): QueuedMutation[] {
    return this.queue.filter((m) => m.status === 'QUEUED');
  }

  public getAll(): QueuedMutation[] {
    return [...this.queue];
  }

  public size(): number {
    return this.queue.length;
  }

  public clear(): void {
    this.queue = [];
  }
}
