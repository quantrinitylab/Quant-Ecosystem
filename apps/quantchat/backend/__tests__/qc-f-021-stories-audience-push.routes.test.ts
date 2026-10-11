// ===========================================================================
// QC-F-021 — stories audience BOLA + push-notification abuse regression tests
// ===========================================================================
//
// Two defects, one finding:
//  (a) Stories had NO audience: GET /stories/feed returned every non-expired
//      story to every logged-in user, ignoring both the per-story
//      `audience: 'CLOSE_FRIENDS'` stored at create time and the author's
//      `whoCanSeeStory` privacy preference (default 'friends'). The view and
//      reply endpoints had no check either — a stranger could view (bumping
//      viewCount) and reply to a CLOSE_FRIENDS story.
//  (b) POST /notifications/send trusted a body-supplied `userId`: any
//      logged-in user could push arbitrary notifications to any other user,
//      and at route level a body userId even bypassed the auth requirement.
//
// Fix: stories feed/view/reply share one gate — per-story audience AND
// per-author pref (QC-F-042 §3.3a); invisible stories answer 404 so their
// existence is not leaked. "Friend" (v1) = author listed the viewer as a
// close friend OR they share an active DIRECT conversation. Notifications
// send now takes identity only from verified auth: target must be the
// caller (cross-user server dispatches are in-process, never this route).
//
// These tests mount the REAL route plugins on a bare Fastify instance. A
// preHandler hook installs `request.auth` exactly the way the real auth
// plugin does; a minimal error handler mirrors the server-core AppError
// mapping. Only Prisma is an in-memory fake with stable identities
// (module-level — no fresh-identity mocks).
//
// Every authorization test FAILS against the pre-fix code (verified by
// negative control) and passes with the fix.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import storiesRoutes from '../routes/stories';
import notificationsRoutes from '../routes/notifications';

// Stable identities (module-level).
const AUTHOR_EVERYONE = { userId: 'user_author_everyone', username: 'everyone' };
const AUTHOR_DEFAULT = { userId: 'user_author_default', username: 'defauthor' };
const AUTHOR_FRIENDS = { userId: 'user_author_friends', username: 'frauthor' };
const STRANGER = { userId: 'user_stranger', username: 'stranger' };
const CLOSE_FRIEND = { userId: 'user_close_friend', username: 'closefriend' };
const CHAT_PARTNER = { userId: 'user_chat_partner', username: 'chatpartner' };
const GROUP_ONLY = { userId: 'user_group_only', username: 'grouponly' };
const VICTIM = { userId: 'user_push_victim', username: 'victim' };
const ATTACKER = { userId: 'user_push_attacker', username: 'attacker' };

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const NOW = new Date();

function prefsWith(whoCanSeeStory: string) {
  return { chatSettings: { privacy: { whoCanSeeStory } } };
}

interface StoryRow {
  id: string;
  userId: string;
  audience: string;
  viewCount: number;
}

