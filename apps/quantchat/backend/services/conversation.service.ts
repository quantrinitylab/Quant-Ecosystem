import type { PrismaClient, Conversation, ConversationMember } from '@prisma/client';
import { Prisma, ConversationType, ConversationRole } from '@prisma/client';
import { createAppError } from '@quant/server-core';

/** Map the public (lowercase) conversation-type string to the Prisma enum. */
function toConversationType(type: string): ConversationType {
  switch (type) {
    case 'group':
      return ConversationType.GROUP;
    case 'channel':
      return ConversationType.CHANNEL;
    default:
      return ConversationType.DIRECT;
  }
}

/** Map a role string (any case) to the Prisma `ConversationRole` enum. */
function toConversationRole(role: string): ConversationRole {
  switch (role.toUpperCase()) {
    case 'OWNER':
      return ConversationRole.OWNER;
    case 'ADMIN':
      return ConversationRole.ADMIN;
    default:
      return ConversationRole.MEMBER;
  }
}

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

export interface CreateConversationInput {
  creatorId: string;
  participantIds: string[];
  type: 'direct' | 'group';
  name?: string;
  description?: string;
}

export interface UpdateConversationInput {
  name?: string;
  description?: string;
  isArchived?: boolean;
}

export class ConversationService {
  constructor(private readonly prisma: PrismaClient) {}

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    const { creatorId, participantIds, type, name, description } = input;

    // For direct conversations, ensure exactly 2 participants
    if (type === 'direct' && participantIds.length !== 1) {
      throw createAppError(
        'Direct conversations must have exactly one other participant',
        400,
        'INVALID_PARTICIPANT_COUNT',
      );
    }

    const allParticipants = [creatorId, ...participantIds.filter((id) => id !== creatorId)];

    // Use a transaction to create conversation and members atomically
    const conversation = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const conv = await tx.conversation.create({
        data: {
          type: toConversationType(type),
          name: name ?? null,
          description: description ?? null,
          createdBy: creatorId,
          lastMessageAt: new Date(),
          metadata: {},
        },
      });

      const memberData = allParticipants.map((userId, index) => ({
        conversationId: conv.id,
        userId,
        role: userId === creatorId ? ConversationRole.OWNER : ConversationRole.MEMBER,
        joinedAt: new Date(),
        nickname: null,
        isMuted: false,
        lastReadAt: index === 0 ? new Date() : null,
      }));

      await tx.conversationMember.createMany({ data: memberData });

      return conv;
    });

    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.prisma.conversation.findUnique({
      where: { id },
    });
  }

  async getUserConversations(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Conversation>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [members, total] = await Promise.all([
      this.prisma.conversationMember.findMany({
        where: { userId, leftAt: null },
        include: { conversation: true },
        orderBy: { conversation: { lastMessageAt: 'desc' } },
        skip,
        take: pageSize,
      }),
      this.prisma.conversationMember.count({ where: { userId, leftAt: null } }),
    ]);

    const data = members.map((m) => (m as unknown as { conversation: Conversation }).conversation);
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

  async addMember(
    conversationId: string,
    userId: string,
    role: string = 'MEMBER',
  ): Promise<ConversationMember> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw createAppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    if (conversation.type === ConversationType.DIRECT) {
      throw createAppError(
        'Cannot add members to direct conversations',
        400,
        'DIRECT_CONVERSATION',
      );
    }

    // Check if user is already a member
    const existing = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
    });

    if (existing) {
      throw createAppError('User is already a member', 409, 'ALREADY_MEMBER');
    }

    return this.prisma.conversationMember.create({
      data: {
        conversationId,
        userId,
        role: toConversationRole(role),
        joinedAt: new Date(),
        nickname: null,
        isMuted: false,
        lastReadAt: null,
      },
    });
  }

  async removeMember(conversationId: string, userId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
    });

    if (!member) {
      throw createAppError('User is not a member of this conversation', 404, 'NOT_A_MEMBER');
    }

    await this.prisma.conversationMember.update({
      where: { id: member.id },
      data: { leftAt: new Date() },
    });
  }

  async updateConversation(id: string, data: UpdateConversationInput): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw createAppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    return this.prisma.conversation.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isArchived !== undefined && { isArchived: data.isArchived }),
      },
    });
  }

  async markRead(conversationId: string, userId: string): Promise<ConversationMember> {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
    });

    if (!member) {
      throw createAppError('User is not a member of this conversation', 404, 'NOT_A_MEMBER');
    }

    return this.prisma.conversationMember.update({
      where: { id: member.id },
      data: { lastReadAt: new Date() },
    });
  }
}
