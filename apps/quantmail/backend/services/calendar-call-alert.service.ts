import { randomUUID } from 'node:crypto';
import { TypedQueue, ProactiveAgentJobSchema, type ProactiveAgentJob } from '@quant/queue';

/** Shared cross-app proactive queue. QuantChat is the sole consumer here and
 * handles ONLY `meeting_call_alert`; keep the call-alert branch on this queue. */
export const PROACTIVE_SHARED_QUEUE = 'quant:proactive-jobs';

/**
 * QuantMail-owned proactive queue. Reminders route here (NOT the shared queue)
 * so this app's reminder worker consumes them without competing with QuantChat
 * for the shared queue's jobs (BullMQ workers on one queue are competing
 * consumers — a second consumer on the shared queue would race QuantChat and
 * could steal call alerts or silently drop reminders).
 */
export const PROACTIVE_QUANTMAIL_QUEUE = 'quant:proactive-jobs:quantmail';

export interface CalendarEventReminder {
  type: string;
  minutesBefore: number | null;
  label?: string;
}

export interface CalendarEventInput {
  id: string;
  title: string;
  userId: string;
  startTime: Date | string;
  location?: string;
  organizer?: string;
  reminders?: CalendarEventReminder[] | string;
}

export interface ScheduledCallAlert {
  jobId: string;
  eventId: string;
  userId: string;
  title: string;
  minutesBefore: number;
  fireAt: string;
  status: 'scheduled' | 'cancelled' | 'fired';
}

export interface CalendarCallAlertOptions {
  /** Shared queue for `meeting_call_alert` jobs (consumed by QuantChat). */
  queue?: TypedQueue<ProactiveAgentJob>;
  /** QuantMail-owned queue for `meeting_reminder` jobs (consumed in-app). */
  reminderQueue?: TypedQueue<ProactiveAgentJob>;
  redisUrl?: string;
}

export class CalendarCallAlertService {
  private queue: TypedQueue<ProactiveAgentJob> | null = null;
  private reminderQueue: TypedQueue<ProactiveAgentJob> | null = null;
  private readonly memoryAlerts = new Map<string, ScheduledCallAlert>();

  constructor(options: CalendarCallAlertOptions = {}) {
    if (options.queue) this.queue = options.queue;
    if (options.reminderQueue) this.reminderQueue = options.reminderQueue;

    // Build any queue not explicitly injected from the Redis connection. Both
    // the shared call-alert queue and the QuantMail reminder queue share one
    // connection but are distinct BullMQ queues with distinct consumers.
    if (!options.queue || !options.reminderQueue) {
      const url = options.redisUrl || process.env['REDIS_URL'];
      if (url) {
        try {
          const parsed = new URL(url);
          const connection = {
            host: parsed.hostname || '127.0.0.1',
            port: parseInt(parsed.port, 10) || 6379,
            maxRetriesPerRequest: 1,
          };
          if (!options.queue) {
            this.queue = new TypedQueue<ProactiveAgentJob>(
              PROACTIVE_SHARED_QUEUE,
              ProactiveAgentJobSchema,
              connection,
            );
          }
          if (!options.reminderQueue) {
            this.reminderQueue = new TypedQueue<ProactiveAgentJob>(
              PROACTIVE_QUANTMAIL_QUEUE,
              ProactiveAgentJobSchema,
              connection,
            );
          }
        } catch {
          if (!options.queue) this.queue = null;
          if (!options.reminderQueue) this.reminderQueue = null;
        }
      }
    }
  }

