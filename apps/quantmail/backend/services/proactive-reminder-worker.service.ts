// ============================================================================
// QuantMail — proactive reminder consumer.
// ============================================================================
//
// Dedicated BullMQ consumer for the per-target queue
// `quant:proactive-jobs:quantmail` (PROACTIVE_QUANTMAIL_QUEUE). It turns
// `meeting_reminder` jobs — previously enqueued onto the SHARED
// `quant:proactive-jobs` queue and then silently dropped (QuantChat's
// call-worker is the only consumer there and it marks every non-call job
// completed) — into a durable in-app Notification and, for email reminders, a
// real SES send.
//
// Why a dedicated queue (NOT a second worker on the shared queue): BullMQ
// workers on the same queue name are COMPETING consumers — each job is
// delivered to exactly one worker. Adding another consumer to
// `quant:proactive-jobs` would race QuantChat and could steal call alerts or
// still lose reminders. The producer (calendar-call-alert.service) routes the
// reminder branch to this app-owned queue; the call-alert branch stays on the
// shared queue, untouched.
//
// Requires REDIS_URL or REDIS_HOST (queue) and, for email reminders,
// SES_REGION/AWS creds (see lib/ses-sender). Without Redis the worker starts in
// a no-op offline mode and warns; without SES the in-app Notification is the
// honest outcome.

import {
  createTypedWorker,
  ProactiveAgentJobSchema,
  type ProactiveAgentJob,
  type TypedJob,
  type Worker,
} from '@quant/queue';
import { prisma as defaultPrisma } from '@quant/database';
import {
  isSesConfigured as defaultIsSesConfigured,
  sendViaSes as defaultSendViaSes,
} from '../lib/ses-sender';
import { PROACTIVE_QUANTMAIL_QUEUE } from './calendar-call-alert.service';
import { resolveRedisConnection, type RedisConnectionOptions } from './outbound-delivery.service';

/** Minimal user shape the reminder worker needs (resolved from Prisma only). */
export interface ReminderUserRecord {
  id: string;
  email: string | null;
  displayName: string | null;
}

/**
 * Structural view of the Prisma surface the worker touches. Keeping it narrow
 * makes the processor trivially mockable in unit tests; the real client is
 * bridged with an `as unknown as` cast (same pattern as worker.ts).
 */
