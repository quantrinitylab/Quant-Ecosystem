import type { PrismaClient, Message } from '@prisma/client';
import { MessageType } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { getPrivacyService, type PrivacyService } from './privacy.service';

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
  private readonly privacy: PrivacyService;

  constructor(
    private readonly prisma: PrismaClient,
    privacy?: PrivacyService,
  ) {
    this.privacy = privacy ?? getPrivacyService(prisma);
  }

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
    requesterId: string,
  ): Promise<{ conversationId: string; disappearTimer: number | null }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw createAppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    // QC-F-017 (folded route): the disappear timer is conversation-scoped —
    // only an active member may change it (403 NOT_A_MEMBER convention, same
    // as ConversationService / MessageService). The /view and /screenshot
    // endpoints are a separate finding (QC-F-038) and are not touched here.
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId: requesterId, leftAt: null },
    });
    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
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
    requesterUserId: string,
  ): Promise<{ messageId: string; viewedAt: Date; expiresAt: Date }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    // QC-F-038: marking a message viewed starts its destruction timer — only
    // an active member of the message's conversation may do that. Without
    // this gate any logged-in user who learned a messageId could expire (and
    // thereby delete) anyone's message. Same 403 NOT_A_MEMBER convention as
    // setConversationTimer above and MessageService.
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId: message.conversationId, userId: requesterUserId, leftAt: null },
    });
    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    // QC-F-038: the view timer is the same Requirement-18.1 disappear timer
    // setConversationTimer preset-bounds; enforce the same presets here.
    // Validated after the membership gate (no validation oracle for
    // non-members) and before the idempotency logic (an invalid timer is a
    // 400 even on an already-viewed message).
    if (!DisappearingService.VALID_TIMER_SECONDS.includes(timerSeconds)) {
      throw createAppError('Unsupported disappear timer duration', 400, 'INVALID_TIMER');
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
  ): Promise<{
    conversationId: string;
    systemMessageId: string | null;
    notified: boolean;
  }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    // QC-F-038: a screenshot notification posts a SYSTEM message into the
    // conversation — only an active member may trigger that. Without this
    // gate any logged-in user could flood any conversation with fabricated
    // screenshot system messages.
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId: message.conversationId, userId: viewerId, leftAt: null },
    });
    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    // QC-F-042: the AUTHOR's allowScreenshots pref gates the notification.
    // Screenshots cannot be prevented (least of all on web) — this pref was
    // never a block; its honest meaning is the notification: false (the
    // default) = "tell me when someone screenshots my message" (today's
    // behaviour), true = "I allow screenshots, do not notify me". Only the
    // message author's pref counts — the screenshot-taker's own setting is
    // irrelevant. When the author opted out, no system message is created
    // and the caller is told the truth via `notified: false`.
    const authorId = (message as { senderId?: unknown }).senderId;
    if (typeof authorId === 'string' && authorId) {
      const { prefs } = await this.privacy.resolve(authorId);
      if (prefs.allowScreenshots) {
        return { conversationId: message.conversationId, systemMessageId: null, notified: false };
      }
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

    return {
      conversationId: message.conversationId,
      systemMessageId: systemMessage.id,
      notified: true,
    };
  }

  /** Clean up timers on service shutdown */
  destroy(): void {
    for (const timer of this.scheduledJobs.values()) {
      clearTimeout(timer);
    }
    this.scheduledJobs.clear();
  }
}
