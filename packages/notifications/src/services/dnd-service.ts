// ============================================================================
// Notifications - Do Not Disturb Service
// Enforces DND schedules and queues suppressed notifications
// ============================================================================

import type { DndConfig, DndSchedule, NotificationPayload } from '../types';

/** Queued notification during DND */
interface DndQueueItem {
  notification: NotificationPayload;
  queuedAt: number;
}

/**
 * DndService - Do Not Disturb enforcement
 *
 * Checks if current time falls within a user's DND schedule (timezone-aware),
 * queues suppressed notifications, and flushes them when DND ends.
 * Critical notifications always bypass DND unless explicitly configured otherwise.
 */
export class DndService {
  private configs: Map<string, DndConfig> = new Map();
  private queues: Map<string, DndQueueItem[]> = new Map();

  /**
   * Configure DND for a user
   */
  public configure(userId: string, config: DndConfig): void {
    this.configs.set(userId, config);
  }

  /**
   * Get DND config for a user
   */
  public getConfig(userId: string): DndConfig | undefined {
    return this.configs.get(userId);
  }

  /**
   * Check if DND is currently active for a user
   */
  public isActive(userId: string, now?: Date): boolean {
    const config = this.configs.get(userId);
    if (!config || !config.enabled) return false;

    const currentTime = now ?? new Date();
    return this.isInDndWindow(config, currentTime);
  }

  /**
   * Determine if a notification should be delivered or suppressed.
   * Returns true if the notification should be delivered immediately.
   * Returns false if DND is active and the notification is queued.
   */
  public shouldDeliver(userId: string, notification: NotificationPayload): boolean {
    const config = this.configs.get(userId);
    if (!config || !config.enabled) return true;

    // Critical notifications bypass DND if allowCritical is true
    if (notification.priority === 'critical' && config.allowCritical) {
      return true;
    }

    if (!this.isInDndWindow(config, new Date())) {
      return true;
    }

    // Queue the notification for later delivery
    this.enqueue(userId, notification);
    return false;
  }

  /**
   * Flush all queued notifications for a user (call when DND ends)
   */
  public flush(userId: string): NotificationPayload[] {
    const queue = this.queues.get(userId);
    if (!queue || queue.length === 0) return [];

    const notifications = queue.map((item) => item.notification);
    this.queues.set(userId, []);
    return notifications;
  }

  /**
   * Get the number of queued notifications for a user
   */
  public getQueueSize(userId: string): number {
    return this.queues.get(userId)?.length ?? 0;
  }

  /**
   * Get all queued notifications without flushing
   */
  public peekQueue(userId: string): NotificationPayload[] {
    const queue = this.queues.get(userId);
    if (!queue) return [];
    return queue.map((item) => item.notification);
  }

  /**
   * Remove DND config for a user
   */
  public removeConfig(userId: string): boolean {
    this.configs.delete(userId);
    return true;
  }

  // ---- Private Methods ----

  private enqueue(userId: string, notification: NotificationPayload): void {
    if (!this.queues.has(userId)) {
      this.queues.set(userId, []);
    }
    this.queues.get(userId)!.push({
      notification,
      queuedAt: Date.now(),
    });
  }

  private isInDndWindow(config: DndConfig, now: Date): boolean {
    const userTime = this.toTimezone(now, config.timezone);
    const currentDay = userTime.getDay();
    const currentMinutes = userTime.getHours() * 60 + userTime.getMinutes();

    for (const schedule of config.schedule) {
      if (this.matchesSchedule(schedule, currentDay, currentMinutes)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Convert a Date to the equivalent local time in the given IANA timezone.
   * Returns a new Date whose getHours/getMinutes/getDay reflect the target timezone.
   */
  private toTimezone(date: Date, timezone: string): Date {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(date);
      const get = (type: string): number =>
        parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
      return new Date(
        get('year'),
        get('month') - 1,
        get('day'),
        get('hour'),
        get('minute'),
        get('second'),
      );
    } catch {
      // Fallback to server-local time if timezone is invalid
      return date;
    }
  }

  private matchesSchedule(
    schedule: DndSchedule,
    currentDay: number,
    currentMinutes: number,
  ): boolean {
    if (!schedule.daysOfWeek.includes(currentDay)) return false;

    const [startH, startM] = schedule.startTime.split(':').map(Number);
    const [endH, endM] = schedule.endTime.split(':').map(Number);
    const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
    const endMinutes = (endH ?? 0) * 60 + (endM ?? 0);

    // Handle overnight schedules (e.g., 22:00 - 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}
