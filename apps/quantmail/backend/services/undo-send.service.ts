import { z } from 'zod';
import crypto from 'node:crypto';
import type { TypedQueue } from '@quant/queue';

export const UndoSendJobSchema = z.object({
  emailId: z.string(),
  userId: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  scheduledAt: z.number(),
});

export const UndoSendResultSchema = z.object({
  jobId: z.string(),
  status: z.enum(['scheduled', 'cancelled', 'sent', 'expired']),
  sendsAt: z.number(),
  canUndo: z.boolean(),
});

export type UndoSendJob = z.infer<typeof UndoSendJobSchema>;
export type UndoSendResult = z.infer<typeof UndoSendResultSchema>;

const DEFAULT_DELAY_MS = 30000; // 30 seconds

export class UndoSendService {
  constructor(private queue: TypedQueue<UndoSendJob>) {}

  async scheduleSend(
    email: { to: string; subject: string; body: string },
    userId: string,
    delayMs?: number,
  ): Promise<UndoSendResult> {
    const delay = delayMs ?? DEFAULT_DELAY_MS;
    const now = Date.now();
    const emailId = crypto.randomUUID();

    const payload: UndoSendJob = {
      emailId,
      userId,
      to: email.to,
      subject: email.subject,
      body: email.body,
      scheduledAt: now,
    };

    const jobId = await this.queue.add('send-email', payload, { delay });

    return {
      jobId,
      status: 'scheduled',
      sendsAt: now + delay,
      canUndo: true,
    };
  }

  async cancelSend(jobId: string, userId: string): Promise<{ cancelled: boolean }> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return { cancelled: false };
    }

    const data = job.data as UndoSendJob;
    if (data.userId !== userId) {
      return { cancelled: false };
    }

    // Check if the job can still be cancelled (within undo window)
    const state = await job.getState();
    if (state === 'completed' || state === 'active') {
      return { cancelled: false };
    }

    await job.remove();
    return { cancelled: true };
  }

  async getSendStatus(jobId: string, userId: string): Promise<UndoSendResult> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return {
        jobId,
        status: 'expired',
        sendsAt: 0,
        canUndo: false,
      };
    }

    const data = job.data as UndoSendJob;
    if (data.userId !== userId) {
      return {
        jobId,
        status: 'expired',
        sendsAt: 0,
        canUndo: false,
      };
    }

    const state = await job.getState();
    const sendsAt = data.scheduledAt + DEFAULT_DELAY_MS;

    if (state === 'completed') {
      return { jobId, status: 'sent', sendsAt, canUndo: false };
    }

    if (state === 'delayed' || state === 'waiting') {
      return { jobId, status: 'scheduled', sendsAt, canUndo: true };
    }

    return { jobId, status: 'sent', sendsAt, canUndo: false };
  }
}
