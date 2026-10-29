import { randomUUID } from 'node:crypto';
import { TypedQueue, ProactiveAgentJobSchema, type ProactiveAgentJob } from '@quant/queue';

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
  queue?: TypedQueue<ProactiveAgentJob>;
  redisUrl?: string;
}

export class CalendarCallAlertService {
  private queue: TypedQueue<ProactiveAgentJob> | null = null;
  private readonly memoryAlerts = new Map<string, ScheduledCallAlert>();
  /**
   * True only when this service constructed its own queue (REDIS_URL path).
   * An injected queue (options.queue) stays caller-owned: close() must never
   * close it, or the owner would lose its connection mid-flight.
   */
  private readonly ownsQueue: boolean = false;
  private closed = false;

  constructor(options: CalendarCallAlertOptions = {}) {
    if (options.queue) {
      this.queue = options.queue;
    } else {
      const url = options.redisUrl || process.env['REDIS_URL'];
      if (url) {
        try {
          const parsed = new URL(url);
          this.queue = new TypedQueue<ProactiveAgentJob>(
            'quant:proactive-jobs',
            ProactiveAgentJobSchema,
            {
              host: parsed.hostname || '127.0.0.1',
              port: parseInt(parsed.port, 10) || 6379,
              maxRetriesPerRequest: 1,
            },
          );
          this.ownsQueue = true;
        } catch {
          this.queue = null;
        }
      }
    }
  }

  /**
   * Lifecycle: closes the service-owned queue (if any) so app.close() never
   * leaves an orphaned Redis connection behind — the same teardown class as
   * the ci-runs queue lifecycle fix. Idempotent: repeated calls are a no-op,
   * so the queue is closed exactly once per service. A no-op for injected
   * (caller-owned) queues and for services that never built a queue.
   * Teardown failures are swallowed: close must never throw.
   */
  async close(): Promise<void> {
    if (this.closed || !this.ownsQueue) return;
    this.closed = true;
    const queue = this.queue;
    this.queue = null;
    if (queue) {
      try {
        await queue.close();
      } catch {
        // Teardown must not throw; the connection is being abandoned anyway.
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

      if (this.queue) {
        try {
          await this.queue.add(isCall ? 'meeting-call-alert' : 'meeting-reminder', jobData, {
            delay: delayMs,
            jobId,
          });
        } catch {
          // Fallback to memory tracking
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
