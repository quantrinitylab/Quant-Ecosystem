// ============================================================================
// Notifications - In-App Notification Service
// Full notification lifecycle management with grouping and history
// ============================================================================

import type {
  InAppNotification,
  NotificationType,
  NotificationPriority,
  NotificationGroup,
  RichMedia,
  NotificationAction,
  DeepLinkAction,
} from '../types';

/** In-app service configuration */
interface InAppServiceConfig {
  maxNotificationsPerUser: number;
  groupingEnabled: boolean;
  groupingThreshold: number;
  expirationMs: number;
  autoMarkReadOnView: boolean;
}

const DEFAULT_CONFIG: InAppServiceConfig = {
  maxNotificationsPerUser: 1000,
  groupingEnabled: true,
  groupingThreshold: 3,
  expirationMs: 2592000000, // 30 days
  autoMarkReadOnView: false,
};

/**
 * InAppNotificationService - In-app notification lifecycle management
 *
 * Handles creation, reading, dismissing, grouping, and history
 * of in-app notifications. Supports rich media, actions,
 * deep links, and notification grouping by type.
 */
export class InAppNotificationService {
  private config: InAppServiceConfig;
  private notifications: Map<string, InAppNotification>;
  private userNotifications: Map<string, string[]>; // userId -> notificationIds
  private groups: Map<string, NotificationGroup>;
  private notificationCounter: number = 0;

  constructor(config: Partial<InAppServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.notifications = new Map();
    this.userNotifications = new Map();
    this.groups = new Map();
  }

  /**
   * Create a new in-app notification
   */
  public create(
    recipientId: string,
    title: string,
    body: string,
    options: {
      type?: NotificationType;
      priority?: NotificationPriority;
      senderId?: string;
      richMedia?: RichMedia;
      actions?: NotificationAction[];
      deepLink?: DeepLinkAction;
      groupId?: string;
      expiresAt?: number;
    } = {},
  ): InAppNotification {
    const now = Date.now();

    const notification: InAppNotification = {
      id: this.generateId('notif'),
      type: options.type || 'system',
      priority: options.priority || 'normal',
      title,
      body,
      recipientId,
      senderId: options.senderId,
      read: false,
      dismissed: false,
      richMedia: options.richMedia,
      actions: options.actions,
      deepLink: options.deepLink,
      groupId: options.groupId,
      createdAt: now,
      expiresAt: options.expiresAt || now + this.config.expirationMs,
    };

    this.notifications.set(notification.id, notification);

    // Add to user's notifications
    if (!this.userNotifications.has(recipientId)) {
      this.userNotifications.set(recipientId, []);
    }
    const userNotifs = this.userNotifications.get(recipientId)!;
    userNotifs.unshift(notification.id);

    // Enforce max notifications
    if (userNotifs.length > this.config.maxNotificationsPerUser) {
      const removed = userNotifs.pop();
      if (removed) this.notifications.delete(removed);
    }

    // Handle grouping
    if (this.config.groupingEnabled) {
      this.updateGroup(notification);
    }

    return notification;
  }

  /**
   * Mark a notification as read
   */
  public markRead(notificationId: string): boolean {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;

    if (!notification.read) {
      notification.read = true;
      notification.readAt = Date.now();
    }
    return true;
  }

  /**
   * Mark all notifications for a user as read
   */
  public markAllRead(userId: string): number {
    const userNotifs = this.userNotifications.get(userId);
    if (!userNotifs) return 0;

    let count = 0;
    const now = Date.now();

    for (const notifId of userNotifs) {
      const notification = this.notifications.get(notifId);
      if (notification && !notification.read) {
        notification.read = true;
        notification.readAt = now;
        count++;
      }
    }

    return count;
  }

