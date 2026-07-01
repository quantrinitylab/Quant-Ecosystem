// ============================================================================
// QuantChat - Broadcast Channels (Telegram-style one-to-many)
// ============================================================================
//
// Channels are one-to-many broadcast surfaces built on the existing
// Conversation (type CHANNEL) + ConversationMember (OWNER/ADMIN/MEMBER) model.
// The distinguishing rule vs a group: only OWNER/ADMIN may POST; MEMBERs are
// read-only subscribers. Publishing writes a durable Message; live fan-out to
// subscribers rides the existing realtime backplane (per-conversation channel).
//
// Depends on a narrow structural Prisma slice so it is fully unit-testable with
// a fake, and additive to ConversationService (which stays generic).

import { createAppError } from '@quant/server-core';

const POSTING_ROLES = new Set(['OWNER', 'ADMIN']);
const MAX_NAME = 200;
const MAX_CONTENT = 20000;

interface ConversationRow {
  id: string;
  type: string;
  name: string | null;
  description: string | null;
  createdBy: string;
}

interface MemberRow {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  leftAt: Date | string | null;
}

interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  createdAt: Date | string;
}

export interface ChannelPrisma {
  conversation: {
    create(args: { data: Record<string, unknown> }): Promise<ConversationRow>;
    findUnique(args: { where: { id: string } }): Promise<ConversationRow | null>;
  };
  conversationMember: {
    create(args: { data: Record<string, unknown> }): Promise<MemberRow>;
    findFirst(args: { where: Record<string, unknown> }): Promise<MemberRow | null>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  message: {
    create(args: { data: Record<string, unknown> }): Promise<MessageRow>;
  };
}

export interface ChannelView {
  id: string;
  name: string | null;
  description: string | null;
  ownerId: string;
  subscriberCount: number;
}

export class ChannelService {
  constructor(private readonly prisma: ChannelPrisma) {}

  /** Create a broadcast channel; the creator becomes its OWNER. */
  async createChannel(
    ownerId: string,
    input: { name: string; description?: string },
  ): Promise<ChannelView> {
    if (!ownerId) throw createAppError('ownerId is required', 400, 'OWNER_ID_REQUIRED');
    const name = input.name?.trim();
    if (!name || name.length > MAX_NAME) {
      throw createAppError('A valid channel name is required', 400, 'INVALID_CHANNEL_NAME');
    }
    const channel = await this.prisma.conversation.create({
      data: {
        type: 'CHANNEL',
        name,
        description: input.description?.trim() || null,
        createdBy: ownerId,
        lastMessageAt: new Date(),
        metadata: {},
      },
    });
    await this.prisma.conversationMember.create({
      data: {
        conversationId: channel.id,
        userId: ownerId,
        role: 'OWNER',
        joinedAt: new Date(),
        isMuted: false,
        lastReadAt: new Date(),
      },
    });
    return this.toView(channel, 1);
  }

  private async requireChannel(channelId: string): Promise<ConversationRow> {
    const channel = await this.prisma.conversation.findUnique({ where: { id: channelId } });
    if (!channel || channel.type !== 'CHANNEL') {
      throw createAppError('Channel not found', 404, 'CHANNEL_NOT_FOUND');
    }
    return channel;
  }

  private activeMember(channelId: string, userId: string): Promise<MemberRow | null> {
    return this.prisma.conversationMember.findFirst({
      where: { conversationId: channelId, userId, leftAt: null },
    });
  }

  /** Subscribe a user to a channel (idempotent) as a read-only MEMBER. */
  async subscribe(channelId: string, userId: string): Promise<{ subscribed: true }> {
    await this.requireChannel(channelId);
    const existing = await this.activeMember(channelId, userId);
    if (existing) return { subscribed: true };
    await this.prisma.conversationMember.create({
      data: {
        conversationId: channelId,
        userId,
        role: 'MEMBER',
        joinedAt: new Date(),
        isMuted: false,
        lastReadAt: null,
      },
    });
    return { subscribed: true };
  }

  /** Unsubscribe a user (marks the membership left; idempotent). */
  async unsubscribe(channelId: string, userId: string): Promise<{ unsubscribed: boolean }> {
    await this.requireChannel(channelId);
    const res = await this.prisma.conversationMember.updateMany({
      where: { conversationId: channelId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
    return { unsubscribed: res.count > 0 };
  }

  /** True iff the user may post to the channel (OWNER/ADMIN only). */
  async canPost(channelId: string, userId: string): Promise<boolean> {
    const member = await this.activeMember(channelId, userId);
    return member != null && POSTING_ROLES.has(member.role);
  }

  /**
   * Publish a broadcast message. Only OWNER/ADMIN may post; a subscriber
   * (MEMBER) is rejected with 403. The message is persisted durably; live
   * fan-out to subscribers is handled by the realtime backplane.
   */
  async publish(channelId: string, userId: string, content: string): Promise<MessageRow> {
    await this.requireChannel(channelId);
    const body = (content ?? '').trim();
    if (!body || body.length > MAX_CONTENT) {
      throw createAppError('Message content is required', 400, 'INVALID_MESSAGE');
    }
    const member = await this.activeMember(channelId, userId);
    if (!member) {
      throw createAppError('Not a member of this channel', 403, 'NOT_A_MEMBER');
    }
    if (!POSTING_ROLES.has(member.role)) {
      throw createAppError(
        'Only channel admins can post; subscribers are read-only',
        403,
        'CHANNEL_POST_FORBIDDEN',
      );
    }
    return this.prisma.message.create({
      data: {
        conversationId: channelId,
        senderId: userId,
        type: 'TEXT',
        content: body,
      },
    });
  }

  /** Count of active subscribers (members who have not left). */
  async subscriberCount(channelId: string): Promise<number> {
    return this.prisma.conversationMember.count({
      where: { conversationId: channelId, leftAt: null },
    });
  }

  private toView(channel: ConversationRow, subscriberCount: number): ChannelView {
    return {
      id: channel.id,
      name: channel.name,
      description: channel.description,
      ownerId: channel.createdBy,
      subscriberCount,
    };
  }
}
