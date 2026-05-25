import type { PrismaClient, Message } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
  type?: string;
  mediaUrl?: string;
  replyToId?: string;
  metadata?: Record<string, unknown>;
}

export class MessageService {
  constructor(private readonly prisma: PrismaClient) {}

  async sendMessage(input: SendMessageInput): Promise<Message> {
    const { conversationId, senderId, content, type, mediaUrl, replyToId, metadata } = input;

    // Verify user is a member of the conversation
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId: senderId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        content,
        type: type ?? 'text',
        mediaUrl: mediaUrl ?? null,
        replyToId: replyToId ?? null,
        metadata: metadata ?? {},
      },
    });

    // Update conversation's last message timestamp
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    return message;
  }

  async getMessages(
    conversationId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Message>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId, isDeleted: false },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.message.count({ where: { conversationId, isDeleted: false } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async editMessage(messageId: string, userId: string, content: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    if (message.senderId !== userId) {
      throw createAppError('Only the sender can edit this message', 403, 'NOT_MESSAGE_OWNER');
    }

    // Only allow editing within 15 minutes
    const fifteenMinutes = 15 * 60 * 1000;
    if (Date.now() - message.createdAt.getTime() > fifteenMinutes) {
      throw createAppError(
        'Message can only be edited within 15 minutes',
        400,
        'EDIT_WINDOW_EXPIRED',
      );
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { content, isEdited: true, updatedAt: new Date() },
    });
  }

  async deleteMessage(messageId: string, userId: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    if (message.senderId !== userId) {
      throw createAppError('Only the sender can delete this message', 403, 'NOT_MESSAGE_OWNER');
    }

    // Soft delete
    return this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, updatedAt: new Date() },
    });
  }

  async pinMessage(messageId: string, userId: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw createAppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
    }

    // Verify user is a member of the conversation
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId: message.conversationId, userId, leftAt: null },
    });

    if (!membership) {
      throw createAppError('User is not a member of this conversation', 403, 'NOT_A_MEMBER');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { metadata: { ...(message.metadata as object), pinned: true, pinnedBy: userId } },
    });
  }
}
