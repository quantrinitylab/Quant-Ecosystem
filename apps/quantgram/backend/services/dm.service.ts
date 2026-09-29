// ============================================================================
// QuantNeon - Direct Messages Service
// ============================================================================
//
// Backs the (previously mock-only) QuantNeon DMs inbox. Real, persistent
// 1:1 + group conversations over the shared Prisma Conversation / Message /
// ConversationMember models (the same store QuantChat uses, so DMs are
// ecosystem-consistent). Membership is enforced on every read/write; unread
// counts derive from the caller's `lastReadAt`.
//
// DI'd narrow prisma for unit-testability.

import { createAppError } from '@quant/server-core';

export interface DmPrisma {
  conversation: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
  conversationMember: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
  message: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    findFirst: (args: Record<string, unknown>) => Promise<any>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  user: {
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
  };
}

export interface DmParticipant {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ConversationSummary {
  id: string;
  type: string;
  name: string | null;
  isGroup: boolean;
  memberIds: string[];
  participants: DmParticipant[];
  lastMessage: DmMessage | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface DmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string | null;
  mediaUrl: string | null;
  createdAt: string;
}

const MAX_CONTENT = 10000;

export class DmService {
  constructor(private readonly prisma: DmPrisma) {}

  private async requireMembership(conversationId: string, userId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member || member.leftAt) {
      throw createAppError('Not a member of this conversation', 403, 'NOT_A_MEMBER');
    }
  }

  /**
   * Find-or-create the 1:1 DIRECT conversation between the caller and another
   * user. Idempotent: a DIRECT conversation already shared by the two users is
   * returned rather than duplicated.
   */
  async startDirect(userId: string, otherUserId: string): Promise<ConversationSummary> {
    if (!otherUserId?.trim()) {
      throw createAppError('otherUserId is required', 400, 'INVALID_TARGET');
    }
    if (userId === otherUserId) {
      throw createAppError('Cannot start a conversation with yourself', 400, 'SELF_DM');
    }

    // Existing DIRECT conversation shared by both users?
    const mine = await this.prisma.conversationMember.findMany({ where: { userId } });
    const myConvIds = new Set(mine.map((m) => String(m.conversationId)));
    if (myConvIds.size > 0) {
      const theirsInMine = await this.prisma.conversationMember.findMany({
        where: { userId: otherUserId, conversationId: { in: [...myConvIds] } },
      });
      for (const m of theirsInMine) {
        const conv = await this.prisma.conversation.findUnique({
          where: { id: m.conversationId },
        });
        if (conv && conv.type === 'DIRECT' && !conv.deletedAt) {
          return this.buildSummary(conv, [userId, otherUserId], 0);
        }
      }
    }

    const conv = await this.prisma.conversation.create({
      data: { type: 'DIRECT', createdBy: userId },
    });
    await this.prisma.conversationMember.create({
      data: { conversationId: conv.id, userId, role: 'MEMBER' },
    });
    await this.prisma.conversationMember.create({
      data: { conversationId: conv.id, userId: otherUserId, role: 'MEMBER' },
    });
    return this.buildSummary(conv, [userId, otherUserId], 0);
  }