function makeStoriesFakePrisma() {
  const users = [
    { id: AUTHOR_EVERYONE.userId, displayName: 'Everyone A', avatarUrl: null, preferences: prefsWith('everyone') },
    { id: AUTHOR_DEFAULT.userId, displayName: 'Default A', avatarUrl: null, preferences: null },
    { id: AUTHOR_FRIENDS.userId, displayName: 'Friends A', avatarUrl: null, preferences: prefsWith('friends') },
    { id: STRANGER.userId, displayName: 'Stranger', avatarUrl: null, preferences: null },
    { id: CLOSE_FRIEND.userId, displayName: 'Close Friend', avatarUrl: null, preferences: null },
    { id: CHAT_PARTNER.userId, displayName: 'Chat Partner', avatarUrl: null, preferences: null },
    { id: GROUP_ONLY.userId, displayName: 'Group Only', avatarUrl: null, preferences: null },
  ];
  const userById = new Map(users.map((u) => [u.id, u]));

  const stories: StoryRow[] = [
    { id: 'story-everyone-all', userId: AUTHOR_EVERYONE.userId, audience: 'ALL', viewCount: 0 },
    { id: 'story-default-all', userId: AUTHOR_DEFAULT.userId, audience: 'ALL', viewCount: 0 },
    { id: 'story-default-cf', userId: AUTHOR_DEFAULT.userId, audience: 'CLOSE_FRIENDS', viewCount: 0 },
    { id: 'story-friends-all', userId: AUTHOR_FRIENDS.userId, audience: 'ALL', viewCount: 0 },
  ];
  const storyById = new Map(stories.map((s) => [s.id, s]));

  // AUTHOR_DEFAULT listed CLOSE_FRIEND as a close friend (owner direction).
  const closeFriendEdges = [{ userId: AUTHOR_DEFAULT.userId, friendId: CLOSE_FRIEND.userId }];

  // CHAT_PARTNER shares a DIRECT conversation with AUTHOR_DEFAULT.
  // GROUP_ONLY shares only a GROUP conversation with AUTHOR_FRIENDS.
  const conversations = [
    { id: 'conv-dm', type: 'DIRECT' },
    { id: 'conv-group', type: 'GROUP' },
  ];
  const members = [
    { conversationId: 'conv-dm', userId: AUTHOR_DEFAULT.userId, leftAt: null },
    { conversationId: 'conv-dm', userId: CHAT_PARTNER.userId, leftAt: null },
    { conversationId: 'conv-group', userId: AUTHOR_FRIENDS.userId, leftAt: null },
    { conversationId: 'conv-group', userId: GROUP_ONLY.userId, leftAt: null },
  ];

  const views: Array<{ storyId: string; viewerId: string }> = [];

  const prisma = {
    story: {
      async findMany() {
        return stories.map((s) => {
          const author = userById.get(s.userId)!;
          return {
            id: s.id,
            userId: s.userId,
            type: 'TEXT' as const,
            mediaUrl: null,
            textContent: 'hello',
            duration: 15,
            viewCount: s.viewCount,
            audience: s.audience,
            createdAt: NOW,
            expiresAt: FUTURE,
            user: { id: author.id, displayName: author.displayName, avatarUrl: author.avatarUrl },
          };
        });
      },
      async findUnique({ where }: any) {
        const row = storyById.get(where.id);
        return row ? { ...row } : null;
      },
      async update({ where, data }: any) {
        const row = storyById.get(where.id)!;
        if (data.viewCount?.increment) row.viewCount += data.viewCount.increment;
        return { ...row };
      },
    },
    storyView: {
      async findMany({ where }: any) {
        return views.filter((v) => v.viewerId === where.viewerId).map((v) => ({ storyId: v.storyId }));
      },
      async findUnique({ where }: any) {
        const key = where.storyId_viewerId;
        return views.find((v) => v.storyId === key.storyId && v.viewerId === key.viewerId) ?? null;
      },
      async create({ data }: any) {
        views.push({ storyId: data.storyId, viewerId: data.viewerId });
        return data;
      },
      async deleteMany() {
        return { count: 0 };
      },
    },
    closeFriend: {
      async findMany({ where }: any) {
        return closeFriendEdges
          .filter((e) => where.userId.in.includes(e.userId) && e.friendId === where.friendId)
          .map((e) => ({ userId: e.userId }));
      },
    },
    user: {
      async findMany({ where }: any) {
        return users
          .filter((u) => where.id.in.includes(u.id))
          .map((u) => ({ id: u.id, preferences: u.preferences }));
      },
    },
    conversationMember: {
      async findMany({ where }: any) {
        if (typeof where.userId === 'string') {
          return members
            .filter((m) => m.userId === where.userId && m.leftAt === where.leftAt)
            .map((m) => ({ conversationId: m.conversationId }));
        }
        return members
          .filter(
            (m) =>
              where.conversationId.in.includes(m.conversationId) &&
              where.userId.in.includes(m.userId) &&
              m.leftAt === where.leftAt,
          )
          .map((m) => ({ conversationId: m.conversationId, userId: m.userId }));
      },
    },
    conversation: {
      async findMany({ where }: any) {
        return conversations
          .filter((c) => where.id.in.includes(c.id) && c.type === where.type)
          .map((c) => ({ id: c.id }));
      },
    },
  };

  return { prisma, storyById, views };
}

async function buildRouteApp(
  auth: { userId: string; username: string } | null,
  prisma: unknown,
  register: (app: FastifyInstance) => Promise<void>,
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
  await register(app);
  await app.ready();
  return app;
}

