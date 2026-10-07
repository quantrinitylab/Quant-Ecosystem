// ============================================================================
// Universal Notification Center - Cross-App Notification Aggregation
// ============================================================================

import type {
  DndConfig,
  PreviewPrivacy,
  ThreadMuteConfig,
  InlineReplyPayload,
  CrossAppDeepLink,
  ImportantOnlyConfig,
  SnoozeDuration,
  SnoozedNotification,
} from './types';
import { DndService } from './services/dnd-service';
import { DedupService } from './services/dedup-service';

export type NotificationApp =
  | 'quantchat'
  | 'quantmail'
  | 'quantsync'
  | 'quantube'
  | 'quantneon'
  | 'quantedits'
  | 'quantmax'
  | 'quantai'
  | 'quantads'
  | 'quantmeet'
  | 'quantdocs'
  | 'quantdrive'
  | 'quantcalendar'
  | 'quantpay'
  | 'quantcloud'
  | 'quantmaps'
  | 'quanthealth'
  | 'quantlearn'
  | 'quantwork';

export type UniversalNotificationPriority = 'critical' | 'high' | 'medium' | 'low';

export interface UniversalNotification {
  id: string;
  app: NotificationApp;
  type: string;
  title: string;
  body: string;
  priority: UniversalNotificationPriority;
  timestamp: number;
  read: boolean;
  actionUrl?: string;
  metadata?: Record<string, string>;
  threadId?: string;
  senderId?: string;
  deepLink?: CrossAppDeepLink;
}

export interface UniversalNotificationPreferences {
  userId: string;
  enabledApps: NotificationApp[];
  quietHours?: { start: number; end: number };
  digestMode: boolean;
  digestFrequency: 'hourly' | 'daily' | 'weekly';
  previewPrivacy?: PreviewPrivacy;
  importantOnly?: ImportantOnlyConfig;
}

export interface NotificationFilters {
  apps?: NotificationApp[];
  unreadOnly?: boolean;
  priority?: UniversalNotificationPriority;
}

type NotificationCallback = (notification: UniversalNotification) => void;
type ReplyCallback = (reply: InlineReplyPayload) => void;

const ALL_APPS: NotificationApp[] = [
  'quantchat',
  'quantmail',
  'quantsync',
  'quantube',
  'quantneon',
  'quantedits',
  'quantmax',
  'quantai',
  'quantads',
  'quantmeet',
  'quantdocs',
  'quantdrive',
  'quantcalendar',
  'quantpay',
  'quantcloud',
  'quantmaps',
  'quanthealth',
  'quantlearn',
  'quantwork',
];

export class UniversalNotificationCenter {
  private notifications: Map<string, UniversalNotification> = new Map();
  private subscribers: Map<string, NotificationCallback[]> = new Map();
  private preferences: Map<string, UniversalNotificationPreferences> = new Map();
  private counter = 0;

  // DND (delegates to DndService)
  private dndService: DndService = new DndService();
  private dndQueues: Map<string, UniversalNotification[]> = new Map();

  // Thread mutes
  private threadMutes: Map<string, ThreadMuteConfig> = new Map();

  // Snooze
  private snoozedNotifications: Map<string, SnoozedNotification> = new Map();
  private snoozedPayloads: Map<string, UniversalNotification> = new Map();

  // Dedup (delegates to DedupService)
  private dedupService: DedupService = new DedupService();

  // Important-only
  private importantOnlyMode: Map<string, ImportantOnlyConfig> = new Map();

  // Inline reply
  private replyCallbacks: ReplyCallback[] = [];

  // Smart batching
  private batchWindows: Map<
    string,
    { notifications: UniversalNotification[]; windowStart: number }
  > = new Map();
  private batchWindowMs = 5 * 60 * 1000; // 5 minutes
  private batchFlushTimer: ReturnType<typeof setInterval> | null = null;

  send(
    notification: Omit<UniversalNotification, 'id' | 'timestamp' | 'read'>,
  ): UniversalNotification {
    const id = `notif_${Date.now()}_${++this.counter}`;
    const full: UniversalNotification = {
      ...notification,
      id,
      timestamp: Date.now(),
      read: false,
    };
    this.notifications.set(id, full);

    // Notify subscribers
    for (const [, callbacks] of this.subscribers) {
      for (const cb of callbacks) {
        cb(full);
      }
    }

    return full;
  }

