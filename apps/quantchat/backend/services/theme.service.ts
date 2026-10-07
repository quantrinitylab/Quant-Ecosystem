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

  /** List all predefined chat themes stored in the database. */
  async listThemes(): Promise<ChatTheme[]> {
    return this.prisma.chatTheme.findMany();
  }

  /** Get the theme id currently applied to a conversation (null if none). */
  async getConversationThemeId(conversationId: string): Promise<string | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { themeId: true },
    });

    if (!conversation) {
      throw createAppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    return conversation.themeId ?? null;
  }

  /**
   * Persist a theme selection for a conversation. The themeId references the
   * client theme catalog (or a ChatTheme row); it is stored verbatim so all
   * participants resolve the same theme.
   */
  async setConversationTheme(conversationId: string, themeId: string): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw createAppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { themeId },
    });
  }
}
