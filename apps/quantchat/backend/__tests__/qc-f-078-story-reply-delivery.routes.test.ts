// ===========================================================================
// QC-F-078 — story reply must DELIVER, not just log
// ===========================================================================
//
// Defect: POST /stories/:storyId/reply validated the audience gate, then
// only wrote a log line and returned { success: true } — the reply never
// reached the story author, while the client showed "Reply sent". The code
// comment admitted it: "Accepted for now so the client flow works end to
// end."
//
// Fix: the reply is delivered as an ordinary direct message to the author —
// the pair's existing active DIRECT conversation is reused, otherwise one
// is bootstrapped through ConversationService.createConversation (which
// enforces the author's whoCanMessage privacy gate, QC-F-042), and the
// message goes through MessageService.sendMessage (membership gate +
// transactional delivery outbox). Success is returned only after the
// message is persisted, with its conversationId/messageId; every gate
// failure surfaces as its real error (404 invisible story, 403
// MESSAGE_NOT_ALLOWED, 503 privacy unavailable) — never a fake success.
//
// These tests mount the REAL stories route plugin on a bare Fastify
// instance with an in-memory fake Prisma (stable module-level identities —
// no fresh-identity mocks). The authorization/delivery assertions FAIL
// against the pre-fix code (verified by negative control) and pass with
// the fix.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import storiesRoutes from '../routes/stories';

// Stable identities (module-level).
const REPLIER = { userId: 'user_replier', username: 'replier' };
const AUTHOR_DM = { userId: 'user_author_dm', username: 'authordm' };
const AUTHOR_OPEN = { userId: 'user_author_open', username: 'authoropen' };
const AUTHOR_GATED = { userId: 'user_author_gated', username: 'authorgated' };
const AUTHOR_DEFAULT = { userId: 'user_author_default', username: 'authordefault' };
const STRANGER = { userId: 'user_stranger', username: 'stranger' };
const CLOSE_FRIEND = { userId: 'user_close_friend', username: 'closefriend' };
const OUTSIDER = { userId: 'user_outsider', username: 'outsider' };
const GROUP_BUDDY = { userId: 'user_group_buddy', username: 'groupbuddy' };

function prefs(whoCanSeeStory: string, whoCanMessage: string) {
  return { chatSettings: { privacy: { whoCanSeeStory, whoCanMessage } } };
}

interface MemberRow {
  conversationId: string;
  userId: string;
  leftAt: Date | null;
  role?: string;
}

interface ConversationRow {
  id: string;
  type: string;
  [key: string]: unknown;
}

interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  metadata: unknown;
  [key: string]: unknown;
}

