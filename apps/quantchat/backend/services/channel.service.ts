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

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

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
    findMany(args: { where: Record<string, unknown> }): Promise<MemberRow[]>;
    count(args: { where: Record<string, unknown> }): Promise<number>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  message: {
    create(args: { data: Record<string, unknown> }): Promise<MessageRow>;
    findFirst(args: { where: Record<string, unknown> }): Promise<MessageRow | null>;
    findMany(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
      take?: number;
    }): Promise<MessageRow[]>;
  };
}

export interface ChannelView {
  id: string;
  name: string | null;
  description: string | null;
  ownerId: string;
  subscriberCount: number;
}

/** A channel plus the caller's membership role + posting capability. */
export interface SubscribedChannelView extends ChannelView {
  role: string;
  canPost: boolean;
}

/** A single broadcast message in a channel feed. */
export interface ChannelMessageView {
  id: string;
  channelId: string;
  senderId: string;
  content: string | null;
  createdAt: Date | string;
}

/**
 * One page of a channel feed (QC-F-449). `messages` is chronological;
 * `nextCursor` is the id of the page's OLDEST message and is the `before`
 * value for the next (older) page — null exactly when `hasMore` is false.
 */
export interface ChannelFeedPage {
  messages: ChannelMessageView[];
  hasMore: boolean;
  nextCursor: string | null;
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

  /**
   * Subscribe a user to a channel (idempotent) as a read-only MEMBER.
   * A user who previously unsubscribed still has their membership row
   * (unsubscribe only stamps `leftAt`); that row is REVIVED in place —
   * creating a second row would violate @@unique([conversationId, userId])
   * and surface as P2002 → 500 (QC-F-255). Revive resets `joinedAt` (the
   * member's history bound starts at the rejoin), `isMuted` and
   * `lastReadAt` to the same values a fresh subscribe writes, and
   * deliberately does NOT touch `role`: the role on the row was granted
   * by the channel (OWNER at create) and was never revoked by leaving,
   * so an OWNER/ADMIN who left returns with their role intact instead of
   * orphaning the channel.
   */
  async subscribe(channelId: string, userId: string): Promise<{ subscribed: true }> {
    await this.requireChannel(channelId);
    const existing = await this.activeMember(channelId, userId);
    if (existing) return { subscribed: true };
    const revived = await this.prisma.conversationMember.updateMany({
      where: { conversationId: channelId, userId },
      data: { leftAt: null, joinedAt: new Date(), isMuted: false, lastReadAt: null },
    });
    if (revived.count > 0) return { subscribed: true };
    try {
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
    } catch (err) {
      // A concurrent subscribe won the create race: if an active row now
      // exists, this call is idempotently successful; otherwise the
      // failure is real and must propagate unchanged.
      if (!isUniqueViolation(err)) throw err;
      const winner = await this.activeMember(channelId, userId);
      if (!winner) throw err;
    }
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

  /**
   * Count of active subscribers (members who have not left).
   * The id MUST name a real CHANNEL: any other conversation (DIRECT/GROUP)
   * or a missing id is 404 CHANNEL_NOT_FOUND, so this endpoint can never be
   * used to size or probe a private conversation. For a real channel the
   * count itself is public metadata — Discover publishes the same number to
   * every authenticated caller (listPublishers) and shows it next to the
   * Subscribe button — so no membership is required here. Membership gates
   * CONTENT (getMessages), not this count.
   */
  async subscriberCount(channelId: string): Promise<number> {
    await this.requireChannel(channelId);
    return this.prisma.conversationMember.count({
      where: { conversationId: channelId, leftAt: null },
    });
  }

  /**
   * List the channels a user is an active member of (owned + subscribed), each
   * with the caller's role and whether they may post. Powers the client channel
   * list + admin-composer gating (the server 403 stays authoritative).
   */
  async listChannels(userId: string): Promise<SubscribedChannelView[]> {
    if (!userId) throw createAppError('userId is required', 400, 'USER_ID_REQUIRED');
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, leftAt: null },
    });
    const views: SubscribedChannelView[] = [];
    for (const m of memberships) {
      const conv = await this.prisma.conversation.findUnique({ where: { id: m.conversationId } });
      if (!conv || conv.type !== 'CHANNEL') continue;
      const count = await this.subscriberCount(conv.id);
      views.push({
        ...this.toView(conv, count),
        role: m.role,
        canPost: POSTING_ROLES.has(m.role),
      });
    }
    return views;
  }

  /**
   * Read a channel's broadcast feed (most recent first, returned chronological).
   * A subscriber (any active member) may read; a non-member is rejected 403 so a
   * private channel's posts are not leaked.
   *
   * Archive paging (QC-F-449): `before` is the id of a message IN THIS
   * channel (normally the oldest message of the previous page). The page is
   * everything strictly older than that message under the single total
   * order [{createdAt desc},{id desc}] — the composite (createdAt, id)
   * filter means posts sharing a createdAt are never skipped or repeated,
   * and posts published between pages never shift an anchored page (an
   * offset/skip design would). The cursor is resolved AFTER the membership
   * gate, and an id that does not resolve inside this channel (unknown, or
   * a post from another channel) fails closed 400 INVALID_CURSOR — never a
   * silent page-1 fallback. `take: capped + 1` probes whether an older
   * page exists; the cap (100) is per page, the archive itself is unbounded.
   */
  async getMessages(
    channelId: string,
    userId: string,
    options: { limit?: number; before?: string } = {},
  ): Promise<ChannelFeedPage> {
    await this.requireChannel(channelId);
    const member = await this.activeMember(channelId, userId);
    if (!member) {
      throw createAppError('Subscribe to view this channel', 403, 'NOT_A_MEMBER');
    }
    const rawLimit = options.limit;
    const limit =
      typeof rawLimit === 'number' && Number.isFinite(rawLimit) ? rawLimit : 50;
    const capped = Math.min(Math.max(1, Math.floor(limit)), 100);

    let where: Record<string, unknown> = { conversationId: channelId };
    if (options.before) {
      const cursor = await this.prisma.message.findFirst({
        where: { id: options.before, conversationId: channelId },
      });
      if (!cursor) {
        throw createAppError('Invalid cursor', 400, 'INVALID_CURSOR');
      }
      where = {
        conversationId: channelId,
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      };
    }

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: capped + 1,
    });
    const hasMore = rows.length > capped;
    const page = hasMore ? rows.slice(0, capped) : rows;
    const messages = [...page]
      .map((r) => ({
        id: r.id,
        channelId: r.conversationId,
        senderId: r.senderId,
        content: r.content,
        createdAt: r.createdAt,
      }))
      .reverse();
    return {
      messages,
      hasMore,
      nextCursor: hasMore ? messages[0]!.id : null,
    };
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