  /**
   * Send a notification with full pipeline (DND, dedup, batching, mute, important-only).
   * Returns the notification if delivered immediately, null if suppressed/queued.
   */
  sendWithPipeline(
    userId: string,
    notification: Omit<UniversalNotification, 'id' | 'timestamp' | 'read'>,
  ): UniversalNotification | null {
    const id = `notif_${Date.now()}_${++this.counter}`;
    const full: UniversalNotification = {
      ...notification,
      id,
      timestamp: Date.now(),
      read: false,
    };

    // Store the notification regardless
    this.notifications.set(id, full);

    // Check important-only mode
    const importantConfig = this.importantOnlyMode.get(userId);
    if (importantConfig?.enabled) {
      if (!this.meetsUrgencyThreshold(full.priority, importantConfig.minUrgency)) {
        return null;
      }
    }

    // Check thread mute
    if (full.threadId) {
      const muteKey = `${userId}:${full.threadId}`;
      const mute = this.threadMutes.get(muteKey);
      if (mute) {
        if (!mute.muteUntil || mute.muteUntil > Date.now()) {
          return null;
        }
        // Mute expired, remove it
        this.threadMutes.delete(muteKey);
      }
    }

    // Check DND (delegates to DndService)
    if (this.dndService.isActive(userId)) {
      const dndConfig = this.dndService.getConfig(userId);
      if (full.priority !== 'critical' || !dndConfig?.allowCritical) {
        // Queue for later
        const queue = this.dndQueues.get(userId) ?? [];
        queue.push(full);
        this.dndQueues.set(userId, queue);
        return null;
      }
    }

    // Cross-device dedup (by content-derived key, not by unique ID)
    const dedupKey = this.getDeduplicationKey(full);
    if (this.dedupService.isDelivered(dedupKey, userId)) {
      return null;
    }
    this.dedupService.markDelivered(dedupKey, userId, 'pipeline');

    // Notify subscribers
    for (const [, callbacks] of this.subscribers) {
      for (const cb of callbacks) {
        cb(full);
      }
    }

    return full;
  }

  /**
   * Add a notification to the batch window. Returns batched notifications if the window expired.
   */
  addToBatch(
    userId: string,
    notification: Omit<UniversalNotification, 'id' | 'timestamp' | 'read'>,
  ): UniversalNotification[] | null {
    const id = `notif_${Date.now()}_${++this.counter}`;
    const full: UniversalNotification = {
      ...notification,
      id,
      timestamp: Date.now(),
      read: false,
    };
    this.notifications.set(id, full);

    const batchKey = `${userId}:${notification.type}:${notification.threadId ?? notification.app}`;
    const now = Date.now();
    const existing = this.batchWindows.get(batchKey);

    if (existing) {
      if (now - existing.windowStart >= this.batchWindowMs) {
        // Window expired, flush and start new
        const flushed = existing.notifications;
        this.batchWindows.set(batchKey, { notifications: [full], windowStart: now });
        return flushed;
      }
      existing.notifications.push(full);
      return null;
    }

    this.batchWindows.set(batchKey, { notifications: [full], windowStart: now });
    return null;
  }

  /**
   * Flush all batch windows
   */
  flushBatches(): UniversalNotification[] {
    const all: UniversalNotification[] = [];
    for (const [key, window] of this.batchWindows) {
      all.push(...window.notifications);
      this.batchWindows.delete(key);
    }
    return all;
  }

  /**
   * Flush only expired batch windows (those past the batch window duration).
   * This is called by the periodic flush timer and can also be called externally.
   */
  flushExpiredBatches(): UniversalNotification[] {
    const now = Date.now();
    const flushed: UniversalNotification[] = [];
    for (const [key, window] of this.batchWindows) {
      if (now - window.windowStart >= this.batchWindowMs) {
        flushed.push(...window.notifications);
        this.batchWindows.delete(key);
      }
    }
    return flushed;
  }

  /**
   * Start a periodic timer that flushes expired batch windows.
   * The timer runs at the batch window interval (default 5 minutes).
   * Call stopBatchFlushInterval() to clean up.
   */
  startBatchFlushInterval(): void {
    if (this.batchFlushTimer) return;
    this.batchFlushTimer = setInterval(() => {
      this.flushExpiredBatches();
    }, this.batchWindowMs);
    this.batchFlushTimer.unref();
  }

  /**
   * Stop the periodic batch flush timer.
   */
  stopBatchFlushInterval(): void {
    if (this.batchFlushTimer) {
      clearInterval(this.batchFlushTimer);
      this.batchFlushTimer = null;
    }
  }

  // --- DND Management (delegates to DndService) ---

