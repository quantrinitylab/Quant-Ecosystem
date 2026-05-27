// ============================================================================
// Notifications - Email Digest Service
// Configurable digest frequencies with content aggregation
// ============================================================================

import type {
  DigestConfig,
  DigestContent,
  DigestSummary,
  DigestFrequency,
  InAppNotification,
  NotificationType,
} from '../types';

/** Queued notification for digest inclusion */
interface DigestQueueItem {
  notification: InAppNotification;
  queuedAt: number;
  included: boolean;
}

/**
 * EmailDigestService - Aggregated notification digests
 *
 * Queues notifications for digest delivery, builds digest content
 * at configurable frequencies (hourly, daily, weekly, monthly),
 * generates HTML previews, and manages subscription preferences.
 */
export class EmailDigestService {
  private configs: Map<string, DigestConfig>;
  private queues: Map<string, DigestQueueItem[]>; // userId -> queued items
  private sentDigests: Map<string, DigestContent[]>; // userId -> sent digests
  private digestCounter: number = 0;

  constructor() {
    this.configs = new Map();
    this.queues = new Map();
    this.sentDigests = new Map();
  }

  /**
   * Configure digest settings for a user
   */
  public configure(
    userId: string,
    options: {
      frequency?: DigestFrequency;
      enabledTypes?: NotificationType[];
      preferredTime?: string;
      timezone?: string;
    } = {},
  ): DigestConfig {
    const existing = this.configs.get(userId);

    const config: DigestConfig = {
      id: existing?.id || this.generateId('digest_config'),
      userId,
      frequency: options.frequency || existing?.frequency || 'daily',
      enabledTypes: options.enabledTypes ||
        existing?.enabledTypes || ['message', 'mention', 'comment', 'like', 'follow', 'system'],
      preferredTime: options.preferredTime || existing?.preferredTime || '09:00',
      timezone: options.timezone || existing?.timezone || 'UTC',
      lastSentAt: existing?.lastSentAt,
      nextScheduledAt: this.calculateNextSendTime(
        options.frequency || existing?.frequency || 'daily',
        options.preferredTime || existing?.preferredTime || '09:00',
        options.timezone || existing?.timezone || 'UTC',
      ),
      isActive: true,
    };

    this.configs.set(userId, config);
    return config;
  }

  /**
   * Queue a notification for digest inclusion
   */
  public queueForDigest(userId: string, notification: InAppNotification): boolean {
    const config = this.configs.get(userId);
    if (!config || !config.isActive) return false;
    if (config.frequency === 'never') return false;
    if (config.frequency === 'realtime') return false;

    // Check if notification type is enabled
    if (!config.enabledTypes.includes(notification.type)) return false;

    if (!this.queues.has(userId)) {
      this.queues.set(userId, []);
    }

    this.queues.get(userId)!.push({
      notification,
      queuedAt: Date.now(),
      included: false,
    });

    return true;
  }

  /**
   * Build a digest from queued notifications
   */
  public buildDigest(userId: string): DigestContent | null {
    const config = this.configs.get(userId);
    if (!config) return null;

    const queue = this.queues.get(userId);
    if (!queue || queue.length === 0) return null;

    const now = Date.now();
    const periodStart = config.lastSentAt || now - this.getFrequencyMs(config.frequency);

    // Collect unincluded notifications from the current period
    const notifications: InAppNotification[] = [];
    for (const item of queue) {
      if (!item.included && item.queuedAt >= periodStart) {
        notifications.push(item.notification);
        item.included = true;
      }
    }

    if (notifications.length === 0) return null;

    // Build summary
    const summary = this.buildSummary(notifications);

    const digest: DigestContent = {
      id: this.generateId('digest'),
      userId,
      frequency: config.frequency,
      period: { start: periodStart, end: now },
      notifications,
      summary,
      generatedAt: now,
    };

    return digest;
  }

  /**
   * Send a digest (marks as sent and stores in history)
   */
  public sendDigest(userId: string): DigestContent | null {
    const digest = this.buildDigest(userId);
    if (!digest) return null;

    const config = this.configs.get(userId)!;
    config.lastSentAt = Date.now();
    config.nextScheduledAt = this.calculateNextSendTime(
      config.frequency,
      config.preferredTime,
      config.timezone,
    );

    // Store in sent history
    if (!this.sentDigests.has(userId)) {
      this.sentDigests.set(userId, []);
    }
    this.sentDigests.get(userId)!.push(digest);

    // Clean up included items from queue
    const queue = this.queues.get(userId);
    if (queue) {
      this.queues.set(
        userId,
        queue.filter((item) => !item.included),
      );
    }

    return digest;
  }

  /**
   * Set digest frequency for a user
   */
  public setFrequency(userId: string, frequency: DigestFrequency): DigestConfig {
    return this.configure(userId, { frequency });
  }

  /**
   * Get a preview of what the next digest would contain
   */
  public getDigestPreview(userId: string): {
    notificationCount: number;
    types: Record<string, number>;
    oldestItem: number | null;
    newestItem: number | null;
    estimatedSendAt: number | null;
  } {
    const queue = this.queues.get(userId);
    const config = this.configs.get(userId);

    if (!queue || queue.length === 0) {
      return {
        notificationCount: 0,
        types: {},
        oldestItem: null,
        newestItem: null,
        estimatedSendAt: config?.nextScheduledAt || null,
      };
    }

    const unincluded = queue.filter((item) => !item.included);
    const types: Record<string, number> = {};
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const item of unincluded) {
      const type = item.notification.type;
      types[type] = (types[type] || 0) + 1;

      if (oldest === null || item.queuedAt < oldest) oldest = item.queuedAt;
      if (newest === null || item.queuedAt > newest) newest = item.queuedAt;
    }