export interface ReminderWorkerPrisma {
  user: {
    findUnique(args: { where: { id: string } }): Promise<ReminderUserRecord | null>;
  };
  notification: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export type ReminderProcessResult =
  | 'ignored_wrong_target'
  | 'ignored_job_type'
  | 'user_not_found'
  | 'created'
  | 'already_delivered';

export interface ProactiveReminderWorkerOptions {
  connection?: RedisConnectionOptions;
  concurrency?: number;
  prisma?: ReminderWorkerPrisma;
  sendViaSes?: typeof defaultSendViaSes;
  isSesConfigured?: typeof defaultIsSesConfigured;
  onError?: (error: Error) => void;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

function describeTiming(minutes: number | null): string {
  if (minutes === null) return 'is starting soon';
  if (minutes <= 0) return 'is starting now';
  if (minutes === 1) return 'starts in 1 minute';
  if (minutes < 60) return `starts in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'starts in about 1 hour' : `starts in about ${hours} hours`;
}

export class ProactiveReminderWorker {
  private worker: Worker | null = null;
  private readonly connection?: RedisConnectionOptions;
  private readonly concurrency: number;
  private readonly prisma: ReminderWorkerPrisma;
  private readonly sendViaSes: typeof defaultSendViaSes;
  private readonly isSesConfigured: typeof defaultIsSesConfigured;
  private readonly onError?: (error: Error) => void;
  private isRunning = false;

  constructor(options: ProactiveReminderWorkerOptions = {}) {
    this.connection = options.connection;
    this.concurrency = options.concurrency ?? 5;
    this.prisma = options.prisma ?? (defaultPrisma as unknown as ReminderWorkerPrisma);
    this.sendViaSes = options.sendViaSes ?? defaultSendViaSes;
    this.isSesConfigured = options.isSesConfigured ?? defaultIsSesConfigured;
    this.onError = options.onError;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const redisConfigured = Boolean(process.env['REDIS_URL'] || process.env['REDIS_HOST']);
    if (!redisConfigured) {
      // Offline/sandbox mode: no Redis to consume from. Stay "running" for
      // programmatic dispatch in tests, but warn loudly so operators know
      // proactive reminders are inert until REDIS_URL/REDIS_HOST is provisioned.
      // eslint-disable-next-line no-console
      console.warn(
        '[quantmail:reminder-worker] REDIS_URL/REDIS_HOST not set — proactive reminder consumer is OFFLINE; meeting reminders will not be delivered',
      );
      return;
    }

    try {
      const connection = this.connection ?? resolveRedisConnection();
      this.worker = createTypedWorker<ProactiveAgentJob>(
        PROACTIVE_QUANTMAIL_QUEUE,
        ProactiveAgentJobSchema,
        async (job: TypedJob<ProactiveAgentJob>) => {
          await this.processJob(job.data);
        },
        {
          connection,
          concurrency: this.concurrency,
        },
      );

      this.worker.on('error', (err: Error) => {
        this.onError?.(err);
      });
    } catch (err) {
      this.onError?.(err as Error);
      this.worker = null;
    }
  }

  /**
   * Process a single proactive job. Throws on unexpected delivery errors so
   * BullMQ retries; the Notification row doubles as the idempotency claim, so a
   * retry after a committed reminder short-circuits (P2002) and never
   * double-emails.
   */
  async processJob(job: ProactiveAgentJob): Promise<ReminderProcessResult> {
    // Defense in depth: this worker binds ONLY the quantmail queue, but never
    // act on a job addressed to another app even if one were misrouted here.
    if (job.targetApp !== 'quantmail') {
      return 'ignored_wrong_target';
    }

    switch (job.jobType) {
      case 'meeting_reminder':
        return this.deliverReminder(job);
      case 'daily_digest':
        return this.deliverDailyDigest(job);
      default:
        // inbox_triage / code_review_reminder / meeting_call_alert are not ours.
        return 'ignored_job_type';
    }
  }

  private async deliverReminder(job: ProactiveAgentJob): Promise<ReminderProcessResult> {
    const payload = job.payload;

    // SECURITY: the recipient is resolved ONLY from the authoritative User row
    // keyed by job.userId — never from any address in the (untrusted) payload —
    // so a forged or misrouted job can never redirect mail to an attacker.
    const user = await this.prisma.user.findUnique({ where: { id: job.userId } });
    if (!user) {
      // eslint-disable-next-line no-console
      console.warn(`[quantmail:reminder-worker] no user ${job.userId} for reminder; dropping`);
      return 'user_not_found';
    }

    const eventId = payload['eventId'] != null ? String(payload['eventId']) : 'unknown';
    const reminderType = payload['reminderType'] != null ? String(payload['reminderType']) : 'push';
    const rawMinutes = payload['minutesUntilStart'];
    const minutesKey = rawMinutes === undefined || rawMinutes === null ? 'na' : String(rawMinutes);
    const minutesNum = Number(rawMinutes);
    const minutes = Number.isFinite(minutesNum) ? minutesNum : null;
    const eventTitle = payload['title'] != null ? String(payload['title']) : 'Upcoming event';
    const location = payload['location'] != null ? String(payload['location']) : undefined;

    const title = `Reminder: ${eventTitle}`;
    const body = `${eventTitle} ${describeTiming(minutes)}.${location ? ` Location: ${location}.` : ''}`;
    const actionUrl = `/calendar/events/${eventId}`;
    // Idempotency: a deterministic Notification id makes the create the single
    // commit point. A re-enqueue or BullMQ retry collides on the unique id
    // (P2002) and is treated as already-delivered — no duplicate send.
    const notificationId = `rem_${eventId}_${minutesKey}_${reminderType}`;

    try {
      await this.prisma.notification.create({
        data: {
          id: notificationId,
          userId: job.userId,
          type: 'calendar_reminder',
          title,
          body,
          actionUrl,
          sourceApp: 'quantmail',
          sourceEntityId: eventId,
          priority: 'NORMAL',
          sentVia: [],
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return 'already_delivered';
      }
      throw error;
    }
    // Email reminders additionally fan out to real SES mail — but only when SES
    // is configured and the resolved user actually has an address. If SES is not
    // configured, the in-app Notification alone is the honest outcome.
    if (reminderType === 'email' && this.isSesConfigured() && user.email) {
      const fromDomain = process.env['MAIL_SENDER_DOMAIN'] ?? 'quantmail.app';
      const greeting = user.displayName ? `Hi ${user.displayName},` : 'Hi,';
      const bodyText = `${greeting}\n\n${body}`;
      const bodyHtml = `<p>${greeting}</p><p>${body}</p>`;

      // Propagates on failure so BullMQ retries; the committed Notification above
      // prevents a retry from re-sending (P2002 short-circuit on re-entry).
      await this.sendViaSes({
        from: `QuantMail Reminders <reminders@${fromDomain}>`,
        to: [user.email],
        subject: title,
        bodyText,
        bodyHtml,
      });

      try {
        await this.prisma.notification.update({
          where: { id: notificationId },
          data: { sentVia: ['email'] },
        });
      } catch (error) {
        // The email already went out; a cosmetic sentVia update failure must not
        // trigger a retry (which would skip on P2002 and never re-send anyway).
        // eslint-disable-next-line no-console
        console.error(`[quantmail:reminder-worker] sentVia update failed for ${notificationId}:`, error);
      }
    }

    return 'created';
  }

  /**
   * Daily-digest handler — same user-lookup + Notification shape, ready for when
   * a digest producer targets this queue. No producer routes `daily_digest`
   * here today, so this path is currently inert (harmless no-op).
   */
  private async deliverDailyDigest(job: ProactiveAgentJob): Promise<ReminderProcessResult> {
    const user = await this.prisma.user.findUnique({ where: { id: job.userId } });
    if (!user) return 'user_not_found';

    const payload = job.payload;
    const dateKey =
      payload['date'] != null ? String(payload['date']) : new Date().toISOString().slice(0, 10);
    const summary =
      payload['summary'] != null ? String(payload['summary']) : 'Your daily digest is ready.';
    const notificationId = `digest_${job.userId}_${dateKey}`;

    try {
      await this.prisma.notification.create({
        data: {
          id: notificationId,
          userId: job.userId,
          type: 'daily_digest',
          title: 'Your daily digest',
          body: summary,
          actionUrl: '/calendar',
          sourceApp: 'quantmail',
          sourceEntityId: dateKey,
          priority: 'NORMAL',
          sentVia: [],
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return 'already_delivered';
      }
      throw error;
    }

    return 'created';
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  get active(): boolean {
    return this.isRunning;
  }
}