  setDndConfig(userId: string, config: DndConfig): void {
    this.dndService.configure(userId, config);
  }

  getDndConfig(userId: string): DndConfig | undefined {
    return this.dndService.getConfig(userId);
  }

  isDndActive(userId: string): boolean {
    return this.dndService.isActive(userId);
  }

  flushDndQueue(userId: string): UniversalNotification[] {
    const queue = this.dndQueues.get(userId) ?? [];
    this.dndQueues.set(userId, []);
    return queue;
  }

  getDndQueueSize(userId: string): number {
    return this.dndQueues.get(userId)?.length ?? 0;
  }

  // --- Thread Mute ---

  muteThread(userId: string, threadId: string, muteUntil?: number): void {
    const key = `${userId}:${threadId}`;
    this.threadMutes.set(key, {
      threadId,
      userId,
      mutedAt: Date.now(),
      muteUntil,
    });
  }

  unmuteThread(userId: string, threadId: string): void {
    const key = `${userId}:${threadId}`;
    this.threadMutes.delete(key);
  }

  isThreadMuted(userId: string, threadId: string): boolean {
    const key = `${userId}:${threadId}`;
    const mute = this.threadMutes.get(key);
    if (!mute) return false;
    if (mute.muteUntil && mute.muteUntil <= Date.now()) {
      this.threadMutes.delete(key);
      return false;
    }
    return true;
  }

  // --- Preview Privacy ---

  applyPreviewPrivacy(
    notification: UniversalNotification,
    privacy: PreviewPrivacy,
  ): { title: string; body: string } {
    switch (privacy) {
      case 'hidden':
        return { title: 'New notification', body: '' };
      case 'subject':
        return { title: notification.title, body: '' };
      case 'full':
      default:
        return { title: notification.title, body: notification.body };
    }
  }

  // --- Snooze ---

  snooze(notificationId: string, userId: string, duration: SnoozeDuration): SnoozedNotification {
    const now = Date.now();
    const resumeAt = this.calculateSnoozeResume(duration, now);
    const record: SnoozedNotification = {
      notificationId,
      userId,
      snoozedAt: now,
      resumeAt,
      duration,
    };

    const key = `${userId}:${notificationId}`;
    this.snoozedNotifications.set(key, record);

    const notification = this.notifications.get(notificationId);
    if (notification) {
      this.snoozedPayloads.set(key, notification);
    }

    return record;
  }

  remindMe(notificationId: string, userId: string, delayMs: number): SnoozedNotification {
    const now = Date.now();
    const record: SnoozedNotification = {
      notificationId,
      userId,
      snoozedAt: now,
      resumeAt: now + delayMs,
      duration: '15min',
    };

    const key = `${userId}:${notificationId}`;
    this.snoozedNotifications.set(key, record);

    const notification = this.notifications.get(notificationId);
    if (notification) {
      this.snoozedPayloads.set(key, notification);
    }

    return record;
  }

  getExpiredSnoozes(now?: number): UniversalNotification[] {
    const currentTime = now ?? Date.now();
    const expired: UniversalNotification[] = [];

    for (const [key, record] of this.snoozedNotifications) {
      if (record.resumeAt <= currentTime) {
        const notif = this.snoozedPayloads.get(key);
        if (notif) {
          expired.push(notif);
        }
        this.snoozedNotifications.delete(key);
        this.snoozedPayloads.delete(key);
      }
    }

    return expired;
  }

  // --- Important Only Mode ---

  setImportantOnly(userId: string, config: ImportantOnlyConfig): void {
    this.importantOnlyMode.set(userId, config);
  }

  getImportantOnly(userId: string): ImportantOnlyConfig | undefined {
    return this.importantOnlyMode.get(userId);
  }

  // --- Inline Reply ---

  onReply(callback: ReplyCallback): () => void {
    this.replyCallbacks.push(callback);
    return () => {
      const idx = this.replyCallbacks.indexOf(callback);
      if (idx >= 0) this.replyCallbacks.splice(idx, 1);
    };
  }

  sendReply(reply: InlineReplyPayload): void {
    for (const cb of this.replyCallbacks) {
      cb(reply);
    }
  }

  // --- Deep Links ---

  createDeepLink(app: string, screen: string, params: Record<string, unknown>): CrossAppDeepLink {
    return { app, screen, params };
  }

  // --- Original API (unchanged behavior) ---