  /**
   * Scans event reminders for call alarms and schedules proactive call alert jobs.
   */
  async scheduleAlertsForEvent(
    event: CalendarEventInput,
    now: Date = new Date(),
  ): Promise<ScheduledCallAlert[]> {
    const reminders = this.parseReminders(event.reminders);
    const scheduled: ScheduledCallAlert[] = [];
    const startTime = event.startTime instanceof Date ? event.startTime : new Date(event.startTime);
    const startMs = startTime.getTime();
    if (!Number.isFinite(startMs)) return [];

    const nowMs = now.getTime();

    for (const reminder of reminders) {
      const isCall = reminder.type === 'call';
      const minutesBefore = Math.max(0, Number(reminder.minutesBefore) || 0);
      const fireMs = startMs - minutesBefore * 60_000;
      const fireDate = new Date(fireMs);
      const delayMs = Math.max(0, fireMs - nowMs);
      const jobId = isCall
        ? `call-alert-${event.id}-${minutesBefore}`
        : `cal-remind-${event.id}-${reminder.type || 'push'}-${minutesBefore}`;

      const jobData: ProactiveAgentJob = isCall
        ? {
            jobType: 'meeting_call_alert',
            userId: event.userId,
            targetApp: 'quantchat',
            scheduledFor: fireDate.toISOString(),
            priority: 'urgent',
            payload: {
              meetingId: event.id,
              title: event.title,
              organizer: event.organizer || 'Meeting Host',
              startTime: startTime.toISOString(),
              minutesUntilStart: minutesBefore,
              location: event.location,
            },
          }
        : {
            jobType: 'meeting_reminder',
            userId: event.userId,
            targetApp: 'quantmail',
            scheduledFor: fireDate.toISOString(),
            priority: 'normal',
            payload: {
              eventId: event.id,
              title: event.title,
              startTime: startTime.toISOString(),
              minutesUntilStart: minutesBefore,
              reminderType: reminder.type || 'push',
              location: event.location,
            },
          };

      if (isCall) {
        // Call alerts stay on the SHARED queue — QuantChat's proactive
        // call-worker is the consumer. Untouched by this app's reminder path.
        if (this.queue) {
          try {
            await this.queue.add('meeting-call-alert', jobData, {
              delay: delayMs,
              jobId,
            });
          } catch {
            // Fallback to memory tracking
          }
        }
      } else {
        // Reminders route to the QuantMail-owned queue, consumed by
        // ProactiveReminderWorker. Durable retry/backoff so a transient worker
        // or Redis blip doesn't silently drop the reminder.
        if (this.reminderQueue) {
          try {
            await this.reminderQueue.add('meeting-reminder', jobData, {
              delay: delayMs,
              jobId,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              removeOnComplete: true,
              removeOnFail: false,
            });
          } catch {
            // Best-effort enqueue; a Redis blip here drops this reminder, but the
            // deterministic jobId makes a later re-schedule idempotent.
          }
        }
      }

      if (isCall) {
        const alertRecord: ScheduledCallAlert = {
          jobId,
          eventId: event.id,
          userId: event.userId,
          title: event.title,
          minutesBefore,
          fireAt: fireDate.toISOString(),
          status: 'scheduled',
        };

        this.memoryAlerts.set(jobId, alertRecord);
        scheduled.push(alertRecord);
      }
    }

    return scheduled;
  }

  /**
   * Cancels all scheduled call alert jobs for a deleted or updated calendar event.
   */
  async cancelAlertsForEvent(eventId: string): Promise<number> {
    let count = 0;
    for (const [jobId, alert] of this.memoryAlerts.entries()) {
      if (alert.eventId === eventId) {
        alert.status = 'cancelled';
        this.memoryAlerts.delete(jobId);
        if (this.queue) {
          try {
            await this.queue.remove(jobId);
          } catch {
            // Non-fatal if job was already processed or removed
          }
        }
        count++;
      }
    }
    return count;
  }

  getScheduledAlerts(userId: string): ScheduledCallAlert[] {
    return Array.from(this.memoryAlerts.values()).filter(
      (alert) => alert.userId === userId && alert.status === 'scheduled',
    );
  }

  private parseReminders(raw: unknown): CalendarEventReminder[] {
    if (Array.isArray(raw)) {
      return raw.map((item) => {
        if (typeof item === 'object' && item !== null) {
          return {
            type: String((item as Record<string, unknown>)['type'] || 'push'),
            minutesBefore: Number((item as Record<string, unknown>)['minutesBefore']) || 0,
            label: (item as Record<string, unknown>)['label'] as string | undefined,
          };
        }
        return { type: 'push', minutesBefore: 0 };
      });
    }
    if (typeof raw === 'string' && raw.trim() !== '') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return this.parseReminders(parsed);
      } catch {
        return [];
      }
    }
    return [];
  }
}
