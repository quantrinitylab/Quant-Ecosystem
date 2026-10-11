import type { PrismaClient, ChatTheme, Conversation } from '@prisma/client';
import { createAppError } from '@quant/server-core';

// ============================================================================
// Task 14.3: Chat Theme Persistence Service
//
// Persists the selected theme per-conversation (Conversation.themeId) and
// exposes the predefined ChatTheme catalog. Realtime sync to participants is
// handled by the client publishing a `theme_changed` event over the 'chat'
// channel; this service is the durable source of truth.
//
// Requirements: 14.3
// ============================================================================

export class ThemeService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * QC-F-017 (folded route): theme read/write is conversation-scoped, so the
   * requester must be an active member — same 403 NOT_A_MEMBER convention as
   * ConversationService / MessageService.
   */
  private async requireMembership(conversationId: string, requesterId: string): Promise<void> {
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId: requesterId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }
  }

  /** List all predefined chat themes stored in the database. */
  async listThemes(): Promise<ChatTheme[]> {
    return this.prisma.chatTheme.findMany();
  }

  /** Get the theme id currently applied to a conversation (null if none). */
  async getConversationThemeId(
    conversationId: string,
    requesterId: string,
  ): Promise<string | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { themeId: true },
    });

    if (!conversation) {
      throw createAppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    await this.requireMembership(conversationId, requesterId);

    return conversation.themeId ?? null;
  }

  /**
   * Persist a theme selection for a conversation. The themeId references the
   * client theme catalog (or a ChatTheme row); it is stored verbatim so all
   * participants resolve the same theme.
   */
  async setConversationTheme(
    conversationId: string,
    themeId: string,
    requesterId: string,
  ): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw createAppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    await this.requireMembership(conversationId, requesterId);

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { themeId },
    });
  }
}