  /** The caller's conversations, newest activity first, with unread counts. */
  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, leftAt: null },
    });

    const summaries: ConversationSummary[] = [];
    for (const membership of memberships) {
      const conv = await this.prisma.conversation.findUnique({
        where: { id: membership.conversationId },
      });
      if (!conv || conv.deletedAt) continue;

      const members = await this.prisma.conversationMember.findMany({
        where: { conversationId: conv.id, leftAt: null },
      });
      const memberIds = members.map((m) => String(m.userId));

      const unreadCount = await this.prisma.message.count({
        where: {
          conversationId: conv.id,
          isDeleted: false,
          senderId: { not: userId },
          ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
        },
      });

      summaries.push(await this.buildSummary(conv, memberIds, unreadCount));
    }

    summaries.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
    return summaries;
  }

  /** Messages in a conversation (membership-gated), newest last. */
  async getMessages(
    userId: string,
    conversationId: string,
    options: { page?: number; pageSize?: number } = {},
  ): Promise<DmMessage[]> {
    await this.requireMembership(conversationId, userId);
    const page = options.page ?? 1;
    const pageSize = Math.min(options.pageSize ?? 30, 100);

    const rows = await this.prisma.message.findMany({
      where: { conversationId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return rows.reverse().map((m) => this.toMessage(m));
  }

  /** Send a text message into a conversation (membership-gated). */
  async sendMessage(userId: string, conversationId: string, content: string): Promise<DmMessage> {
    await this.requireMembership(conversationId, userId);
    const text = content?.trim() ?? '';
    if (!text) {
      throw createAppError('Message content must not be empty', 400, 'EMPTY_MESSAGE');
    }
    if (text.length > MAX_CONTENT) {
      throw createAppError('Message exceeds maximum length', 400, 'MESSAGE_TOO_LONG');
    }

    const message = await this.prisma.message.create({
      data: { conversationId, senderId: userId, type: 'TEXT', content: text },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
    return this.toMessage(message);
  }

  /** Mark the conversation read for the caller up to now. */
  async markRead(userId: string, conversationId: string): Promise<{ lastReadAt: string }> {
    await this.requireMembership(conversationId, userId);
    const now = new Date();
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: now },
    });
    return { lastReadAt: now.toISOString() };
  }

  /**
   * Build a conversation summary, enriching it with member profiles and the
   * latest message so the inbox UI can render avatars/names + a preview.
   */
  private async buildSummary(
    conv: Record<string, unknown>,
    memberIds: string[],
    unreadCount: number,
  ): Promise<ConversationSummary> {
    const [participants, lastMessage] = await Promise.all([
      this.fetchParticipants(memberIds),
      this.fetchLastMessage(String(conv['id'])),
    ]);
    const type = String(conv['type'] ?? 'DIRECT');
    const lastMessageAt = conv['lastMessageAt'] as Date | string | null | undefined;
    return {
      id: String(conv['id']),
      type,
      name: (conv['name'] as string | null) ?? null,
      isGroup: type === 'GROUP',
      memberIds,
      participants,
      lastMessage,
      lastMessageAt: lastMessageAt
        ? lastMessageAt instanceof Date
          ? lastMessageAt.toISOString()
          : String(lastMessageAt)
        : (lastMessage?.createdAt ?? null),
      unreadCount,
    };
  }

  /** Resolve basic public profiles for a set of member ids. */
  private async fetchParticipants(memberIds: string[]): Promise<DmParticipant[]> {
    if (memberIds.length === 0) return [];
    const users = await this.prisma.user.findMany({ where: { id: { in: memberIds } } });
    return users.map((u) => ({
      id: String(u['id']),
      username: String(u['username'] ?? ''),
      displayName: (u['displayName'] as string | null) ?? null,
      avatarUrl: (u['avatarUrl'] as string | null) ?? null,
    }));
  }

  /** The most recent non-deleted message in a conversation, if any. */
  private async fetchLastMessage(conversationId: string): Promise<DmMessage | null> {
    const row = await this.prisma.message.findFirst({
      where: { conversationId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toMessage(row) : null;
  }

  private toMessage(m: Record<string, unknown>): DmMessage {
    const createdAt = m['createdAt'] as Date | string | undefined;
    return {
      id: String(m['id']),
      conversationId: String(m['conversationId']),
      senderId: String(m['senderId']),
      type: String(m['type'] ?? 'TEXT'),
      content: (m['content'] as string | null) ?? null,
      mediaUrl: (m['mediaUrl'] as string | null) ?? null,
      createdAt: createdAt
        ? createdAt instanceof Date
          ? createdAt.toISOString()
          : String(createdAt)
        : new Date().toISOString(),
    };
  }
}
