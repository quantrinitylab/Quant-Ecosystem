// ============================================================================
// SMTP Submission Daemon - Outbound Delivery Queue Integration (BullMQ)
// ============================================================================

import { randomUUID } from 'node:crypto';
import {
  TypedQueue,
  SendEmailJobSchema,
  type SendEmailJob,
  type TypedQueueOptions,
} from '@quant/queue';
import { prisma, type PrismaClient } from '@quant/database';

export const OUTBOUND_DELIVERY_QUEUE = 'outbound-delivery';
export const OUTBOUND_SEND_JOB = 'send-email';

export interface SubmissionMessage {
  userId: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  rawMime: string;
  messageId?: string;
}

export interface EnqueueResult {
  jobId: string;
  emailId: string;
}

/**
 * Resolves Redis connection options from environment variables.
 */
export function resolveRedisConnection(
  env: Record<string, string | undefined> = process.env,
): TypedQueueOptions {
  const redisUrl = env['REDIS_URL'];
  if (redisUrl) {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
  }

  return {
    host: env['REDIS_HOST'] || '127.0.0.1',
    port: Number(env['REDIS_PORT'] || 6379),
  };
}

/**
 * Manages pushing authenticated and sanitized outbound submission emails
 * into the BullMQ `outbound-delivery` queue for DKIM signing and direct MTA dispatch.
 */
export class OutboundSubmissionQueue {
  private readonly queue: TypedQueue<SendEmailJob>;
  private readonly db: PrismaClient;

  constructor(
    customQueue?: TypedQueue<SendEmailJob>,
    customPrisma?: PrismaClient,
    connectionOptions?: TypedQueueOptions,
  ) {
    this.db = customPrisma || (prisma as PrismaClient);

    if (customQueue) {
      this.queue = customQueue;
    } else {
      const conn = connectionOptions || resolveRedisConnection();
      this.queue = new TypedQueue<SendEmailJob>(OUTBOUND_DELIVERY_QUEUE, SendEmailJobSchema, conn);
    }
  }

  /**
   * Enqueue a validated, sanitized message for outbound delivery.
   * Creates an `Email` record in the database (marked `queued`) and places a job in BullMQ.
   */
  async enqueueOutbound(message: SubmissionMessage): Promise<EnqueueResult> {
    const messageId = message.messageId || `<${randomUUID()}@submission.quantmail.in>`;
    let emailId: string = randomUUID();

    // 1. Persist email record in PostgreSQL if Prisma client is available and active
    try {
      // Find or create 'SENT' folder for the user
      const sentFolder = await this.db.emailFolder.findFirst({
        where: { userId: message.userId, type: 'SENT' },
      });

      const emailRecord = await this.db.email.create({
        data: {
          id: emailId,
          userId: message.userId,
          folderId: sentFolder?.id ?? null,
          fromAddress: message.from,
          toAddresses: message.to,
          ccAddresses: message.cc || [],
          bccAddresses: message.bcc || [],
          subject: message.subject,
          bodyPlain: message.bodyText || null,
          bodyHtml: message.bodyHtml || null,
          messageId,
          isSent: true,
          deliveryStatus: 'queued',
          sentAt: new Date(),
        },
      });
      emailId = emailRecord.id;
    } catch {
      // Fallback: If DB write fails or in lightweight mode, generate UUID for tracking
      emailId = randomUUID();
    }

    // 2. Prepare validated BullMQ payload conforming to SendEmailJobSchema
    const jobPayload: SendEmailJob = {
      to: message.to[0] || '',
      subject: message.subject,
      body: message.bodyText || message.bodyHtml || '',
      emailId,
      userId: message.userId,
      cc: message.cc && message.cc.length > 0 ? message.cc : undefined,
      bcc: message.bcc && message.bcc.length > 0 ? message.bcc : undefined,
    };

    // 3. Enqueue to BullMQ
    const jobId = await this.queue.add(OUTBOUND_SEND_JOB, jobPayload, {
      jobId: `outbound-delivery:${emailId}`,
    });

    return { jobId, emailId };
  }

  /**
   * Graceful shutdown of queue connections.
   */
  async close(): Promise<void> {
    await this.queue.close();
  }
}
