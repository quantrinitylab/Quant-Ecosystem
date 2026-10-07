// ============================================================================
// Notifications - Smart Batch Service
// Groups similar notifications within a time window into summaries
// ============================================================================

import type { NotificationPayload, BatchedNotification } from '../types';

/** Batch window configuration */
export interface BatchConfig {
  windowMs: number; // default 5 minutes
  maxBatchSize: number; // max notifications before force-flush
}

/** Internal batch accumulator */
interface BatchWindow {
  key: string;
  recipientId: string;
  type: string;
  notifications: NotificationPayload[];
  windowStart: number;
  windowEnd: number;
}

const DEFAULT_BATCH_CONFIG: BatchConfig = {
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxBatchSize: 50,
};

/**
 * BatchService - Smart notification batching
 *
 * Accumulates similar notifications (same type + same sender/thread within
 * a 5-minute window), collapses them into a single summary notification,
 * and emits the batch when the window closes or a threshold count is reached.
 */
export class BatchService {
  private windows: Map<string, BatchWindow> = new Map();
  private config: BatchConfig;
  private batchCounter = 0;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
  }

  /**
   * Add a notification to the batch. Returns a batched notification if the
   * window has closed or the threshold has been reached, otherwise returns null.
   */
  public add(notification: NotificationPayload): BatchedNotification | null {
    const key = this.getBatchKey(notification);
    const now = Date.now();

    const existing = this.windows.get(key);

    if (existing) {
      // Check if the window has expired
      if (now - existing.windowStart >= this.config.windowMs) {
        // Flush the existing window and start a new one
        const batched = this.flushWindow(key);
        this.startNewWindow(key, notification, now);
        return batched;
      }

      // Add to existing window
      existing.notifications.push(notification);
      existing.windowEnd = now;

      // Check if max batch size reached
      if (existing.notifications.length >= this.config.maxBatchSize) {
        return this.flushWindow(key);
      }

      return null;
    }

    // Start a new window
    this.startNewWindow(key, notification, now);
    return null;
  }

  /**
   * Flush all open windows and return batched notifications.
   * Only returns batches with more than 1 notification.
   */
  public flushAll(): BatchedNotification[] {
    const results: BatchedNotification[] = [];

    for (const key of Array.from(this.windows.keys())) {
      const batched = this.flushWindow(key);
      if (batched) {
        results.push(batched);
      }
    }

    return results;
  }

  /**
   * Flush expired windows (windows that have passed the time threshold)
   */
  public flushExpired(): BatchedNotification[] {
    const now = Date.now();
    const results: BatchedNotification[] = [];

    for (const [key, window] of this.windows) {
      if (now - window.windowStart >= this.config.windowMs) {
        const batched = this.flushWindow(key);
        if (batched) {
          results.push(batched);
        }
      }
    }

    return results;
  }

  /**
   * Get the number of open batch windows
   */
  public getOpenWindowCount(): number {
    return this.windows.size;
  }

  /**
   * Get configuration
   */
  public getConfig(): BatchConfig {
    return { ...this.config };
  }

  // ---- Private Methods ----

  private getBatchKey(notification: NotificationPayload): string {
    // Group by type + recipient + thread (or sender if no thread)
    const grouping = notification.threadId ?? notification.senderId ?? 'global';
    return `${notification.recipientId}:${notification.type}:${grouping}`;
  }

  private startNewWindow(key: string, notification: NotificationPayload, now: number): void {
    this.windows.set(key, {
      key,
      recipientId: notification.recipientId,
      type: notification.type,
      notifications: [notification],
      windowStart: now,
      windowEnd: now,
    });
  }

  private flushWindow(key: string): BatchedNotification | null {
    const window = this.windows.get(key);
    if (!window) return null;

    this.windows.delete(key);

    // Only create a batch if there are multiple notifications
    if (window.notifications.length <= 1) {
      return null;
    }

    this.batchCounter++;
    const first = window.notifications[0]!;

    return {
      id: `batch_${Date.now()}_${this.batchCounter}`,
      type: first.type,
      recipientId: window.recipientId,
      title: this.generateBatchTitle(window),
      body: this.generateBatchBody(window),
      count: window.notifications.length,
      notifications: window.notifications,
      createdAt: Date.now(),
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
    };
  }

  private generateBatchTitle(window: BatchWindow): string {
    const count = window.notifications.length;
    const type = window.type;
    return `${count} new ${type} notifications`;
  }

  private generateBatchBody(window: BatchWindow): string {
    const count = window.notifications.length;
    const first = window.notifications[0]!;
    if (count === 2) {
      return `${first.title} and 1 other`;
    }
    return `${first.title} and ${count - 1} others`;
  }
}