    return {
      notificationCount: unincluded.length,
      types,
      oldestItem: oldest,
      newestItem: newest,
      estimatedSendAt: config?.nextScheduledAt || null,
    };
  }

  /**
   * Unsubscribe a user from digests
   */
  public unsubscribe(userId: string): boolean {
    const config = this.configs.get(userId);
    if (!config) return false;

    config.isActive = false;
    config.frequency = 'never';
    return true;
  }

  /**
   * Resubscribe a user to digests
   */
  public resubscribe(userId: string, frequency: DigestFrequency = 'daily'): DigestConfig | null {
    const config = this.configs.get(userId);
    if (!config) return null;

    config.isActive = true;
    config.frequency = frequency;
    config.nextScheduledAt = this.calculateNextSendTime(
      frequency,
      config.preferredTime,
      config.timezone,
    );

    return config;
  }

  /**
   * Get users who are due for digest sending
   */
  public getDueUsers(): string[] {
    const now = Date.now();
    const dueUsers: string[] = [];

    for (const [userId, config] of this.configs) {
      if (!config.isActive) continue;
      if (config.frequency === 'never' || config.frequency === 'realtime') continue;
      if (config.nextScheduledAt && config.nextScheduledAt <= now) {
        const queue = this.queues.get(userId);
        if (queue && queue.some((item) => !item.included)) {
          dueUsers.push(userId);
        }
      }
    }

    return dueUsers;
  }

  /**
   * Process all due digests
   */
  public processAllDue(): DigestContent[] {
    const dueUsers = this.getDueUsers();
    const sentDigests: DigestContent[] = [];

    for (const userId of dueUsers) {
      const digest = this.sendDigest(userId);
      if (digest) {
        sentDigests.push(digest);
      }
    }

    return sentDigests;
  }

  /**
   * Get digest history for a user
   */
  public getHistory(userId: string, limit: number = 10): DigestContent[] {
    const history = this.sentDigests.get(userId) || [];
    return history.slice(-limit).reverse();
  }

  /**
   * Get user's digest configuration
   */
  public getConfig(userId: string): DigestConfig | undefined {
    return this.configs.get(userId);
  }

  /**
   * Get service statistics
   */
  public getStats(): {
    configuredUsers: number;
    activeUsers: number;
    totalQueued: number;
    totalSent: number;
    frequencyBreakdown: Record<DigestFrequency, number>;
  } {
    let activeUsers = 0;
    let totalQueued = 0;
    let totalSent = 0;
    const frequencyBreakdown: Record<DigestFrequency, number> = {
      realtime: 0,
      hourly: 0,
      daily: 0,
      weekly: 0,
      monthly: 0,
      never: 0,
    };

    for (const [, config] of this.configs) {
      if (config.isActive) activeUsers++;
      frequencyBreakdown[config.frequency]++;
    }

    for (const [, queue] of this.queues) {
      totalQueued += queue.filter((i) => !i.included).length;
    }

    for (const [, digests] of this.sentDigests) {
      totalSent += digests.length;
    }

    return {
      configuredUsers: this.configs.size,
      activeUsers,
      totalQueued,
      totalSent,
      frequencyBreakdown,
    };
  }

  // ---- Private Methods ----

  private buildSummary(notifications: InAppNotification[]): DigestSummary {
    const byType: Record<string, number> = {};
    let unreadCount = 0;

    for (const notif of notifications) {
      byType[notif.type] = (byType[notif.type] || 0) + 1;
      if (!notif.read) unreadCount++;
    }

    // Generate highlights (top 3 most important notifications)
    const sorted = [...notifications].sort((a, b) => {
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
      return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
    });

    const highlights = sorted.slice(0, 3).map((n) => n.title);

    return {
      totalNotifications: notifications.length,
      byType,
      highlights,
      unreadCount,
    };
  }

  private calculateNextSendTime(
    frequency: DigestFrequency,
    preferredTime: string,
    _timezone: string,
  ): number {
    const now = Date.now();
    const frequencyMs = this.getFrequencyMs(frequency);

    if (frequencyMs === 0) return 0;

    // Parse preferred time
    const [hours, minutes] = preferredTime.split(':').map(Number);
    const nextSend = new Date(now + frequencyMs);
    nextSend.setHours(hours || 9, minutes || 0, 0, 0);

    // If the calculated time is in the past, add one more period
    if (nextSend.getTime() <= now) {
      return nextSend.getTime() + frequencyMs;
    }

    return nextSend.getTime();
  }

  private getFrequencyMs(frequency: DigestFrequency): number {
    switch (frequency) {
      case 'hourly':
        return 3600000;
      case 'daily':
        return 86400000;
      case 'weekly':
        return 604800000;
      case 'monthly':
        return 2592000000;
      case 'realtime':
      case 'never':
      default:
        return 0;
    }
  }

  private generateId(prefix: string): string {
    this.digestCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.digestCounter.toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${counter}_${random}`;
  }
}
