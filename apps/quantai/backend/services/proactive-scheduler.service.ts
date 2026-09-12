// ============================================================================
// QuantAI — Proactive Scheduler Service (BullMQ over Redis)
//
// Schedules proactive background tasks (reminders, call alerts, digests)
// across the Quant Ecosystem using BullMQ with resilient in-memory fallback.
// ============================================================================

import { TypedQueue, ProactiveAgentJobSchema, type ProactiveAgentJob } from '@quant/queue';
import { randomUUID } from 'node:crypto';

export interface ScheduledJobRecord {
  jobId: string;
  jobType: ProactiveAgentJob['jobType'];
  userId: string;
  targetApp: string;
  scheduledFor: string;
  payload: Record<string, unknown>;
  priority: ProactiveAgentJob['priority'];
  status: 'scheduled' | 'executed' | 'cancelled';
  createdAt: number;
}

export interface ProactiveSchedulerOptions {
  redisUrl?: string;
  queue?: TypedQueue<ProactiveAgentJob>;
}

export class ProactiveSchedulerService {
  private queue: TypedQueue<ProactiveAgentJob> | null = null;
  private memoryRegistry = new Map<string, ScheduledJobRecord>();

  constructor(options: ProactiveSchedulerOptions = {}) {
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
        } catch {
          this.queue = null;
        }
      }
    }
  }

  async scheduleMeetingCallAlert(
    userId: string,
    meetingId: string,
    alertTime: Date | string,
    payload: Record<string, unknown> = {},
  ): Promise<string> {
    const scheduledDate = typeof alertTime === 'string' ? new Date(alertTime) : alertTime;
    const now = Date.now();
    const delayMs = Math.max(0, scheduledDate.getTime() - now);
    const jobId = `call-alert-${randomUUID()}`;

    const jobData: ProactiveAgentJob = {
      jobType: 'meeting_call_alert',
      userId,
      targetApp: 'quantchat',
      scheduledFor: scheduledDate.toISOString(),
      payload: { ...payload, meetingId },
      priority: 'urgent',
    };

    if (this.queue) {
      try {
        await this.queue.add('meeting-call-alert', jobData, { delay: delayMs, jobId });
      } catch {
        // Fallback to memory registry
      }
    }

    const record: ScheduledJobRecord = {
      jobId,
      jobType: jobData.jobType,
      userId,
      targetApp: jobData.targetApp,
      scheduledFor: jobData.scheduledFor,
      payload: jobData.payload,
      priority: jobData.priority,
      status: 'scheduled',
      createdAt: now,
    };
    this.memoryRegistry.set(jobId, record);

    return jobId;
  }

  async scheduleReminder(
    userId: string,
    targetApp: string,
    delayMs: number,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const scheduledDate = new Date(Date.now() + Math.max(0, delayMs));
    const jobId = `reminder-${randomUUID()}`;

    const jobData: ProactiveAgentJob = {
      jobType: 'meeting_reminder',
      userId,
      targetApp,
      scheduledFor: scheduledDate.toISOString(),
      payload,
      priority: 'high',
    };

    if (this.queue) {
      try {
        await this.queue.add('meeting-reminder', jobData, { delay: delayMs, jobId });
      } catch {
        // Fallback
      }
    }

    const record: ScheduledJobRecord = {
      jobId,
      jobType: jobData.jobType,
      userId,
      targetApp: jobData.targetApp,
      scheduledFor: jobData.scheduledFor,
      payload: jobData.payload,
      priority: jobData.priority,
      status: 'scheduled',
      createdAt: Date.now(),
    };
    this.memoryRegistry.set(jobId, record);

    return jobId;
  }

  async scheduleDailyDigest(
    userId: string,
    payload: Record<string, unknown> = {},
  ): Promise<string> {
    const jobId = `digest-${userId}-${Date.now()}`;
    const scheduledDate = new Date(Date.now() + 86400000); // 24h

    const jobData: ProactiveAgentJob = {
      jobType: 'daily_digest',
      userId,
      targetApp: 'quantmail',
      scheduledFor: scheduledDate.toISOString(),
      payload,
      priority: 'normal',
    };

    if (this.queue) {
      try {
        await this.queue.add('daily-digest', jobData, { delay: 86400000, jobId });
      } catch {
        // Fallback
      }
    }

    const record: ScheduledJobRecord = {
      jobId,
      jobType: jobData.jobType,
      userId,
      targetApp: jobData.targetApp,
      scheduledFor: jobData.scheduledFor,
      payload: jobData.payload,
      priority: jobData.priority,
      status: 'scheduled',
      createdAt: Date.now(),
    };
    this.memoryRegistry.set(jobId, record);

    return jobId;
  }

  getScheduledJobs(userId: string): ScheduledJobRecord[] {
    return Array.from(this.memoryRegistry.values()).filter(
      (job) => job.userId === userId && job.status === 'scheduled',
    );
  }

  cancelJob(jobId: string): boolean {
    const record = this.memoryRegistry.get(jobId);
    if (!record) return false;
    record.status = 'cancelled';
    return true;
  }
}
