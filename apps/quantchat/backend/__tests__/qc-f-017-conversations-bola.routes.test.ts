// ===========================================================================
// QC-F-017 — conversations BOLA / group-takeover regression tests
// ===========================================================================
//
// GET/PUT /conversations/:id, POST/DELETE /conversations/:id/members (and the
// folded POST /conversations/:id/theme, GET /conversations/:id/theme and
// POST /conversations/:id/disappear-timer) previously never received the
// requester's identity: the route handlers did not even read `request.auth`,
// and the service methods had no requester parameter at all. Any logged-in
// user could therefore read any conversation, rename any group, kick any
// member, and — via DELETE member + POST member with `role: 'ADMIN'` —
// promote themselves to ADMIN of a group they did not belong to (full group
// takeover).
//
// These tests mount the REAL route plugins on a bare Fastify instance. A
// preHandler hook installs `request.auth` exactly the way the real auth
// plugin does (packages/server-core/src/plugins/auth.ts); a minimal error
// handler mirrors the server-core AppError mapping. The services are the
// real ones; only Prisma is an in-memory fake with stable identities.
//
// Every authorization test FAILS against the pre-fix code (verified by
// negative control) and passes with the fix.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// The services only need the Prisma enum *values* at runtime; stub them the
// same way conversation.service.test.ts does (values match the schema).
vi.mock('@prisma/client', () => ({
  Prisma: {},
  // @quant/database (pulled in transitively via @quant/server-core) only
  // constructs a client at import time; it is never used by these routes.
  PrismaClient: class {
    constructor(..._args: unknown[]) {}
  },
  ConversationType: { DIRECT: 'DIRECT', GROUP: 'GROUP', CHANNEL: 'CHANNEL' },
  ConversationRole: { OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
  MessageType: { SYSTEM: 'SYSTEM', TEXT: 'TEXT' },
}));

import conversationsRoutes from '../routes/conversations';
import themesRoutes from '../routes/themes';
import ephemeralRoutes from '../routes/ephemeral';

// Stable identities (module-level — no fresh-identity mocks).
const OWNER = { userId: 'user_owner', username: 'owner' };
const MEMBER = { userId: 'user_member', username: 'member' };
const OUTSIDER = { userId: 'user_outsider', username: 'outsider' };
const NEWCOMER_ID = 'user_newcomer';

interface MemberRow {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  leftAt: Date | null;
  joinedAt: Date;
  nickname: string | null;
  isMuted: boolean;
  lastReadAt: Date | null;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
}

function userStub(userId: string) {
  return { id: userId, username: userId, displayName: userId, avatarUrl: null };
}

function makeFakePrisma() {
  const conversation: Record<string, unknown> = {
    id: 'conv-1',
    type: 'GROUP',
    name: 'Team Chat',
    description: 'original description',
    themeId: 'quantum-void',
    disappearTimer: null,
    createdBy: OWNER.userId,
    lastMessageAt: new Date(),
    metadata: {},
  };

  const members: MemberRow[] = [
    {
      id: 'member-owner',
      conversationId: 'conv-1',
      userId: OWNER.userId,
      role: 'OWNER',
      leftAt: null,
      joinedAt: new Date(),
      nickname: null,
      isMuted: false,
      lastReadAt: null,
      user: userStub(OWNER.userId),
    },
    {
      id: 'member-member',
      conversationId: 'conv-1',
      userId: MEMBER.userId,
      role: 'MEMBER',
      leftAt: null,
      joinedAt: new Date(),
      nickname: null,
      isMuted: false,
      lastReadAt: null,
      user: userStub(MEMBER.userId),
    },
  ];

  const activeMembers = () => members.filter((m) => m.leftAt === null);

  const prisma = {
    conversation: {
      async findUnique({ where }: any) {
        if (where.id !== conversation.id) return null;
        return { ...conversation, members: activeMembers() };
      },
      async update({ data }: any) {
        Object.assign(conversation, data);
        return { ...conversation };
      },
    },
    conversationMember: {
      async findFirst({ where }: any) {
        return (
          members.find(
            (m) =>
              m.conversationId === where.conversationId &&
              m.userId === where.userId &&
              (where.leftAt === undefined || m.leftAt === where.leftAt),
          ) ?? null
        );
      },
      async findMany({ where }: any) {
        return members
          .filter((m) => m.userId === where.userId && m.leftAt === null)
          .map((m) => ({
            ...m,
            conversation: { ...conversation, members: activeMembers() },
          }));
      },
      async count({ where }: any) {
        return members.filter((m) => m.userId === where.userId && m.leftAt === null).length;
      },
      async create({ data }: any) {
        const row: MemberRow = {
          id: `member-${data.userId}`,
          conversationId: data.conversationId,
          userId: data.userId,
          role: data.role,
          leftAt: null,
          joinedAt: data.joinedAt ?? new Date(),
          nickname: data.nickname ?? null,
          isMuted: data.isMuted ?? false,
          lastReadAt: data.lastReadAt ?? null,
          user: userStub(data.userId),
        };
        members.push(row);
        return row;
      },
      async update({ where, data }: any) {
        const row = members.find((m) => m.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
      // QC-F-518 fixture support: addMember revives a left member row in
      // place (updateMany on conversationId+userId) before creating one.
      async updateMany({ where, data }: any) {
        const row = members.find(
          (m) => m.conversationId === where.conversationId && m.userId === where.userId,
        );
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    chatTheme: {
      async findMany() {
        return [];
      },
    },
  };

  return { prisma, conversation, members };
}

async function buildRouteApp(
  auth: { userId: string; username: string } | null,
  prisma: unknown,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Mirror of server-core error-handler's AppError branch.
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
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate('prisma', prisma);
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
  await app.register(conversationsRoutes, { prefix: '/conversations' });
  await app.register(themesRoutes, { prefix: '/conversations' });
  await app.register(ephemeralRoutes, { prefix: '/conversations' });
  await app.ready();
  return app;
}

describe('QC-F-017 conversations BOLA', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    fake = makeFakePrisma();
    app = null;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  async function as(auth: { userId: string; username: string } | null) {
    app = await buildRouteApp(auth, fake.prisma);
    return app;
  }

  it('rejects unauthenticated GET /conversations/:id with 401', async () => {
    const server = await as(null);
    const res = await server.inject({ method: 'GET', url: '/conversations/conv-1' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects unauthenticated PUT /conversations/:id with 401', async () => {
    const server = await as(null);
    const res = await server.inject({
      method: 'PUT',
      url: '/conversations/conv-1',
      payload: { name: 'Pwned' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('member can read the conversation (200, participants included)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({ method: 'GET', url: '/conversations/conv-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.name).toBe('Team Chat');
    expect(body.data.participants).toHaveLength(2);
  });

  it('non-member cannot read the conversation (403 NOT_A_MEMBER)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({ method: 'GET', url: '/conversations/conv-1' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
  });

  it('non-member cannot rename the group (403)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({
      method: 'PUT',
      url: '/conversations/conv-1',
      payload: { name: 'Pwned' },
    });
    expect(res.statusCode).toBe(403);
    expect(fake.conversation.name).toBe('Team Chat');
  });

  it('plain member cannot rename the group (403 NOT_CONVERSATION_ADMIN)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'PUT',
      url: '/conversations/conv-1',
      payload: { name: 'Renamed by member' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_CONVERSATION_ADMIN');
    expect(fake.conversation.name).toBe('Team Chat');
  });

  it('owner can rename the group (200)', async () => {
    const server = await as(OWNER);
    const res = await server.inject({
      method: 'PUT',
      url: '/conversations/conv-1',
      payload: { name: 'New Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(fake.conversation.name).toBe('New Name');
  });

  it('TAKEOVER: outsider cannot add themselves as ADMIN (403 NOT_A_MEMBER)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/conv-1/members',
      payload: { userId: OUTSIDER.userId, role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(fake.members.some((m) => m.userId === OUTSIDER.userId)).toBe(false);
  });

  it('TAKEOVER: plain member cannot promote themselves to ADMIN (403 NOT_CONVERSATION_ADMIN)', async () => {
    const server = await as(MEMBER);
    // The old bypass: DELETE self, then POST self back with role ADMIN.
    // The role-assignment step must now fail even in isolation (the role
    // gate fires before the already-member check).
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/conv-1/members',
      payload: { userId: MEMBER.userId, role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_CONVERSATION_ADMIN');
    expect(fake.members.find((m) => m.userId === MEMBER.userId)?.role).toBe('MEMBER');
  });

  it('plain member cannot assign ADMIN role to anyone else (403)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/conv-1/members',
      payload: { userId: NEWCOMER_ID, role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_CONVERSATION_ADMIN');
    expect(fake.members.some((m) => m.userId === NEWCOMER_ID)).toBe(false);
  });

  it('plain member can invite a new member with default MEMBER role (201)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/conv-1/members',
      payload: { userId: NEWCOMER_ID },
    });
    expect(res.statusCode).toBe(201);
    const added = fake.members.find((m) => m.userId === NEWCOMER_ID);
    expect(added?.role).toBe('MEMBER');
  });

  it('owner can add a member with ADMIN role (201)', async () => {
    const server = await as(OWNER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/conv-1/members',
      payload: { userId: NEWCOMER_ID, role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(201);
    const added = fake.members.find((m) => m.userId === NEWCOMER_ID);
    expect(added?.role).toBe('ADMIN');
  });

  it('plain member cannot kick another member (403 NOT_CONVERSATION_ADMIN)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'DELETE',
      url: `/conversations/conv-1/members/${OWNER.userId}`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_CONVERSATION_ADMIN');
    expect(fake.members.find((m) => m.userId === OWNER.userId)?.leftAt).toBeNull();
  });

  it('outsider cannot kick a member (403)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({
      method: 'DELETE',
      url: `/conversations/conv-1/members/${MEMBER.userId}`,
    });
    expect(res.statusCode).toBe(403);
    expect(fake.members.find((m) => m.userId === MEMBER.userId)?.leftAt).toBeNull();
  });

  it('owner can kick a member (200)', async () => {
    const server = await as(OWNER);
    const res = await server.inject({
      method: 'DELETE',
      url: `/conversations/conv-1/members/${MEMBER.userId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(fake.members.find((m) => m.userId === MEMBER.userId)?.leftAt).toBeInstanceOf(Date);
  });

  it('member can leave the conversation themselves (200)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'DELETE',
      url: `/conversations/conv-1/members/${MEMBER.userId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(fake.members.find((m) => m.userId === MEMBER.userId)?.leftAt).toBeInstanceOf(Date);
  });

  it('removed member loses read access (403 after leaving)', async () => {
    const server = await as(MEMBER);
    const leave = await server.inject({
      method: 'DELETE',
      url: `/conversations/conv-1/members/${MEMBER.userId}`,
    });
    expect(leave.statusCode).toBe(200);
    const res = await server.inject({ method: 'GET', url: '/conversations/conv-1' });
    expect(res.statusCode).toBe(403);
  });

  it('folded: non-member cannot set the conversation theme (403)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/conv-1/theme',
      payload: { themeId: 'nebula' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(fake.conversation.themeId).toBe('quantum-void');
  });

  it('folded: member can set the conversation theme (200)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/conv-1/theme',
      payload: { themeId: 'nebula' },
    });
    expect(res.statusCode).toBe(200);
    expect(fake.conversation.themeId).toBe('nebula');
  });

  it('folded: non-member cannot read the conversation theme (403)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({ method: 'GET', url: '/conversations/conv-1/theme' });
    expect(res.statusCode).toBe(403);
  });

  it('folded: non-member cannot set the disappear timer (403)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/conv-1/disappear-timer',
      payload: { seconds: 30 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(fake.conversation.disappearTimer).toBeNull();
  });

  it('folded: member can set the disappear timer (200)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/conv-1/disappear-timer',
      payload: { seconds: 30 },
    });
    expect(res.statusCode).toBe(200);
    expect(fake.conversation.disappearTimer).toBe(30);
  });
});
