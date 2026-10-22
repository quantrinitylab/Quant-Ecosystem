// ============================================================================
// QC-F-556 — story share / forward / link must EXIST, gated end to end
// ============================================================================
//
// Defect: a story was a closed-room announcement — backend stories routes
// were only feed/create/delete/view/viewers/reply. There was no way to
// send a story to a person or a group, no shareable link, and not even a
// gated single-story fetch (`GET /stories/:storyId` did not exist) for a
// card or link to resolve against.
//
// Fix (Slice-1): POST /stories/:storyId/share mints a REFERENCE card — an
// ordinary text Message whose serverMetadata.storyShare snapshot carries
// identity + type + expiry ONLY (never mediaUrl/text: a photo story's
// mediaUrl is an inline data: URL, i.e. the content itself — snapshotting
// it would bypass the audience gate for every member of the target
// conversation). GET /stories/:storyId serves the real story through the
// exact same loadFriendContext + canViewStory gate as feed/view/reply.
// `storyShare` joins RESERVED_METADATA_KEYS (QC-F-274) so clients cannot
// forge a card. Expired answers 404 (house pattern, QC-F-021/QC-F-299);
// share/get never record a view and never bump viewCount.
//
// These tests mount the REAL stories route plugin on a bare Fastify
// instance with an in-memory fake Prisma (stable module-level identities —
// no fresh-identity mocks). The gate/snapshot assertions FAIL against the
// pre-fix code (verified by negative control) and pass with the fix.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import storiesRoutes from '../routes/stories';
import { MessageService } from '../services/message.service';

// Stable identities (module-level).
const AUTHOR = { userId: 'user_author', username: 'author' };
const AUTHOR_CF = { userId: 'user_author_cf', username: 'authorcf' };
const SHARER = { userId: 'user_sharer', username: 'sharer' };
const CLOSE_FRIEND = { userId: 'user_close_friend', username: 'closefriend' };
const OUTSIDER = { userId: 'user_outsider', username: 'outsider' };
const GROUP_MEMBER = { userId: 'user_group_member', username: 'groupmember' };

function prefs(whoCanSeeStory: string, whoCanMessage: string) {
  return { chatSettings: { privacy: { whoCanSeeStory, whoCanMessage } } };
}