function makeWorld() {
  const users = [
    { id: AUTHOR_DM.userId, displayName: 'DM Author', avatarUrl: null, preferences: prefs('everyone', 'friends') },
    { id: AUTHOR_OPEN.userId, displayName: 'Open Author', avatarUrl: null, preferences: prefs('everyone', 'everyone') },
    { id: AUTHOR_GATED.userId, displayName: 'Gated Author', avatarUrl: null, preferences: prefs('everyone', 'nobody') },
    { id: AUTHOR_DEFAULT.userId, displayName: 'Default Author', avatarUrl: null, preferences: null },
    { id: REPLIER.userId, displayName: 'Replier', avatarUrl: null, preferences: null },
    { id: STRANGER.userId, displayName: 'Stranger', avatarUrl: null, preferences: null },
    { id: CLOSE_FRIEND.userId, displayName: 'Close Friend', avatarUrl: null, preferences: null },
    { id: OUTSIDER.userId, displayName: 'Outsider', avatarUrl: null, preferences: null },
    { id: GROUP_BUDDY.userId, displayName: 'Group Buddy', avatarUrl: null, preferences: null },
  ];
  const userById = new Map(users.map((u) => [u.id, u]));

  const stories = [
    { id: 'story-dm', userId: AUTHOR_DM.userId, audience: 'ALL', viewCount: 0 },
    { id: 'story-open', userId: AUTHOR_OPEN.userId, audience: 'ALL', viewCount: 0 },
    { id: 'story-gated', userId: AUTHOR_GATED.userId, audience: 'ALL', viewCount: 0 },
    { id: 'story-default', userId: AUTHOR_DEFAULT.userId, audience: 'ALL', viewCount: 0 },
    { id: 'story-default-cf', userId: AUTHOR_DEFAULT.userId, audience: 'CLOSE_FRIENDS', viewCount: 0 },
  ];
  const storyById = new Map(stories.map((s) => [s.id, s]));

  // AUTHOR_DEFAULT listed CLOSE_FRIEND as a close friend (owner direction).
  const closeFriendEdges = [{ userId: AUTHOR_DEFAULT.userId, friendId: CLOSE_FRIEND.userId }];

  const conversations: ConversationRow[] = [
    { id: 'conv-dm', type: 'DIRECT' },
    { id: 'conv-group-open', type: 'GROUP' },
  ];
  const members: MemberRow[] = [
    { conversationId: 'conv-dm', userId: AUTHOR_DM.userId, leftAt: null },
    { conversationId: 'conv-dm', userId: REPLIER.userId, leftAt: null },
    // GROUP_BUDDY shares only a GROUP conversation with AUTHOR_OPEN.
    { conversationId: 'conv-group-open', userId: AUTHOR_OPEN.userId, leftAt: null },
    { conversationId: 'conv-group-open', userId: GROUP_BUDDY.userId, leftAt: null },
  ];

  const messages: MessageRow[] = [];
  const outbox: Array<{ conversationId: string; messageId: string; recipientIds: string[] }> = [];
  const streaks = new Map<string, Record<string, unknown>>();

  let conversationSeq = 0;
  let messageSeq = 0;

  function matchMembers(where: Record<string, unknown>): MemberRow[] {
    return members.filter((m) => {
      const userCond = where['userId'];
      if (typeof userCond === 'string' && m.userId !== userCond) return false;
      if (
        userCond &&
        typeof userCond === 'object' &&
        Array.isArray((userCond as { in?: unknown }).in) &&
        !((userCond as { in: string[] }).in).includes(m.userId)
      ) {
        return false;
      }
      const convCond = where['conversationId'];
      if (typeof convCond === 'string' && m.conversationId !== convCond) return false;
      if (
        convCond &&
        typeof convCond === 'object' &&
        Array.isArray((convCond as { in?: unknown }).in) &&
        !((convCond as { in: string[] }).in).includes(m.conversationId)
      ) {
        return false;
      }
      if ('leftAt' in where && m.leftAt !== where['leftAt']) return false;
      return true;
    });
  }

  const conversationDelegate = {
    // QC-F-359 fixture migration: MessageService's blocked-send gate
    // reads the conversation row's type via findUnique. The rows here
    // already carry their real type (conv-dm DIRECT, conv-group-open
    // GROUP, created rows take createConversation's type) — answering
    // from the same store keeps the scenario honest. No assertion
    // changes; user preferences above carry no blockedUsers, so the
    // gate's verdict is 'clear'.
    async findUnique({ where }: { where: { id: string } }) {
      const row = conversations.find((c) => c.id === where.id);
      return row ? { ...row } : null;
    },
    async findMany({ where }: { where: Record<string, unknown> }) {
      return conversations
        .filter((c) => {
          const idCond = where['id'] as { in?: string[] } | undefined;
          if (idCond?.in && !idCond.in.includes(c.id)) return false;
          if (where['type'] !== undefined && c.type !== where['type']) return false;
          return true;
        })
        .map((c) => ({ id: c.id, type: c.type }));
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const row: ConversationRow = {
        ...(data as ConversationRow),
        id: `conv_new_${++conversationSeq}`,
      };
      conversations.push(row);
      return row;
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const row = conversations.find((c) => c.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    },
  };

  const conversationMemberDelegate = {
    async findMany({ where }: { where: Record<string, unknown> }) {
      return matchMembers(where).map((m) => ({ ...m }));
    },
    async findFirst({ where }: { where: Record<string, unknown> }) {
      return matchMembers(where)[0] ?? null;
    },
    async createMany({ data }: { data: Array<Record<string, unknown>> }) {
      for (const d of data) {
        members.push({
          conversationId: d['conversationId'] as string,
          userId: d['userId'] as string,
          leftAt: (d['leftAt'] as Date | null | undefined) ?? null,
          role: d['role'] as string | undefined,
        });
      }
      return { count: data.length };
    },
  };

  const messageDelegate = {
    async create({ data }: { data: Record<string, unknown> }) {
      const row: MessageRow = {
        ...(data as unknown as MessageRow),
        id: `msg_${++messageSeq}`,
        createdAt: new Date(),
      };
      messages.push(row);
      return row;
    },
  };

  const messageOutboxDelegate = {
    async create({ data }: { data: Record<string, unknown> }) {
      outbox.push({
        conversationId: data['conversationId'] as string,
        messageId: data['messageId'] as string,
        recipientIds: data['recipientIds'] as string[],
      });
      return data;
    },
  };

  // One tx client for both services' transactions: ConversationService
  // uses tx.conversation.create + tx.conversationMember.createMany;
  // MessageService uses tx.message.create + tx.conversation.update +
  // tx.messageOutbox.create — all against the same in-memory store.
  const txClient = {
    conversation: conversationDelegate,
    conversationMember: conversationMemberDelegate,
    message: messageDelegate,
    messageOutbox: messageOutboxDelegate,
  };

  const prisma = {
    story: {
      async findUnique({ where }: { where: { id: string } }) {
        const row = storyById.get(where.id);
        return row ? { ...row } : null;
      },
    },
    closeFriend: {
      async findMany({ where }: { where: Record<string, unknown> }) {
        const cond = where['userId'];
        const ids =
          typeof cond === 'string' ? [cond] : ((cond as { in: string[] }).in ?? []);
        return closeFriendEdges
          .filter((e) => ids.includes(e.userId) && e.friendId === where['friendId'])
          .map((e) => ({ userId: e.userId }));
      },
    },
    user: {
      async findMany({ where }: { where: { id: { in: string[] } } }) {
        return users
          .filter((u) => where.id.in.includes(u.id))
          .map((u) => ({ id: u.id, preferences: u.preferences }));
      },
      async findUnique({ where }: { where: { id: string } }) {
        const row = userById.get(where.id);
        return row ? { preferences: row.preferences } : null;
      },
    },
    conversationMember: conversationMemberDelegate,
    conversation: conversationDelegate,
    message: messageDelegate,
    streak: {
      async findUnique({
        where,
      }: {
        where: { userAId_userBId: { userAId: string; userBId: string } };
      }) {
        const key = where.userAId_userBId;
        return streaks.get(`${key.userAId}|${key.userBId}`) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row = { id: `streak_${streaks.size + 1}`, ...data };
        streaks.set(`${data['userAId']}|${data['userBId']}`, row);
        return row;
      },
      async update({
        where,
        data,
      }: {
        where: { userAId_userBId: { userAId: string; userBId: string } };
        data: Record<string, unknown>;
      }) {
        const key = where.userAId_userBId;
        const row = { ...(streaks.get(`${key.userAId}|${key.userBId}`) ?? {}), ...data };
        streaks.set(`${key.userAId}|${key.userBId}`, row);
        return row;
      },
    },
    async $transaction<T>(cb: (tx: typeof txClient) => Promise<T>): Promise<T> {
      return cb(txClient);
    },
  };

  return { prisma, conversations, members, messages, outbox };
}

async function buildRouteApp(
  auth: { userId: string; username: string } | null,
  prisma: unknown,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
    const e = err as Error & { statusCode?: number; code?: string };
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  app.decorate('prisma', prisma as never);
  if (auth) {
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth: unknown }).auth = {
        userId: auth.userId,
        username: auth.username,
        email: '',
        role: 'user',
        scopes: [],
        sessionId: 'sess_test',
        app: 'quantchat',
        tokenId: 'tok_test',
      };
    });
  }
  await app.register(storiesRoutes, { prefix: '/stories' });
  await app.ready();
  return app;
}

