// ============================================================================
// Database Models - Message Model (QuantChat)
// ============================================================================

import { BaseModel } from './base-model';
import type { MessageSchema, ConversationSchema, ConversationMemberSchema } from '../schemas/messages';
import { MESSAGES_TABLE } from '../schemas/messages';

/**
 * Message model for QuantChat messaging
 */
export class MessageModel extends BaseModel<MessageSchema> {
  protected tableName = 'messages';
  protected primaryKey = 'id';

  /**
   * Get messages for a conversation with pagination
   */
  async getConversationMessages(
    conversationId: string,
    limit: number = 50,
    beforeId?: string
  ): Promise<MessageSchema[]> {
    const filters = [
      { field: 'conversationId' as const, operator: 'eq' as const, value: conversationId },
      { field: 'isDeleted' as const, operator: 'eq' as const, value: false },
    ];

    return this.findMany({
      filters,
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit,
    });
  }

  /**
   * Search messages in a conversation
   */
  async searchMessages(conversationId: string, query: string): Promise<MessageSchema[]> {
    return this.findMany({
      filters: [
        { field: 'conversationId', operator: 'eq', value: conversationId },
        { field: 'content', operator: 'ilike', value: query },
        { field: 'isDeleted', operator: 'eq', value: false },
      ],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit: 50,
    });
  }

  /**
   * Soft delete a message
   */
  async softDeleteMessage(messageId: string): Promise<MessageSchema | null> {
    return this.update(messageId, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      content: null,
      mediaUrl: null,
    });
  }

  /**
   * Edit a message
   */
  async editMessage(messageId: string, content: string): Promise<MessageSchema | null> {
    return this.update(messageId, {
      content,
      isEdited: true,
      editedAt: new Date().toISOString(),
    });
  }

  /**
   * Add a reaction to a message
   */
  async addReaction(messageId: string, userId: string, emoji: string): Promise<MessageSchema | null> {
    const message = await this.findById(messageId);
    if (!message) return null;
    const reactions = [...message.reactions, { emoji, userId, createdAt: new Date().toISOString() }];
    return this.update(messageId, { reactions });
  }

  /**
   * Remove a reaction from a message
   */
  async removeReaction(messageId: string, userId: string, emoji: string): Promise<MessageSchema | null> {
    const message = await this.findById(messageId);
    if (!message) return null;
    const reactions = message.reactions.filter(
      (r) => !(r.userId === userId && r.emoji === emoji)
    );
    return this.update(messageId, { reactions });
  }

  /**
   * Get expired messages (for disappearing messages feature)
   */
  async getExpiredMessages(): Promise<MessageSchema[]> {
    const now = new Date().toISOString();
    return this.findMany({
      filters: [
        { field: 'expiresAt', operator: 'lte', value: now },
        { field: 'isDeleted', operator: 'eq', value: false },
      ],
    });
  }

  /**
   * Get unread message count for a user in a conversation
   */
  async getUnreadCount(conversationId: string, lastReadMessageId: string | null): Promise<number> {
    if (!lastReadMessageId) {
      return this.count([
        { field: 'conversationId', operator: 'eq', value: conversationId },
      ]);
    }
    const lastRead = await this.findById(lastReadMessageId);
    if (!lastRead) return 0;
    return this.count([
      { field: 'conversationId', operator: 'eq', value: conversationId },
      { field: 'createdAt', operator: 'gt', value: lastRead.createdAt },
    ]);
  }

  getTableDefinition() {
    return MESSAGES_TABLE;
  }
}

/**
 * Conversation model
 */
export class ConversationModel extends BaseModel<ConversationSchema> {
  protected tableName = 'conversations';
  protected primaryKey = 'id';

  /**
   * Get conversations for a user (via members)
   */
  async getUserConversations(userId: string): Promise<ConversationSchema[]> {
    return this.findMany({
      orderBy: [{ field: 'updatedAt', direction: 'desc' }],
    });
  }

  /**
   * Create a direct message conversation between two users
   */
  async findOrCreateDirect(user1Id: string, user2Id: string): Promise<ConversationSchema> {
    const existing = await this.findOne({
      filters: [{ field: 'type', operator: 'eq', value: 'direct' }],
    });
    if (existing) return existing;
    return this.create({
      type: 'direct',
      name: null,
      description: null,
      avatarUrl: null,
      createdBy: user1Id,
      isArchived: false,
      isPinned: false,
      lastMessageId: null,
      lastMessageAt: null,
      metadata: { participants: [user1Id, user2Id] },
      deletedAt: null,
    });
  }

  /**
   * Update last message reference
   */
  async updateLastMessage(conversationId: string, messageId: string): Promise<ConversationSchema | null> {
    return this.update(conversationId, {
      lastMessageId: messageId,
      lastMessageAt: new Date().toISOString(),
    });
  }

  getTableDefinition() {
    return { tableName: 'conversations' };
  }
}
