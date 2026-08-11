import type { PrismaClient, Email } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { TypedQueue, SendEmailJobSchema, type SendEmailJob } from '@quant/queue';
// Observability (Task 23.1, Req 23.2): every delivery operation emits a span.
import { noopSpanPort, withSpan, type SpanPort } from '../shared/observability';

/**
 * OutboundDeliveryPipeline (QuantMail SuperHub — Pillar 1, Phase 2).
 *
 * Replaces the flag-only `EmailService.send()` behaviour with a durable, queued
 * delivery pipeline backed by `@quant/queue` (BullMQ). `enqueueSend` validates
 * ownership and draft validity, creates exactly one durable job, and advances the
 * email's `deliveryStatus` to `queued`.
 *
 * The actual transmission (DKIM signing, MX resolution, SMTP delivery, per-recipient
 * DeliveryAttempt recording) is implemented by the worker `processDelivery` in a
 * follow-up task (6.2); this file is intentionally scoped to enqueue + state.
 *
 * Requirements: 4.1 (durable queued job + deliveryStatus=queued for a valid owned draft),
 * 4.2 (reject cross-owner enqueue, create no job).
 */

/** Default BullMQ queue name for outbound mail delivery. */
export const OUTBOUND_DELIVERY_QUEUE = 'outbound-delivery';

/** Job name used for outbound send jobs on the queue. */
export const OUTBOUND_SEND_JOB = 'send-email';

export interface EnqueueSendOptions {
  /** Folder the message should be filed under once sent (e.g. the Sent folder). */
  sentFolderId?: string;
  /** Optional delay before the worker picks up the job (ms) — e.g. undo-send window. */
  delayMs?: number;
}

export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
}

export function resolveRedisConnection(
  env: Record<string, string | undefined> = process.env,
): RedisConnectionOptions {
  const redisUrl = env['REDIS_URL'];
  if (!redisUrl) {
    return {
      host: env['REDIS_HOST'] ?? 'localhost',
      port: Number(env['REDIS_PORT'] ?? 6379),
    };
  }

  const parsed = new URL(redisUrl);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }

  const port = parsed.port ? Number(parsed.port) : 6379;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('REDIS_URL contains an invalid port');
  }

  const dbSegment = parsed.pathname.replace(/^\//, '');
  const db = dbSegment === '' ? undefined : Number(dbSegment);
  if (db !== undefined && (!Number.isInteger(db) || db < 0)) {
    throw new Error('REDIS_URL contains an invalid database index');
  }

  return {
    host: parsed.hostname,
    port,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(db !== undefined ? { db } : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

/**
 * Coerce a Prisma `Json` address column (typed as `unknown`/`JsonValue`) into a
 * clean `string[]` of recipient addresses.
 */
function toAddressList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }
  return [];
}

export class OutboundDeliveryPipeline {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly queue: TypedQueue<SendEmailJob>,
    /**
     * Optional observability span port (Task 23.1, Req 23.2). When wired, each
     * `enqueueSend` emits a `delivery.enqueue_send` span; defaults to a no-op.
     */
    private readonly tracer: SpanPort = noopSpanPort,
  ) {}

  /**
   * Build a TypedQueue bound to the outbound-delivery queue using the validated
   * SendEmailJob schema. Mirrors the connection-config pattern used elsewhere in
   * the app (see `routes/ai-services.ts`).
   */
  static createQueue(connection?: RedisConnectionOptions): TypedQueue<SendEmailJob> {
    const conn = connection ?? resolveRedisConnection();
    return new TypedQueue<SendEmailJob>(OUTBOUND_DELIVERY_QUEUE, SendEmailJobSchema, conn);
  }

  /**
   * Enqueue a previously-composed draft for real delivery.
   *
   * Preconditions: the email exists, is owned by `userId`, and is a valid draft.
   * Postconditions: a durable BullMQ job exists and `email.deliveryStatus = 'queued'`.
   *
   * Ownership is enforced BEFORE any job is created, so a cross-owner request
   * rejects with 403 and creates no delivery job (Requirement 4.2).
   *
   * @returns the durable delivery job id.
   */
  async enqueueSend(
    userId: string,
    emailId: string,
    options: EnqueueSendOptions = {},
  ): Promise<string> {
    // Every delivery operation emits a span (Req 23.2). The span captures the
    // owner and the resulting job/recipient counts, and ends `error` if the
    // enqueue is rejected (ownership / invalid draft / no recipients).
    return withSpan(
      this.tracer,
      'delivery.enqueue_send',
      { 'delivery.user_id': userId, 'delivery.email_id': emailId },
      async (span) => {
        const email = await this.prisma.email.findUnique({ where: { id: emailId } });

        if (!email) {
          throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
        }

        // Ownership gate — reject and create NO job if the caller is not the owner.
        if (email.userId !== userId) {
          throw createAppError('Not authorized to send this email', 403, 'FORBIDDEN');
        }

        // Must be a valid, unsent draft.
        if (!email.isDraft || email.isSent) {
          throw createAppError('Email is not a valid draft for sending', 409, 'INVALID_DRAFT');
        }

        const recipients = toAddressList((email as { toAddresses: unknown }).toAddresses);
        if (recipients.length === 0) {
          throw createAppError('Email has no recipients', 400, 'NO_RECIPIENTS');
        }

        const payload: SendEmailJob = {
          to: recipients.join(', '),
          subject: email.subject,
          body: email.bodyHtml ?? email.bodyPlain ?? '',
          emailId: email.id,
          userId,
          cc: toAddressList((email as { ccAddresses: unknown }).ccAddresses),
          bcc: toAddressList((email as { bccAddresses: unknown }).bccAddresses),
        };

        // Durable job. A deterministic jobId keyed off the email makes the enqueue
        // idempotent: re-enqueuing the same draft does not create duplicate jobs.
        // NOTE: BullMQ forbids ':' inside custom job ids (it is the Redis key
        // separator), so the queue name and email id are joined with '-'.
        const jobId = await this.queue.add(OUTBOUND_SEND_JOB, payload, {
          jobId: `${OUTBOUND_DELIVERY_QUEUE}-${email.id}`,
          ...(options.delayMs !== undefined ? { delay: options.delayMs } : {}),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: false,
          removeOnFail: false,
        });

        // Advance delivery state to `queued` (does not flip isDraft/isSent — the
        // worker records terminal state per recipient in task 6.2).
        await this.prisma.email.update({
          where: { id: email.id },
          data: {
            deliveryStatus: 'queued',
            ...(options.sentFolderId ? { folderId: options.sentFolderId } : {}),
          } as never,
        });

        span.setAttributes({
          'delivery.recipient_count': recipients.length,
          'delivery.job_id': jobId,
          'delivery.status': 'queued',
        });

        return jobId;
      },
    );
  }

  /** Fetch the current persisted state of an email (post-enqueue convenience). */
  async getEmail(emailId: string): Promise<Email | null> {
    return this.prisma.email.findUnique({ where: { id: emailId } });
  }
}
