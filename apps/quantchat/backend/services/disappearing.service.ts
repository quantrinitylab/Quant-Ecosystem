import type { PrismaClient, Message } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export type ExpiryMode = 'after_view' | '24h' | '7d' | '30d';

interface ScheduledExpiry {
  messageId: string;
  expiresAt: Date;
  mode: ExpiryMode;
}

const EXPIRY_DURATIONS: Record<Exclude<ExpiryMode, 'after_view'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export class DisappearingService {
  private scheduledJobs: Map<string, NodeJS.Timeout> = new Map();

  constructor(private readonly prisma: PrismaClient) {}

  async scheduleExpiry(messageId: string, mode: ExpiryMode): Promise<ScheduledExpiry> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    let expiresAt: Date;

    if (mode === 'after_view') {
      // For after_view, set expiry far in future, actual deletion on view
      expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    } else {
      const duration = EXPIRY_DURATIONS[mode];
      expiresAt = new Date(Date.now() + duration);
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { expiresAt },
    });

    // Schedule the cleanup job (in-memory for now, BullMQ in production)
    if (mode !== 'after_view') {
      const delay = expiresAt.getTime() - Date.now();
      const timer = setTimeout(() => {
        void this.expireMessage(messageId);
      }, delay);
      this.scheduledJobs.set(messageId, timer);
    }

    return { messageId, expiresAt, mode };
  }

  async cancelExpiry(messageId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    // Clear scheduled timer
    const timer = this.scheduledJobs.get(messageId);
    if (timer) {
      clearTimeout(timer);
      this.scheduledJobs.delete(messageId);
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { expiresAt: null },
    });
  }

  async processExpiredMessages(): Promise<number> {
    const now = new Date();

    const expired = await this.prisma.message.findMany({
      where: {
        expiresAt: { lte: now },
        isDeleted: false,
      },
    });

    if (expired.length === 0) return 0;

    await this.prisma.message.updateMany({
      where: {
        id: { in: expired.map((m) => m.id) },
      },
      data: { isDeleted: true, content: '[Message expired]' },
    });

    return expired.length;
  }

  private async expireMessage(messageId: string): Promise<void> {
    this.scheduledJobs.delete(messageId);
    await this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: '[Message expired]' },
    });
  }

  /** Clean up timers on service shutdown */
  destroy(): void {
    for (const timer of this.scheduledJobs.values()) {
      clearTimeout(timer);
    }
    this.scheduledJobs.clear();
  }
}