describe('QC-F-078 story reply delivery', () => {
  let world: ReturnType<typeof makeWorld>;
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    world = makeWorld();
    app = null;
  });
  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  async function asUser(auth: { userId: string; username: string } | null) {
    app = await buildRouteApp(auth, world.prisma);
    return app;
  }

  function reply(server: FastifyInstance, storyId: string, message = 'nice story!') {
    return server.inject({
      method: 'POST',
      url: `/stories/${storyId}/reply`,
      payload: { message },
    });
  }

  it('delivers into the existing DIRECT conversation (no new conversation, outbox written)', async () => {
    const server = await asUser(REPLIER);
    const res = await reply(server, 'story-dm');
    expect(res.statusCode).toBe(200);
    expect(world.messages).toHaveLength(1);
    const stored = world.messages[0]!;
    expect(res.json()).toMatchObject({
      success: true,
      conversationId: 'conv-dm',
      messageId: stored.id,
    });
    expect(stored.conversationId).toBe('conv-dm');
    expect(stored.senderId).toBe(REPLIER.userId);
    expect(stored.content).toBe('nice story!');
    expect(stored.type).toBe('TEXT');
    expect(stored.metadata).toEqual({ storyReply: { storyId: 'story-dm' } });
    // Delivery intent was written for the author only.
    expect(world.outbox).toHaveLength(1);
    expect(world.outbox[0]).toMatchObject({
      conversationId: 'conv-dm',
      messageId: stored.id,
      recipientIds: [AUTHOR_DM.userId],
    });
    // No duplicate conversation was bootstrapped.
    expect(world.conversations.filter((c) => c.type === 'DIRECT')).toHaveLength(1);
  });

  it('bootstraps a new DIRECT conversation when none exists (author allows everyone)', async () => {
    const server = await asUser(STRANGER);
    const res = await reply(server, 'story-open', 'first hello');
    expect(res.statusCode).toBe(200);
    expect(world.messages).toHaveLength(1);
    const stored = world.messages[0]!;
    const body = res.json() as { success: boolean; conversationId: string; messageId: string };
    expect(body.success).toBe(true);
    expect(body.messageId).toBe(stored.id);
    expect(body.conversationId).toBe(stored.conversationId);
    expect(body.conversationId).not.toBe('conv-group-open');
    const created = world.conversations.find((c) => c.id === body.conversationId);
    expect(created?.type).toBe('DIRECT');
    const memberIds = world.members
      .filter((m) => m.conversationId === body.conversationId)
      .map((m) => m.userId)
      .sort();
    expect(memberIds).toEqual([AUTHOR_OPEN.userId, STRANGER.userId].sort());
    expect(world.outbox[0]?.recipientIds).toEqual([AUTHOR_OPEN.userId]);
  });

  it('does not deliver into a GROUP conversation shared with the author — a DIRECT one is created', async () => {
    const server = await asUser(GROUP_BUDDY);
    const res = await reply(server, 'story-open');
    expect(res.statusCode).toBe(200);
    expect(world.messages).toHaveLength(1);
    expect(world.messages[0]!.conversationId).not.toBe('conv-group-open');
    const created = world.conversations.find(
      (c) => c.id === world.messages[0]!.conversationId,
    );
    expect(created?.type).toBe('DIRECT');
  });

  it('bootstraps for a close friend under the default whoCanMessage=friends gate', async () => {
    const server = await asUser(CLOSE_FRIEND);
    const res = await reply(server, 'story-default');
    expect(res.statusCode).toBe(200);
    expect(world.messages).toHaveLength(1);
    expect(world.messages[0]!.senderId).toBe(CLOSE_FRIEND.userId);
    const memberIds = world.members
      .filter((m) => m.conversationId === world.messages[0]!.conversationId)
      .map((m) => m.userId)
      .sort();
    expect(memberIds).toEqual([AUTHOR_DEFAULT.userId, CLOSE_FRIEND.userId].sort());
  });

  it('a second reply reuses the bootstrapped conversation instead of creating another', async () => {
    const server = await asUser(STRANGER);
    const first = await reply(server, 'story-open', 'one');
    const second = await reply(server, 'story-open', 'two');
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(world.messages).toHaveLength(2);
    expect(world.messages[1]!.conversationId).toBe(world.messages[0]!.conversationId);
    // Seeded world has 2 conversations (conv-dm, conv-group-open); exactly
    // ONE new conversation exists after both replies.
    expect(world.conversations).toHaveLength(3);
  });

  it('honest failure: story visible to everyone but author accepts no new messages → 403, nothing stored', async () => {
    const server = await asUser(STRANGER);
    const res = await reply(server, 'story-gated');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'MESSAGE_NOT_ALLOWED' },
    });
    expect(world.messages).toHaveLength(0);
    expect(world.outbox).toHaveLength(0);
    expect(world.conversations.filter((c) => c.type === 'DIRECT')).toHaveLength(1);
  });

  it('invisible story (default friends pref, outsider) → 404 and no delivery attempt', async () => {
    const server = await asUser(OUTSIDER);
    const res = await reply(server, 'story-default');
    expect(res.statusCode).toBe(404);
    expect(world.messages).toHaveLength(0);
    const resCf = await reply(server, 'story-default-cf');
    expect(resCf.statusCode).toBe(404);
    expect(world.messages).toHaveLength(0);
  });

  it('replying to your own story → 400 and nothing stored', async () => {
    const server = await asUser(AUTHOR_DM);
    const res = await reply(server, 'story-dm');
    expect(res.statusCode).toBe(400);
    expect(world.messages).toHaveLength(0);
  });

  it('missing story → 404', async () => {
    const server = await asUser(REPLIER);
    const res = await reply(server, 'story-nope');
    expect(res.statusCode).toBe(404);
    expect(world.messages).toHaveLength(0);
  });

  it('empty reply body → 400 and nothing stored', async () => {
    const server = await asUser(REPLIER);
    const res = await reply(server, 'story-dm', '');
    expect(res.statusCode).toBe(400);
    expect(world.messages).toHaveLength(0);
  });

  it('unauthenticated → 401', async () => {
    const server = await asUser(null);
    const res = await reply(server, 'story-dm');
    expect(res.statusCode).toBe(401);
    expect(world.messages).toHaveLength(0);
  });
});
