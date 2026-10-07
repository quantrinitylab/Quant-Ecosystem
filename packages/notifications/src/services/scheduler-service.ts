// ============================================================================
// Notifications - Scheduler Service
// Cron-like scheduling with timezone support and recurrence
// ============================================================================

import type { ScheduledNotification, NotificationPayload, RecurrenceRule } from '../types';

/** Scheduler configuration */
interface SchedulerConfig {
  maxScheduledPerUser: number;
  maxRetries: number;
  overdueThresholdMs: number;
  processIntervalMs: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  maxScheduledPerUser: 100,
  maxRetries: 3,
  overdueThresholdMs: 300000, // 5 minutes
  processIntervalMs: 60000, // 1 minute
};

/**
 * SchedulerService - Cron-like notification scheduling
 *
 * Schedules notifications for future delivery with timezone support,
 * recurrence rules (daily, weekly, monthly), queue processing,
 * and overdue detection.
 */
export class SchedulerService {
  private config: SchedulerConfig;
  private scheduled: Map<string, ScheduledNotification>;
  private userSchedules: Map<string, Set<string>>; // userId -> scheduledIds
  private timezones: Map<string, number>; // timezone -> offset in ms
  private processTimer: ReturnType<typeof setInterval> | null = null;
  private scheduleCounter: number = 0;
  private processedCount: number = 0;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scheduled = new Map();
    this.userSchedules = new Map();
    this.timezones = new Map();
    this.initTimezones();
  }

  /**
   * Schedule a notification for future delivery
   */
  public schedule(
    payload: NotificationPayload,
    scheduledFor: number,
    options: {
      timezone?: string;
      recurrence?: RecurrenceRule;
      maxRetries?: number;
    } = {},
  ): ScheduledNotification {
    const userId = payload.recipientId;
    const timezone = options.timezone || 'UTC';

    // Check user limit
    const userScheduleSet = this.userSchedules.get(userId) || new Set();
    if (userScheduleSet.size >= this.config.maxScheduledPerUser) {
      throw new Error(`Maximum scheduled notifications reached for user: ${userId}`);
    }

    // Apply timezone offset
    const adjustedTime = this.applyTimezone(scheduledFor, timezone);

    if (adjustedTime <= Date.now()) {
      throw new Error('Cannot schedule notification in the past');
    }

    const scheduled: ScheduledNotification = {
      id: this.generateId('sched'),
      payload,
      scheduledFor: adjustedTime,
      timezone,
      recurrence: options.recurrence,
      status: 'scheduled',
      retryCount: 0,
      maxRetries: options.maxRetries || this.config.maxRetries,
      createdAt: Date.now(),
    };

    this.scheduled.set(scheduled.id, scheduled);

    // Track per user
    if (!this.userSchedules.has(userId)) {
      this.userSchedules.set(userId, new Set());
    }
    this.userSchedules.get(userId)!.add(scheduled.id);

    return scheduled;
  }

  /**
   * Cancel a scheduled notification
   */
  public cancel(scheduleId: string): boolean {
    const scheduled = this.scheduled.get(scheduleId);
    if (!scheduled) return false;

    if (scheduled.status === 'sent') {
      throw new Error('Cannot cancel already sent notification');
    }

    scheduled.status = 'cancelled';

    // Remove from user set
    const userSet = this.userSchedules.get(scheduled.payload.recipientId);
    if (userSet) {
      userSet.delete(scheduleId);
    }

    return true;
  }

  /**
   * Reschedule a notification to a new time
   */
  public reschedule(scheduleId: string, newTime: number, timezone?: string): ScheduledNotification {
    const scheduled = this.scheduled.get(scheduleId);
    if (!scheduled) {
      throw new Error(`Scheduled notification not found: ${scheduleId}`);
    }

    if (scheduled.status === 'sent' || scheduled.status === 'cancelled') {
      throw new Error(`Cannot reschedule notification in status: ${scheduled.status}`);
    }

    const tz = timezone || scheduled.timezone;
    const adjustedTime = this.applyTimezone(newTime, tz);

    if (adjustedTime <= Date.now()) {
      throw new Error('Cannot reschedule notification to the past');
    }

    scheduled.scheduledFor = adjustedTime;
    scheduled.timezone = tz;
    scheduled.status = 'scheduled';
    scheduled.retryCount = 0;

    return scheduled;
  }

  /**
   * Get all scheduled notifications for a user
   */
  public getScheduled(
    userId: string,
    options: { status?: string; limit?: number } = {},
  ): ScheduledNotification[] {
    const userSet = this.userSchedules.get(userId);
    if (!userSet) return [];

    let results: ScheduledNotification[] = [];

    for (const scheduleId of userSet) {
      const scheduled = this.scheduled.get(scheduleId);
      if (!scheduled) continue;
      if (options.status && scheduled.status !== options.status) continue;
      results.push(scheduled);
    }

    results.sort((a, b) => a.scheduledFor - b.scheduledFor);

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Process the queue - find and process due notifications
   */
  public processQueue(): ScheduledNotification[] {
    const now = Date.now();
    const processed: ScheduledNotification[] = [];

    for (const [, scheduled] of this.scheduled) {
      if (scheduled.status !== 'scheduled') continue;
      if (scheduled.scheduledFor > now) continue;

      // Process this notification
      scheduled.status = 'processing';
      scheduled.lastAttemptAt = now;

      try {
        // In production, this would actually send the notification
        scheduled.status = 'sent';
        this.processedCount++;
        processed.push(scheduled);

        // Handle recurrence
        if (scheduled.recurrence && scheduled.recurrence.pattern !== 'once') {
          this.scheduleNext(scheduled);
        }
      } catch {
        scheduled.retryCount++;
        if (scheduled.retryCount >= scheduled.maxRetries) {
          scheduled.status = 'failed';
        } else {
          scheduled.status = 'scheduled';
          // Exponential backoff
          scheduled.scheduledFor = now + 1000 * Math.pow(2, scheduled.retryCount);
        }
      }
    }

    return processed;
  }

  /**
   * Get overdue notifications
   */
  public getOverdue(): ScheduledNotification[] {
    const now = Date.now();
    const overdue: ScheduledNotification[] = [];

    for (const [, scheduled] of this.scheduled) {
      if (scheduled.status !== 'scheduled') continue;
      if (scheduled.scheduledFor < now - this.config.overdueThresholdMs) {
        overdue.push(scheduled);
      }
    }

    return overdue.sort((a, b) => a.scheduledFor - b.scheduledFor);
  }

  /**
   * Set timezone for a user's notifications
   */
  public setTimezone(userId: string, timezone: string): void {
    const userSet = this.userSchedules.get(userId);
    if (!userSet) return;

    for (const scheduleId of userSet) {
      const scheduled = this.scheduled.get(scheduleId);
      if (scheduled && scheduled.status === 'scheduled') {
        // Recalculate scheduled time for new timezone
        const oldOffset = this.getTimezoneOffset(scheduled.timezone);
        const newOffset = this.getTimezoneOffset(timezone);
        const diff = newOffset - oldOffset;

        scheduled.scheduledFor += diff;
        scheduled.timezone = timezone;
      }
    }
  }

  /**
   * Get upcoming scheduled notifications (next N hours)
   */
  public getUpcoming(hoursAhead: number = 24): ScheduledNotification[] {
    const now = Date.now();
    const cutoff = now + hoursAhead * 3600000;
    const upcoming: ScheduledNotification[] = [];

    for (const [, scheduled] of this.scheduled) {
      if (scheduled.status !== 'scheduled') continue;
      if (scheduled.scheduledFor >= now && scheduled.scheduledFor <= cutoff) {
        upcoming.push(scheduled);
      }
    }

    return upcoming.sort((a, b) => a.scheduledFor - b.scheduledFor);
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalScheduled: number;
    pending: number;
    processed: number;
    failed: number;
    cancelled: number;
    overdue: number;
  } {
    let pending = 0;
    let failed = 0;
    let cancelled = 0;

    for (const [, scheduled] of this.scheduled) {
      switch (scheduled.status) {
        case 'scheduled':
          pending++;
          break;
        case 'failed':
          failed++;
          break;
        case 'cancelled':
          cancelled++;
          break;
      }
    }

    return {
      totalScheduled: this.scheduled.size,
      pending,
      processed: this.processedCount,
      failed,
      cancelled,
      overdue: this.getOverdue().length,
    };
  }

  /**
   * Start automatic processing
   */
  public startProcessing(): void {
    if (this.processTimer) return;
    this.processTimer = setInterval(() => {
      this.processQueue();
    }, this.config.processIntervalMs);
  }

  /**
   * Stop automatic processing
   */
  public stopProcessing(): void {
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = null;
    }
  }

  /**
   * Destroy the service
   */
  public destroy(): void {
    this.stopProcessing();
    this.scheduled.clear();
    this.userSchedules.clear();
  }

  // ---- Private Methods ----

  private scheduleNext(current: ScheduledNotification): void {
    if (!current.recurrence) return;

    const nextTime = this.calculateNextOccurrence(current.scheduledFor, current.recurrence);
    if (!nextTime) return;

    // Check end conditions
    if (current.recurrence.endDate && nextTime > current.recurrence.endDate) return;

    const newPayload = { ...current.payload, id: this.generateId('notif') };

    this.schedule(newPayload, nextTime, {
      timezone: current.timezone,
      recurrence: current.recurrence,
      maxRetries: current.maxRetries,
    });
  }

  private calculateNextOccurrence(currentTime: number, rule: RecurrenceRule): number | null {
    const interval = rule.interval || 1;

    switch (rule.pattern) {
      case 'once':
        return null;

      case 'daily':
        return currentTime + 86400000 * interval;

      case 'weekly': {
        if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
          const currentDate = new Date(currentTime);
          const currentDay = currentDate.getDay();
          const sortedDays = [...rule.daysOfWeek].sort((a, b) => a - b);

          // Find next day in the list
          for (const day of sortedDays) {
            if (day > currentDay) {
              return currentTime + (day - currentDay) * 86400000;
            }
          }
          // Wrap to next week
          const daysUntilNext = 7 - currentDay + sortedDays[0]!;
          return currentTime + daysUntilNext * 86400000;
        }
        return currentTime + 604800000 * interval;
      }

      case 'monthly': {
        const date = new Date(currentTime);
        date.setMonth(date.getMonth() + interval);
        if (rule.dayOfMonth) {
          date.setDate(rule.dayOfMonth);
        }
        return date.getTime();
      }

      case 'custom':
        return currentTime + 86400000 * interval;

      default:
        return null;
    }
  }

  private applyTimezone(timestamp: number, timezone: string): number {
    const offset = this.getTimezoneOffset(timezone);
    return timestamp - offset;
  }

  private getTimezoneOffset(timezone: string): number {
    return this.timezones.get(timezone) || 0;
  }

  private initTimezones(): void {
    const offsets: Record<string, number> = {
      UTC: 0,
      GMT: 0,
      'US/Eastern': -18000000,
      'US/Central': -21600000,
      'US/Mountain': -25200000,
      'US/Pacific': -28800000,
      'Europe/London': 0,
      'Europe/Paris': 3600000,
      'Europe/Berlin': 3600000,
      'Asia/Tokyo': 32400000,
      'Asia/Shanghai': 28800000,
      'Asia/Kolkata': 19800000,
      'Australia/Sydney': 39600000,
      'Pacific/Auckland': 43200000,
    };

    for (const [tz, offset] of Object.entries(offsets)) {
      this.timezones.set(tz, offset);
    }
  }

  private generateId(prefix: string): string {
    this.scheduleCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.scheduleCounter.toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${counter}_${random}`;
  }
}