  getAll(userId: string, filters?: NotificationFilters): UniversalNotification[] {
    const prefs = this.preferences.get(userId);
    let results = Array.from(this.notifications.values());

    // Filter by user preferences (enabled apps)
    if (prefs) {
      results = results.filter((n) => prefs.enabledApps.includes(n.app));
    }

    if (filters?.apps) {
      const apps = filters.apps;
      results = results.filter((n) => apps.includes(n.app));
    }

    if (filters?.unreadOnly) {
      results = results.filter((n) => !n.read);
    }

    if (filters?.priority) {
      const priority = filters.priority;
      results = results.filter((n) => n.priority === priority);
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  markRead(notificationIds: string[]): number {
    let count = 0;
    for (const id of notificationIds) {
      const notif = this.notifications.get(id);
      if (notif && !notif.read) {
        notif.read = true;
        count++;
      }
    }
    return count;
  }

  markAllRead(app?: NotificationApp): number {
    let count = 0;
    for (const [, notif] of this.notifications) {
      if (!notif.read && (!app || notif.app === app)) {
        notif.read = true;
        count++;
      }
    }
    return count;
  }

  getUnreadCounts(): Record<NotificationApp, number> {
    const counts = {} as Record<NotificationApp, number>;

    for (const app of ALL_APPS) {
      counts[app] = 0;
    }

    for (const [, notif] of this.notifications) {
      if (!notif.read) {
        counts[notif.app]++;
      }
    }

    return counts;
  }

  subscribe(userId: string, callback: NotificationCallback): () => void {
    const existing = this.subscribers.get(userId) ?? [];
    existing.push(callback);
    this.subscribers.set(userId, existing);

    return () => {
      const callbacks = this.subscribers.get(userId);
      if (callbacks) {
        const idx = callbacks.indexOf(callback);
        if (idx >= 0) {
          callbacks.splice(idx, 1);
        }
      }
    };
  }

  setPreferences(
    userId: string,
    prefs: Partial<UniversalNotificationPreferences>,
  ): UniversalNotificationPreferences {
    const existing = this.preferences.get(userId) ?? {
      userId,
      enabledApps: [...ALL_APPS],
      digestMode: false,
      digestFrequency: 'daily' as const,
    };

    const updated: UniversalNotificationPreferences = { ...existing, ...prefs };
    this.preferences.set(userId, updated);
    return updated;
  }

  getPreferences(userId: string): UniversalNotificationPreferences {
    return (
      this.preferences.get(userId) ?? {
        userId,
        enabledApps: [...ALL_APPS],
        digestMode: false,
        digestFrequency: 'daily',
      }
    );
  }

  getDigest(userId: string): UniversalNotification[] {
    const prefs = this.preferences.get(userId);
    if (!prefs?.digestMode) {
      return [];
    }

    const now = Date.now();
    let windowMs: number;
    switch (prefs.digestFrequency) {
      case 'hourly':
        windowMs = 60 * 60 * 1000;
        break;
      case 'daily':
        windowMs = 24 * 60 * 60 * 1000;
        break;
      case 'weekly':
        windowMs = 7 * 24 * 60 * 60 * 1000;
        break;
    }

    return Array.from(this.notifications.values())
      .filter((n) => n.timestamp >= now - windowMs && prefs.enabledApps.includes(n.app))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  clearOlderThan(days: number): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let count = 0;
    for (const [id, notif] of this.notifications) {
      if (notif.timestamp < cutoff) {
        this.notifications.delete(id);
        count++;
      }
    }
    return count;
  }

  // ---- Private Helpers ----

  private meetsUrgencyThreshold(
    priority: UniversalNotificationPriority,
    minUrgency: string,
  ): boolean {
    const levels: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      normal: 2,
      low: 1,
      background: 0,
    };
    return (levels[priority] ?? 0) >= (levels[minUrgency] ?? 0);
  }

  /**
   * Derive a content-based deduplication key for a notification.
   * Two notifications with the same type, app, thread, and recipient
   * are considered duplicates for cross-device delivery.
   */
  private getDeduplicationKey(notification: UniversalNotification): string {
    return `${notification.type}:${notification.app}:${notification.threadId ?? ''}:${notification.senderId ?? ''}`;
  }

  private calculateSnoozeResume(duration: SnoozeDuration, now: number): number {
    switch (duration) {
      case '15min':
        return now + 15 * 60 * 1000;
      case '1hr':
        return now + 60 * 60 * 1000;
      case 'tomorrow': {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow.getTime();
      }
      case 'next_active':
        // Default to next day 9am if no active hours configured
        const nextDay = new Date(now);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(9, 0, 0, 0);
        return nextDay.getTime();
    }
  }
}
