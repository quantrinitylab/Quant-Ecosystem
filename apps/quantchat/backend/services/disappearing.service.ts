import type { PrismaClient, Message } from '@prisma/client';
import { MessageType } from '@prisma/client';
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
        id: { in: expired.map((m: Message) => m.id) },
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

  // ──────────────────────────────────────────────────────────────────────────
  // Task 14.8: Per-conversation disappear-timer configuration
  // ──────────────────────────────────────────────────────────────────────────

  /** Supported disappear-timer durations in seconds (Requirement 18.1). */
  static readonly VALID_TIMER_SECONDS: readonly number[] = [5, 10, 30, 60, 300, 24 * 60 * 60];

  /**
   * Set (or clear) the disappear timer for a conversation. Pass `null` or `0`
   * to disable disappearing messages. Applies to all NEW messages.
   */
  async setConversationTimer(
    conversationId: string,
    seconds: number | null,
  ): Promise<{ conversationId: string; disappearTimer: number | null }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw createAppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    const normalized = seconds && seconds > 0 ? seconds : null;
    if (normalized !== null && !DisappearingService.VALID_TIMER_SECONDS.includes(normalized)) {
      throw createAppError('Unsupported disappear timer duration', 400, 'INVALID_TIMER');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { disappearTimer: normalized },
    });

    return { conversationId, disappearTimer: normalized };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Task 14.9: Delete after the timer expires post-view
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Mark a message as viewed and schedule its deletion `timerSeconds` after the
   * view. The view timestamp is recorded in message metadata (the schema has no
   * dedicated viewedAt column). Repeated calls are idempotent — the first view
   * wins so the timer is not extended (Requirement 18.2).
   */
  async markViewedAndScheduleDeletion(
    messageId: string,
    timerSeconds: number,
  ): Promise<{ messageId: string; viewedAt: Date; expiresAt: Date }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    const metadata = (message.metadata as Record<string, unknown>) ?? {};
    const existingViewedAt =
      typeof metadata.viewedAt === 'string' ? new Date(metadata.viewedAt) : null;

    const viewedAt = existingViewedAt ?? new Date();
    const expiresAt = new Date(viewedAt.getTime() + timerSeconds * 1000);

    if (!existingViewedAt) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          expiresAt,
          metadata: { ...metadata, viewedAt: viewedAt.toISOString() },
        },
      });

      const delay = Math.max(0, expiresAt.getTime() - Date.now());
      const timer = setTimeout(() => {
        void this.expireMessage(messageId);
      }, delay);
      this.scheduledJobs.set(messageId, timer);
    }

    return { messageId, viewedAt, expiresAt };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Task 14.10: Screenshot detection notification
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Record that `viewerName` screenshotted a message and post a system message
   * into the conversation so the sender is notified (Requirement 18.3).
   * Returns the created system message.
   */
  async recordScreenshot(
    messageId: string,
    viewerId: string,
    viewerName: string,
  ): Promise<{ conversationId: string; systemMessageId: string }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    const systemMessage = await this.prisma.message.create({
      data: {
        conversationId: message.conversationId,
        senderId: viewerId,
        type: MessageType.SYSTEM,
        content: `${viewerName} took a screenshot`,
        metadata: {
          system: true,
          event: 'screenshot',
          screenshotBy: viewerId,
          targetMessageId: messageId,
        },
      },
    });

    return { conversationId: message.conversationId, systemMessageId: systemMessage.id };
  }

  /** Clean up timers on service shutdown */
  destroy(): void {
    for (const timer of this.scheduledJobs.values()) {
      clearTimeout(timer);
    }
    this.scheduledJobs.clear();
  }
}
