import type { PrismaClient } from '@prisma/client';
import { MessageType } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { getPrivacyService, type PrivacyService } from './privacy.service';

// ============================================================================
// QuantChat — Phase 2B: conversation-level screen-capture notices.
//
// Flow-4 thread banners ("screenshot / screen recording taken of the chat")
// need a conversation-scoped counterpart to the per-message
// POST /conversations/messages/:messageId/screenshot (Task 14.10, Phase 1B).
// This service posts the in-thread system notice for a capture of the whole
// chat surface.
//
// Safety properties (mirrored from DisappearingService.recordScreenshot):
//   - the capturer's display name comes ONLY from the verified auth
//     identity (route layer), never from the request body (QC-F-038) —
//     otherwise any caller could forge "<anyone> took a screenshot";
//   - only an active conversation member may trigger the notice
//     (403 NOT_A_MEMBER);
//   - DIRECT conversations honor the OTHER member's allowScreenshots pref
//     (QC-F-042 semantics): true = "I allow screenshots, do not notify
//     me" → notified:false and no system message. GROUP/CHANNEL
//     conversations always notify (documented; per-member opt-out fan-out
//     is a later phase).
//
// Honest-privacy contract: this is DETECTION + NOTICE only. Nothing here
// prevents a screenshot or a screen recording — that is not technically
// possible — and no copy, comment, or doc in this module may claim
// otherwise. E2EE is not enabled; nothing here claims it.
// ============================================================================

export type ScreenCaptureKind = 'screenshot' | 'screen_recording';

export interface ScreenCaptureResult {
  conversationId: string;
  systemMessageId: string | null;
  notified: boolean;
  /** The inserted system message row (null when not notified). */
  systemMessage: unknown;
}

function captureCopy(viewerName: string, kind: ScreenCaptureKind): string {
  return kind === 'screen_recording'
    ? `${viewerName} started a screen recording`
    : `${viewerName} took a screenshot`;
}

export class ThreadCaptureService {
  private readonly privacy: PrivacyService;

  constructor(
    private readonly prisma: PrismaClient,
    privacy?: PrivacyService,
  ) {
    this.privacy = privacy ?? getPrivacyService(prisma);
  }

  async recordScreenCapture(
    conversationId: string,
    viewerId: string,
    viewerName: string,
    kind: ScreenCaptureKind,
  ): Promise<ScreenCaptureResult> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw createAppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    // Only an active member may post a capture notice into the thread —
    // without this gate any logged-in user could flood any conversation
    // with fabricated capture system messages.
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId: viewerId, leftAt: null },
    });
    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    // QC-F-042 semantics at conversation scope: in a DIRECT thread the
    // other member's allowScreenshots pref gates the notification —
    // true means "I allow screenshots, do not notify me". The taker's own
    // setting is irrelevant, and nothing is ever *prevented*.
    const conversationType = (conversation as { type?: unknown }).type;
    if (conversationType === 'DIRECT') {
      const others = await this.prisma.conversationMember.findMany({
        where: { conversationId, userId: { not: viewerId }, leftAt: null },
        take: 1,
      });
      const otherId = (others[0] as { userId?: unknown } | undefined)?.userId;
      if (typeof otherId === 'string' && otherId) {
        const { prefs } = await this.privacy.resolve(otherId);
        if (prefs.allowScreenshots) {
          return { conversationId, systemMessageId: null, notified: false, systemMessage: null };
        }
      }
    }

    const systemMessage = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: viewerId,
        type: MessageType.SYSTEM,
        content: captureCopy(viewerName, kind),
        metadata: {
          system: true,
          event: 'screen_capture',
          kind,
          capturedBy: viewerId,
        },
      },
    });

    return {
      conversationId,
      systemMessageId: systemMessage.id,
      notified: true,
      systemMessage,
    };
  }
}
