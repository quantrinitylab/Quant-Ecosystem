// ============================================================================
// Notifications - Snooze Service
// Manages snoozed notifications with configurable durations
// ============================================================================

import type { SnoozeDuration, SnoozedNotification, NotificationPayload } from '../types';

/**
 * SnoozeService - Notification snooze management
 *
 * Supports snoozing notifications with configurable durations:
 * - 15min: 15 minutes from now
 * - 1hr: 1 hour from now
 * - tomorrow: tomorrow at 9am
 * - next_active: next user active window
 *
 * Re-queues notification for delivery when snooze expires.
 */
export class SnoozeService {
  private snoozed: Map<string, SnoozedNotification> = new Map();
  private notifications: Map<string, NotificationPayload> = new Map();
  private activeHours: Map<string, { startHour: number; endHour: number }> = new Map();

  /**
   * Snooze a notification for a given duration
   */
  public snooze(
    notificationId: string,
    userId: string,
    duration: SnoozeDuration,
    notification?: NotificationPayload,
  ): SnoozedNotification {
    const now = Date.now();
    const resumeAt = this.calculateResumeTime(userId, duration, now);

    const record: SnoozedNotification = {
      notificationId,
      userId,
      snoozedAt: now,
      resumeAt,
      duration,
    };

    this.snoozed.set(this.getKey(notificationId, userId), record);

    if (notification) {
      this.notifications.set(notificationId, notification);
    }

    return record;
  }

  /**
   * Remind me about this (alias for snooze with custom duration)
   */
  public remindMe(
    notificationId: string,
    userId: string,
    durationMs: number,
    notification?: NotificationPayload,
  ): SnoozedNotification {
    const now = Date.now();
    const resumeAt = now + durationMs;

    const record: SnoozedNotification = {
      notificationId,
      userId,
      snoozedAt: now,
      resumeAt,
      duration: '15min', // default label for custom
    };

    this.snoozed.set(this.getKey(notificationId, userId), record);

    if (notification) {
      this.notifications.set(notificationId, notification);
    }

    return record;
  }

  /**
   * Cancel a snooze
   */
  public cancelSnooze(notificationId: string, userId: string): boolean {
    const key = this.getKey(notificationId, userId);
    return this.snoozed.delete(key);
  }

  /**
   * Get all expired snoozes (ready to re-deliver)
   */
  public getExpired(now?: number): SnoozedNotification[] {
    const currentTime = now ?? Date.now();
    const expired: SnoozedNotification[] = [];

    for (const [, record] of this.snoozed) {
      if (record.resumeAt <= currentTime) {
        expired.push(record);
      }
    }

    return expired;
  }

  /**
   * Flush expired snoozes and return notifications to re-deliver
   */
  public flushExpired(now?: number): NotificationPayload[] {
    const expired = this.getExpired(now);
    const toRedeliver: NotificationPayload[] = [];

    for (const record of expired) {
      const key = this.getKey(record.notificationId, record.userId);
      this.snoozed.delete(key);

      const notification = this.notifications.get(record.notificationId);
      if (notification) {
        toRedeliver.push(notification);
        this.notifications.delete(record.notificationId);
      }
    }

    return toRedeliver;
  }

  /**
   * Check if a notification is currently snoozed
   */
  public isSnoozed(notificationId: string, userId: string): boolean {
    const key = this.getKey(notificationId, userId);
    const record = this.snoozed.get(key);
    if (!record) return false;
    return record.resumeAt > Date.now();
  }

  /**
   * Get all snoozed notifications for a user
   */
  public getSnoozedForUser(userId: string): SnoozedNotification[] {
    const results: SnoozedNotification[] = [];
    for (const [, record] of this.snoozed) {
      if (record.userId === userId) {
        results.push(record);
      }
    }
    return results;
  }

  /**
   * Set user active hours (used for next_active duration calculation)
   */
  public setActiveHours(userId: string, startHour: number, endHour: number): void {
    this.activeHours.set(userId, { startHour, endHour });
  }

  /**
   * Get the number of currently snoozed notifications
   */
  public getSnoozedCount(): number {
    return this.snoozed.size;
  }

  // ---- Private Methods ----

  private getKey(notificationId: string, userId: string): string {
    return `${userId}:${notificationId}`;
  }

  private calculateResumeTime(userId: string, duration: SnoozeDuration, now: number): number {
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
      case 'next_active': {
        const hours = this.activeHours.get(userId);
        if (!hours) {
          // Default: next day at 9am
          const nextDay = new Date(now);
          nextDay.setDate(nextDay.getDate() + 1);
          nextDay.setHours(9, 0, 0, 0);
          return nextDay.getTime();
        }
        const current = new Date(now);
        const currentHour = current.getHours();
        if (currentHour < hours.startHour) {
          // Today's active window hasn't started yet
          current.setHours(hours.startHour, 0, 0, 0);
          return current.getTime();
        }
        // Next day's active window
        current.setDate(current.getDate() + 1);
        current.setHours(hours.startHour, 0, 0, 0);
        return current.getTime();
      }
    }
  }
}