describe('QC-F-021 stories audience gate', () => {
  let fake: ReturnType<typeof makeStoriesFakePrisma>;
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    fake = makeStoriesFakePrisma();
    app = null;
  });
  afterEach(async () => {
    if (app) await app.close();
  });

  async function asStories(auth: { userId: string; username: string } | null) {
    app = await buildRouteApp(auth, fake.prisma, async (a) => {
      await a.register(storiesRoutes, { prefix: '/stories' });
    });
    return app;
  }

  async function feedStoryIds(auth: { userId: string; username: string }) {
    const server = await asStories(auth);
    const res = await server.inject({ method: 'GET', url: '/stories/feed' });
    expect(res.statusCode).toBe(200);
    const groups = res.json().groups as Array<{ stories: Array<{ id: string }> }>;
    return groups.flatMap((g) => g.stories.map((s) => s.id));
  }

  it('feed: a stranger sees only the everyone-pref author ALL story', async () => {
    const ids = await feedStoryIds(STRANGER);
    expect(ids).toEqual(['story-everyone-all']);
  });

  it('feed: a close friend sees the default author ALL + CLOSE_FRIENDS stories', async () => {
    const ids = await feedStoryIds(CLOSE_FRIEND);
    expect(ids).toContain('story-default-all');
    expect(ids).toContain('story-default-cf');
    expect(ids).toContain('story-everyone-all');
    // Not related to AUTHOR_FRIENDS, whose pref is 'friends'.
    expect(ids).not.toContain('story-friends-all');
  });

  it('feed: a direct-chat partner sees ALL but NOT CLOSE_FRIENDS of that author', async () => {
    const ids = await feedStoryIds(CHAT_PARTNER);
    expect(ids).toContain('story-default-all');
    expect(ids).not.toContain('story-default-cf');
  });

  it('feed: sharing only a GROUP conversation does not count as friend', async () => {
    const ids = await feedStoryIds(GROUP_ONLY);
    expect(ids).not.toContain('story-friends-all');
    expect(ids).toContain('story-everyone-all');
  });

  it('feed: the owner sees all of their own stories including CLOSE_FRIENDS', async () => {
    const ids = await feedStoryIds(AUTHOR_DEFAULT);
    expect(ids).toContain('story-default-all');
    expect(ids).toContain('story-default-cf');
  });

  it('view: a stranger viewing a CLOSE_FRIENDS story gets 404 and no view is recorded', async () => {
    const server = await asStories(STRANGER);
    const res = await server.inject({ method: 'POST', url: '/stories/story-default-cf/view', payload: {} });
    expect(res.statusCode).toBe(404);
    expect(fake.storyById.get('story-default-cf')!.viewCount).toBe(0);
    expect(fake.views).toHaveLength(0);
  });

  it('view: a stranger viewing a friends-pref author ALL story gets 404', async () => {
    const server = await asStories(STRANGER);
    const res = await server.inject({ method: 'POST', url: '/stories/story-default-all/view', payload: {} });
    expect(res.statusCode).toBe(404);
    expect(fake.storyById.get('story-default-all')!.viewCount).toBe(0);
  });

  it('view: a close friend can view a CLOSE_FRIENDS story and the view is recorded', async () => {
    const server = await asStories(CLOSE_FRIEND);
    const res = await server.inject({ method: 'POST', url: '/stories/story-default-cf/view', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, viewCount: 1 });
    expect(fake.views).toHaveLength(1);
  });

  it('reply: a stranger replying to an invisible story gets 404', async () => {
    const server = await asStories(STRANGER);
    const res = await server.inject({
      method: 'POST',
      url: '/stories/story-default-all/reply',
      payload: { message: 'nice' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('reply: a close friend can reply to a visible story', async () => {
    const server = await asStories(CLOSE_FRIEND);
    const res = await server.inject({
      method: 'POST',
      url: '/stories/story-default-cf/reply',
      payload: { message: 'nice' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true });
  });

  it('feed: unauthenticated request is rejected 401', async () => {
    const server = await asStories(null);
    const res = await server.inject({ method: 'GET', url: '/stories/feed' });
    expect(res.statusCode).toBe(401);
  });
});

describe('QC-F-021 push notification target gate', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  async function asNotifications(auth: { userId: string; username: string } | null) {
    app = await buildRouteApp(auth, {}, async (a) => {
      await a.register(notificationsRoutes, { prefix: '/notifications' });
    });
    return app;
  }

  const sendPayload = (extra: Record<string, unknown> = {}) => ({
    category: 'MESSAGES',
    title: 'hello',
    body: 'world',
    ...extra,
  });

  it('send: unauthenticated request with a body userId is rejected 401 (no auth bypass)', async () => {
    const server = await asNotifications(null);
    const res = await server.inject({
      method: 'POST',
      url: '/notifications/send',
      payload: sendPayload({ userId: VICTIM.userId }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('send: an attacker cannot push to another user (403 FORBIDDEN)', async () => {
    const server = await asNotifications(ATTACKER);
    const res = await server.inject({
      method: 'POST',
      url: '/notifications/send',
      payload: sendPayload({ userId: VICTIM.userId }),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('send: self-send without a userId reaches the delivery stage (no subscriptions)', async () => {
    const server = await asNotifications(VICTIM);
    const res = await server.inject({
      method: 'POST',
      url: '/notifications/send',
      payload: sendPayload(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { reason: 'no-subscriptions' } });
  });

  it('send: self-send with an explicit own userId is allowed', async () => {
    const server = await asNotifications(VICTIM);
    const res = await server.inject({
      method: 'POST',
      url: '/notifications/send',
      payload: sendPayload({ userId: VICTIM.userId }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true });
  });

  it('subscribe: a user can still register their own subscription (control)', async () => {
    const server = await asNotifications(VICTIM);
    const res = await server.inject({
      method: 'POST',
      url: '/notifications/subscribe',
      payload: {
        subscription: {
          endpoint: 'https://push.example/qc-f-021-victim',
          keys: { p256dh: 'key-p', auth: 'key-a' },
        },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ success: true });
  });
});