  /**
   * Get unread notifications for a user
   */
  public getUnread(
    userId: string,
    options: { limit?: number; type?: NotificationType; priority?: NotificationPriority } = {},
  ): InAppNotification[] {
    const userNotifs = this.userNotifications.get(userId);
    if (!userNotifs) return [];

    let results: InAppNotification[] = [];
    const now = Date.now();

    for (const notifId of userNotifs) {
      const notification = this.notifications.get(notifId);
      if (!notification) continue;
      if (notification.read) continue;
      if (notification.dismissed) continue;
      if (notification.expiresAt && notification.expiresAt < now) continue;

      if (options.type && notification.type !== options.type) continue;
      if (options.priority && notification.priority !== options.priority) continue;

      results.push(notification);
    }

    // Sort by priority then by date
    results.sort((a, b) => {
      const priorityOrder: Record<NotificationPriority, number> = {
        critical: 0,
        high: 1,
        normal: 2,
        low: 3,
      };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.createdAt - a.createdAt;
    });

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get notification history for a user
   */
  public getHistory(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      includeRead?: boolean;
      includeDismissed?: boolean;
    } = {},
  ): { notifications: InAppNotification[]; total: number; hasMore: boolean } {
    const userNotifs = this.userNotifications.get(userId);
    if (!userNotifs) return { notifications: [], total: 0, hasMore: false };

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const includeRead = options.includeRead !== false;
    const includeDismissed = options.includeDismissed || false;

    const filtered: InAppNotification[] = [];
    for (const notifId of userNotifs) {
      const notification = this.notifications.get(notifId);
      if (!notification) continue;
      if (!includeRead && notification.read) continue;
      if (!includeDismissed && notification.dismissed) continue;
      filtered.push(notification);
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      notifications: paginated,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Dismiss a notification
   */
  public dismiss(notificationId: string): boolean {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;

    notification.dismissed = true;
    notification.dismissedAt = Date.now();
    return true;
  }

  /**
   * Group notifications by type for a user
   */
  public groupByType(userId: string): NotificationGroup[] {
    const userNotifs = this.userNotifications.get(userId);
    if (!userNotifs) return [];

    const typeGroups: Map<NotificationType, InAppNotification[]> = new Map();

    for (const notifId of userNotifs) {
      const notification = this.notifications.get(notifId);
      if (!notification || notification.dismissed) continue;

      const group = typeGroups.get(notification.type) || [];
      group.push(notification);
      typeGroups.set(notification.type, group);
    }

    const groups: NotificationGroup[] = [];
    for (const [type, notifications] of typeGroups) {
      if (notifications.length === 0) continue;

      const latestNotif = notifications[0]!;
      const shouldCollapse = notifications.length >= this.config.groupingThreshold;

      groups.push({
        id: `group_${userId}_${type}`,
        type,
        recipientId: userId,
        notifications: shouldCollapse ? notifications.slice(0, 3) : notifications,
        count: notifications.length,
        lastUpdatedAt: latestNotif.createdAt,
        summary: this.buildGroupSummary(type, notifications.length),
        collapsed: shouldCollapse,
      });
    }

    return groups.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
  }

  /**
   * Get notification count for a user
   */
  public getCount(userId: string): {
    total: number;
    unread: number;
    byType: Record<string, number>;
  } {
    const userNotifs = this.userNotifications.get(userId);
    if (!userNotifs) return { total: 0, unread: 0, byType: {} };

    let total = 0;
    let unread = 0;
    const byType: Record<string, number> = {};

    for (const notifId of userNotifs) {
      const notification = this.notifications.get(notifId);
      if (!notification || notification.dismissed) continue;

      total++;
      if (!notification.read) unread++;
      byType[notification.type] = (byType[notification.type] || 0) + 1;
    }

    return { total, unread, byType };
  }

  /**
   * Get a single notification by ID
   */
  public getById(notificationId: string): InAppNotification | undefined {
    return this.notifications.get(notificationId);
  }

  /**
   * Delete a notification
   */
  public delete(notificationId: string): boolean {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;

    // Remove from user's list
    const userNotifs = this.userNotifications.get(notification.recipientId);
    if (userNotifs) {
      const index = userNotifs.indexOf(notificationId);
      if (index !== -1) userNotifs.splice(index, 1);
    }

    return this.notifications.delete(notificationId);
  }

  /**
   * Clean up expired notifications
   */
  public cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, notification] of this.notifications) {
      if (notification.expiresAt && notification.expiresAt < now) {
        this.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get service stats
   */
  public getStats(): { totalNotifications: number; totalUsers: number; totalGroups: number } {
    return {
      totalNotifications: this.notifications.size,
      totalUsers: this.userNotifications.size,
      totalGroups: this.groups.size,
    };
  }

  // ---- Private Methods ----

  private updateGroup(notification: InAppNotification): void {
    const groupKey = `${notification.recipientId}_${notification.type}`;
    const group = this.groups.get(groupKey);

    if (group) {
      group.notifications.unshift(notification);
      group.count++;
      group.lastUpdatedAt = notification.createdAt;
      group.summary = this.buildGroupSummary(notification.type, group.count);
      group.collapsed = group.count >= this.config.groupingThreshold;
    } else {
      this.groups.set(groupKey, {
        id: `group_${groupKey}`,
        type: notification.type,
        recipientId: notification.recipientId,
        notifications: [notification],
        count: 1,
        lastUpdatedAt: notification.createdAt,
        summary: notification.title,
        collapsed: false,
      });
    }
  }

  private buildGroupSummary(type: NotificationType, count: number): string {
    const typeLabels: Record<NotificationType, string> = {
      message: 'new messages',
      mention: 'mentions',
      comment: 'new comments',
      like: 'likes',
      follow: 'new followers',
      share: 'shares',
      system: 'system notifications',
      alert: 'alerts',
      reminder: 'reminders',
      promotion: 'promotions',
      update: 'updates',
      security: 'security alerts',
      billing: 'billing notifications',
      achievement: 'achievements',
      invitation: 'invitations',
    };

    return `${count} ${typeLabels[type] || 'notifications'}`;
  }

  private generateId(prefix: string): string {
    this.notificationCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.notificationCounter.toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${counter}_${random}`;
  }
}
