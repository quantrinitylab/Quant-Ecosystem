import type { PrismaClient } from '@prisma/client';
import { MessageType } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { getPrivacyService, type PrivacyService } from './privacy.service';

/**
 * QC-F-231: send-anchored expiry durations in milliseconds. Shared with
 * MessageService.sendMessage (Slice A) — a second map MUST NOT be created.
 * `after_view` is deliberately NOT here: its expiry is stamped on first
 * view (markViewedAndScheduleDeletion), never at send time (D1).
 */
export const EXPIRY_DURATIONS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;

/** Timed disappear modes that stamp `expiresAt` at send time (QC-F-231 Slice A). */
export type TimedDisappearMode = keyof typeof EXPIRY_DURATIONS;

export class DisappearingService {
  private readonly privacy: PrivacyService;

  constructor(
    private readonly prisma: PrismaClient,
    privacy?: PrivacyService,
  ) {
    this.privacy = privacy ?? getPrivacyService(prisma);
  }

  /**
   * QC-F-231 Slice B: durable expiry sweep — ONE batch per call. The
   * MessageExpiryWorker loops (cap 20 batches/tick) so a huge backlog can
   * never stall a single tick.
   *
   * D2 (DB hi sach): zero in-memory state — a brand-new instance purges
   * the same rows, so the sweep survives restarts and multi-replica
   * deploys. The old per-request `setTimeout` design (retired in Slice C)
   * could never do this.
   *
   * D4 (poora mitna): the purge wipes content AND media URLs AND metadata
   * (an "expired" row that still serves its media is a lie). The row
   * itself stays (`isDeleted`) so receipts/replies keep their relations.
   */
  async processExpiredMessages(batchSize = 500): Promise<number> {
    const now = new Date();

    const expired = await this.prisma.message.findMany({
      where: {
        expiresAt: { lte: now },
        isDeleted: false,
      },
      take: batchSize,
      orderBy: { expiresAt: 'asc' },
      select: { id: true },
    });

    if (expired.length === 0) return 0;

    const result = await this.prisma.message.updateMany({
      where: {
        id: { in: expired.map((m) => m.id) },
      },
      data: {
        isDeleted: true,
        content: '[Message expired]',
        mediaUrl: null,
        mediaThumbnailUrl: null,
        metadata: { expired: true },
      },
    });

    return result.count;
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
   * Mark a message as viewed and stamp its expiry `timerSeconds` after the
   * view. The view timestamp is recorded in message metadata (the schema has no
   * dedicated viewedAt column). Repeated calls are idempotent — the first view
   * wins so the timer is not extended (Requirement 18.2).
   *
   * QC-F-231 Slice C: the in-memory `setTimeout` fast-path is RETIRED. Expiry
   * is stamped in the DB here and purged by the MessageExpiryWorker; the
   * serve-guarantee in MessageService keeps expired rows out of read paths
   * even with the worker stopped. The old design (per-request instance
   * timers) died with every restart and never actually ran in production.
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
      // QC-F-231 Slice C: DB stamp ONLY — no setTimeout. The durable
      // MessageExpiryWorker owns the purge; the serve-guarantee owns the
      // read paths. A 5s preset may take up to ~30s (worker interval) to
      // physically purge, which is invisible next to the serve-guarantee.
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          expiresAt,
          metadata: { ...metadata, viewedAt: viewedAt.toISOString() },
        },
      });
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
}