const HOUR = 60 * 60 * 1000;

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
    { id: AUTHOR.userId, displayName: 'Ann Author', avatarUrl: 'https://cdn.example/ann.png', preferences: prefs('everyone', 'everyone') },
    { id: AUTHOR_CF.userId, displayName: 'Cee Eff', avatarUrl: null, preferences: null },
    { id: SHARER.userId, displayName: 'Sharer', avatarUrl: null, preferences: null },
    { id: CLOSE_FRIEND.userId, displayName: 'Close Friend', avatarUrl: null, preferences: null },
    { id: OUTSIDER.userId, displayName: 'Outsider', avatarUrl: null, preferences: null },
    { id: GROUP_MEMBER.userId, displayName: 'Group Member', avatarUrl: null, preferences: null },
  ];
  const userById = new Map(users.map((u) => [u.id, u]));

  const now = Date.now();
  const stories = [
    {
      id: 'story-photo', userId: AUTHOR.userId, type: 'IMAGE',
      mediaUrl: 'data:image/jpeg;base64,PHOTOCONTENT', textContent: null,
      duration: 15, audience: 'ALL', viewCount: 3,
      createdAt: new Date(now - HOUR), expiresAt: new Date(now + HOUR),
    },
    {
      id: 'story-cf', userId: AUTHOR_CF.userId, type: 'TEXT',
      mediaUrl: null, textContent: 'secret cf text',
      duration: 15, audience: 'CLOSE_FRIENDS', viewCount: 0,
      createdAt: new Date(now - HOUR), expiresAt: new Date(now + HOUR),
    },
    {
      id: 'story-expired', userId: AUTHOR.userId, type: 'TEXT',
      mediaUrl: null, textContent: 'gone',
      duration: 15, audience: 'ALL', viewCount: 1,
      createdAt: new Date(now - 25 * HOUR), expiresAt: new Date(now - HOUR),
    },
  ];
  const storyById = new Map(stories.map((s) => [s.id, s]));

  // AUTHOR_CF listed CLOSE_FRIEND as a close friend (owner direction).
  const closeFriendEdges = [{ userId: AUTHOR_CF.userId, friendId: CLOSE_FRIEND.userId }];

  const conversations: ConversationRow[] = [
    { id: 'conv-dm', type: 'DIRECT' },
    { id: 'conv-group', type: 'GROUP' },
    { id: 'conv-other', type: 'DIRECT' },
  ];
  const members: MemberRow[] = [
    { conversationId: 'conv-dm', userId: AUTHOR.userId, leftAt: null },
    { conversationId: 'conv-dm', userId: SHARER.userId, leftAt: null },
    { conversationId: 'conv-group', userId: SHARER.userId, leftAt: null },
    { conversationId: 'conv-group', userId: CLOSE_FRIEND.userId, leftAt: null },
    { conversationId: 'conv-group', userId: GROUP_MEMBER.userId, leftAt: null },
    { conversationId: 'conv-other', userId: OUTSIDER.userId, leftAt: null },
    { conversationId: 'conv-other', userId: AUTHOR.userId, leftAt: null },
  ];

  const storyViews = [{ storyId: 'story-photo', viewerId: SHARER.userId }];
  const messages: MessageRow[] = [];
  const outbox: Array<{ conversationId: string; messageId: string; recipientIds: string[] }> = [];
  const streaks = new Map<string, Record<string, unknown>>();
  const storyUpdateCalls: string[] = [];

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
      const row: ConversationRow = { ...(data as ConversationRow), id: `conv_new_${conversations.length}` };
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

  const txClient = {
    conversation: conversationDelegate,
    conversationMember: conversationMemberDelegate,
    message: messageDelegate,
    messageOutbox: messageOutboxDelegate,
  };

  const prisma = {
    story: {
      async findUnique(args: { where: { id: string }; include?: unknown; select?: unknown }) {
        const row = storyById.get(args.where.id);
        if (!row) return null;
        if (args.include) {
          const u = userById.get(row.userId);
          return {
            ...row,
            user: { id: u?.id ?? row.userId, displayName: u?.displayName ?? 'Unknown', avatarUrl: u?.avatarUrl ?? null },
          };
        }
        return { ...row };
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        storyUpdateCalls.push(where.id);
        const row = storyById.get(where.id);
        if (row && data['viewCount'] && typeof data['viewCount'] === 'object') {
          row.viewCount += (data['viewCount'] as { increment: number }).increment;
        }
        return row;
      },
    },
    storyView: {
      async findUnique({ where }: { where: { storyId_viewerId: { storyId: string; viewerId: string } } }) {
        const key = where.storyId_viewerId;
        const row = storyViews.find((v) => v.storyId === key.storyId && v.viewerId === key.viewerId);
        return row ? { ...row } : null;
      },
      async create({ data }: { data: { storyId: string; viewerId: string } }) {
        storyViews.push({ ...data });
        return data;
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

  return { prisma, conversations, members, messages, outbox, storyViews, storyUpdateCalls, storyById };
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

describe('QC-F-556 story share + gated single-story fetch', () => {
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

  function share(server: FastifyInstance, storyId: string, conversationId: string) {
    return server.inject({
      method: 'POST',
      url: `/stories/${storyId}/share`,
      payload: { conversationId },
    });
  }

  function getStory(server: FastifyInstance, storyId: string) {
    return server.inject({ method: 'GET', url: `/stories/${storyId}` });
  }

  // ---- POST /stories/:storyId/share -------------------------------------

  it('S1: a viewer shares a photo story into a group — card snapshot carries identity/type/expiry and NO content', async () => {
    const server = await asUser(SHARER);
    const res = await share(server, 'story-photo', 'conv-group');
    expect(res.statusCode).toBe(201);
    expect(world.messages).toHaveLength(1);
    const stored = world.messages[0]!;
    expect(res.json()).toMatchObject({
      success: true,
      conversationId: 'conv-group',
      messageId: stored.id,
    });
    expect(stored.senderId).toBe(SHARER.userId);
    expect(stored.type).toBe('TEXT');
    const metadata = stored.metadata as { storyShare: Record<string, unknown> };
    expect(metadata.storyShare).toMatchObject({
      storyId: 'story-photo',
      authorId: AUTHOR.userId,
      authorName: 'Ann Author',
      authorAvatar: 'https://cdn.example/ann.png',
      storyType: 'photo',
      audience: 'ALL',
    });
    expect(typeof metadata.storyShare['expiresAt']).toBe('string');
    // The snapshot must NEVER carry content — the photo's mediaUrl IS the
    // content (inline data: URL), and text/thumbnail are content too.
    const snapshotJson = JSON.stringify(metadata.storyShare);
    expect(snapshotJson).not.toContain('PHOTOCONTENT');
    expect(snapshotJson).not.toContain('mediaUrl');
    expect(snapshotJson).not.toContain('secret cf text');
    // Sharing is not viewing: no StoryView row, no viewCount movement.
    expect(world.storyViews).toHaveLength(1);
    expect(world.storyById.get('story-photo')?.viewCount).toBe(3);
    expect(world.storyUpdateCalls).toHaveLength(0);
    // Delivery intent written for the other group members.
    expect(world.outbox).toHaveLength(1);
    expect(world.outbox[0]?.recipientIds.sort()).toEqual(
      [CLOSE_FRIEND.userId, GROUP_MEMBER.userId].sort(),
    );
  });

  it('S2: the author can share their own story into their DM', async () => {
    const server = await asUser(AUTHOR);
    const res = await share(server, 'story-photo', 'conv-dm');
    expect(res.statusCode).toBe(201);
    expect(world.messages).toHaveLength(1);
    expect(world.messages[0]?.senderId).toBe(AUTHOR.userId);
  });

  it('S3: a non-viewer cannot share a CLOSE_FRIENDS story (404, no message, no leak)', async () => {
    const server = await asUser(OUTSIDER);
    const res = await share(server, 'story-cf', 'conv-other');
    expect(res.statusCode).toBe(404);
    expect(world.messages).toHaveLength(0);
  });

  it('S4: a group co-member who cannot view the story cannot share it either (404)', async () => {
    // GROUP_MEMBER shares a group with the sharer, but has no close-friend
    // edge and no DIRECT with AUTHOR_CF — the story is invisible to them.
    const server = await asUser(GROUP_MEMBER);
    const res = await share(server, 'story-cf', 'conv-group');
    expect(res.statusCode).toBe(404);
    expect(world.messages).toHaveLength(0);
  });

  it('S5: a close friend CAN share the CLOSE_FRIENDS story; snapshot carries no story text', async () => {
    const server = await asUser(CLOSE_FRIEND);
    const res = await share(server, 'story-cf', 'conv-group');
    expect(res.statusCode).toBe(201);
    const metadata = world.messages[0]?.metadata as { storyShare: Record<string, unknown> };
    expect(metadata.storyShare).toMatchObject({ storyId: 'story-cf', storyType: 'text' });
    expect(JSON.stringify(metadata.storyShare)).not.toContain('secret cf text');
  });

  it('S6: sharing into a conversation the sharer is not a member of fails 403 NOT_A_MEMBER', async () => {
    const server = await asUser(SHARER);
    const res = await share(server, 'story-photo', 'conv-other');
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe('NOT_A_MEMBER');
    expect(world.messages).toHaveLength(0);
  });

  it('S7: an expired story cannot be shared — 404 for viewer and owner alike', async () => {
    const asSharer = await asUser(SHARER);
    expect((await share(asSharer, 'story-expired', 'conv-group')).statusCode).toBe(404);
    const asAuthor = await asUser(AUTHOR);
    expect((await share(asAuthor, 'story-expired', 'conv-dm')).statusCode).toBe(404);
    expect(world.messages).toHaveLength(0);
  });

  it('S8: sharing a missing story is 404; a missing conversationId is 400 (after the gate)', async () => {
    const server = await asUser(SHARER);
    expect((await share(server, 'story-nope', 'conv-group')).statusCode).toBe(404);
    const bad = await server.inject({
      method: 'POST',
      url: '/stories/story-photo/share',
      payload: {},
    });
    expect(bad.statusCode).toBe(400);
    expect(world.messages).toHaveLength(0);
  });

  it('S9: unauthenticated share/get are 401', async () => {
    const server = await asUser(null);
    expect((await share(server, 'story-photo', 'conv-group')).statusCode).toBe(401);
    expect((await getStory(server, 'story-photo')).statusCode).toBe(401);
  });

  // ---- GET /stories/:storyId ---------------------------------------------

  it('G1: a viewer fetches the real story (content included) through the gate — no view recorded', async () => {
    const server = await asUser(SHARER);
    const res = await getStory(server, 'story-photo');
    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; story: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.story).toMatchObject({
      id: 'story-photo',
      authorId: AUTHOR.userId,
      authorName: 'Ann Author',
      type: 'photo',
      mediaUrl: 'data:image/jpeg;base64,PHOTOCONTENT',
      viewCount: 3,
      isViewed: true,
    });
    // The gated fetch is side-effect free.
    expect(world.storyViews).toHaveLength(1);
    expect(world.storyById.get('story-photo')?.viewCount).toBe(3);
    expect(world.storyUpdateCalls).toHaveLength(0);
  });

  it('G2: holding the card grants nothing — a group member who cannot view the story gets 404', async () => {
    const server = await asUser(GROUP_MEMBER);
    const res = await getStory(server, 'story-cf');
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toContain('secret cf text');
  });

  it('G3: an outsider gets 404 for a CLOSE_FRIENDS story and for a missing story alike', async () => {
    const server = await asUser(OUTSIDER);
    expect((await getStory(server, 'story-cf')).statusCode).toBe(404);
    expect((await getStory(server, 'story-nope')).statusCode).toBe(404);
  });

  it('G4: expired story — 404 for a non-owner, still resolvable by its owner', async () => {
    const asSharer = await asUser(SHARER);
    expect((await getStory(asSharer, 'story-expired')).statusCode).toBe(404);
    const asAuthor = await asUser(AUTHOR);
    const res = await getStory(asAuthor, 'story-expired');
    expect(res.statusCode).toBe(200);
    expect((res.json() as { story: { id: string } }).story.id).toBe('story-expired');
  });

  it('G5: a close friend fetches the CLOSE_FRIENDS story with its text', async () => {
    const server = await asUser(CLOSE_FRIEND);
    const res = await getStory(server, 'story-cf');
    expect(res.statusCode).toBe(200);
    expect((res.json() as { story: { text?: string } }).story.text).toBe('secret cf text');
  });

  // ---- Forgery pin (QC-F-274 extension) -----------------------------------

  it('F1: a client cannot forge a storyShare card through ordinary message metadata', async () => {
    const service = new MessageService(world.prisma as never);
    const message = await service.sendMessage({
      conversationId: 'conv-group',
      senderId: SHARER.userId,
      content: 'look at this totally real card',
      type: 'text',
      metadata: {
        storyShare: {
          storyId: 'story-cf',
          authorId: AUTHOR_CF.userId,
          authorName: 'Cee Eff',
          storyType: 'text',
          expiresAt: new Date(Date.now() + HOUR).toISOString(),
        },
      },
    });
    const stored = world.messages.find((m) => m.id === (message as { id: string }).id);
    expect(stored).toBeDefined();
    expect((stored?.metadata as Record<string, unknown>)['storyShare']).toBeUndefined();
  });
});
