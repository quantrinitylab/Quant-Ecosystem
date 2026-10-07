// ============================================================================
// QuantChat - Notification Batcher (Task 10.7)
//
// Coalesces non-urgent notifications so users are not spammed: when more than 5
// non-urgent notifications for the same user+category arrive within a 2-minute
// window, they are collapsed into a single summary notification. High-priority
// notifications (calls, etc.) always bypass batching and send immediately.
//
// The actual delivery is injected via `sendFn` so this module stays transport-
// agnostic and unit-testable. Timers are injected too (defaults to setTimeout)
// so tests can drive the window deterministically.
//
// Validates: Requirements 9.9, 9.10 (Property 23 - batching)
// ============================================================================

import type { NotificationCategory } from './notification-deeplink';

export type NotificationPriority = 'high' | 'normal';

export interface BatchableNotification {
  userId: string;
  category: NotificationCategory | string;
  title: string;
  body: string;
  /** Content id used for deep-linking when delivered. */
  contentId?: string;
  deepLink?: string;
  priority: NotificationPriority;
  tag?: string;
}

interface BatchWindow {
  userId: string;
  category: string;
  notifications: BatchableNotification[];
  windowStartTime: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Delivery function — sends a single (possibly summary) notification. */
export type NotificationSender = (notification: BatchableNotification) => void | Promise<void>;

export interface NotificationBatcherOptions {
  /** Window length in ms. Default 120_000 (2 minutes). */
  windowMs?: number;
  /**
   * Number of notifications that triggers an early summary flush. The summary
   * fires once the window contains MORE THAN this many (i.e. the 6th arrival
   * with the default of 5). Default 5.
   */
  batchThreshold?: number;
  /** Injectable timer functions (defaults to global setTimeout/clearTimeout). */
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
  /** Clock, injectable for tests. */
  now?: () => number;
}

export class NotificationBatcher {
  private readonly windows = new Map<string, BatchWindow>();
  private readonly windowMs: number;
  private readonly batchThreshold: number;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimeoutFn: (handle: ReturnType<typeof setTimeout>) => void;
  private readonly now: () => number;

  constructor(
    private readonly sendFn: NotificationSender,
    options: NotificationBatcherOptions = {},
  ) {
    this.windowMs = options.windowMs ?? 120_000;
    this.batchThreshold = options.batchThreshold ?? 5;
    this.setTimeoutFn = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = options.clearTimeoutFn ?? ((h) => clearTimeout(h));
    this.now = options.now ?? (() => Date.now());
  }

  private keyFor(notification: BatchableNotification): string {
    return `${notification.userId}:${notification.category}`;
  }

  /**
   * Enqueue a notification.
   *  - High priority -> delivered immediately, never batched.
   *  - Normal priority -> added to the user+category window. When the window
   *    exceeds the threshold it is flushed early as a summary; otherwise it is
   *    flushed when the window timer elapses.
   */
  async enqueue(notification: BatchableNotification): Promise<void> {
    if (notification.priority === 'high') {
      await this.sendFn(notification);
      return;
    }

    const key = this.keyFor(notification);
    const existing = this.windows.get(key);

    if (!existing) {
      const window: BatchWindow = {
        userId: notification.userId,
        category: String(notification.category),
        notifications: [notification],
        windowStartTime: this.now(),
        timer: null,
      };
      window.timer = this.setTimeoutFn(() => {
        void this.flush(key);
      }, this.windowMs);
      this.windows.set(key, window);
      return;
    }

    existing.notifications.push(notification);

    // More than `batchThreshold` => collapse into a summary right away.
    if (existing.notifications.length > this.batchThreshold) {
      await this.flush(key);
    }
  }

  /**
   * Flush a window. A single notification is delivered as-is; multiple
   * notifications are delivered as one summary. No-op if the window is gone.
   */
  async flush(key: string): Promise<void> {
    const window = this.windows.get(key);
    if (!window) return;

    if (window.timer) {
      this.clearTimeoutFn(window.timer);
    }
    this.windows.delete(key);

    if (window.notifications.length === 0) return;

    if (window.notifications.length === 1) {
      await this.sendFn(window.notifications[0]!);
      return;
    }

    await this.sendFn(this.buildSummary(window.notifications));
  }

  /** Flush every open window (e.g. on shutdown). */
  async flushAll(): Promise<void> {
    const keys = Array.from(this.windows.keys());
    for (const key of keys) {
      await this.flush(key);
    }
  }

  /** Number of currently open (un-flushed) windows. Exposed for tests. */
  get openWindowCount(): number {
    return this.windows.size;
  }

  private buildSummary(notifications: BatchableNotification[]): BatchableNotification {
    const first = notifications[0]!;
    const count = notifications.length;
    const categoryLabel = String(first.category).toLowerCase();
    const preview = notifications
      .slice(0, 3)
      .map((n) => n.body)
      .join(', ');

    return {
      userId: first.userId,
      category: first.category,
      title: `${count} new ${categoryLabel}`,
      body: count > 3 ? `${preview}…` : preview,
      deepLink: '/notifications',
      priority: 'normal',
      tag: `summary:${first.category}`,
    };
  }
}

export default NotificationBatcher;
