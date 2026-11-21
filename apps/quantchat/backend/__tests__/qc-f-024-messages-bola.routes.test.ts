// ===========================================================================
// QC-F-024 — messages-list BOLA / IDOR regression tests
// ===========================================================================
//
// GET /conversations/:id/messages previously never received the requester's
// identity: the route handler did not even read `request.auth`, and
// MessageService.getMessages had no userId parameter at all. Any logged-in
// user could therefore paginate through the full message history (content
// AND total count) of any conversation — DM or group — without being a
// member.
//
// These tests mount the REAL messages route plugin on a bare Fastify
// instance. A preHandler hook installs `request.auth` exactly the way the
// real auth plugin does (packages/server-core/src/plugins/auth.ts); a
// minimal error handler mirrors the server-core AppError mapping. The
// service is the real one; only Prisma is an in-memory fake with stable
// identities (module-level — no fresh-identity mocks).
//
// Every authorization test FAILS against the pre-fix code (verified by
// negative control) and passes with the fix.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import messagesRoutes from '../routes/messages';

// Stable identities (module-level).
const MEMBER = { userId: 'user_member', username: 'member' };
const OUTSIDER = { userId: 'user_outsider', username: 'outsider' };
const REMOVED = { userId: 'user_removed', username: 'removed' };

interface MemberRow {
  conversationId: string;
  userId: string;
  leftAt: Date | null;
}

function makeFakePrisma() {
  const members: MemberRow[] = [
    { conversationId: 'conv-1', userId: MEMBER.userId, leftAt: null },
    { conversationId: 'conv-1', userId: REMOVED.userId, leftAt: new Date() },
  ];
  const messages = [
    { id: 'msg-2', conversationId: 'conv-1', content: 'second', isDeleted: false },
    { id: 'msg-1', conversationId: 'conv-1', content: 'first', isDeleted: false },
  ];

  const calls = { findMany: 0, count: 0 };

  const prisma = {
    // QC-F-518 fixture support: getMessages reads the conversation row
    // (type + historyVisibility) to apply the joinedAt history cutoff.
    // This suite's conversation is a visible group — no cutoff.
    conversation: {
      async findUnique({ where }: any) {
        return where.id === 'conv-1'
          ? { id: 'conv-1', type: 'GROUP', historyVisibility: 'VISIBLE' }
          : null;
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
    },
    message: {
      async findMany({ where, skip, take }: any) {
        calls.findMany += 1;
        const rows = messages.filter(
          (m) => m.conversationId === where.conversationId && m.isDeleted === where.isDeleted,
        );
        return rows.slice(skip, skip + take);
      },
      async count({ where }: any) {
        calls.count += 1;
        return messages.filter(
          (m) => m.conversationId === where.conversationId && m.isDeleted === where.isDeleted,
        ).length;
      },
    },
  };

  return { prisma, calls };
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
  await app.register(messagesRoutes, { prefix: '/conversations' });
  await app.ready();
  return app;
}

describe('QC-F-024 messages-list BOLA', () => {
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

  it('rejects unauthenticated GET /conversations/:id/messages with 401', async () => {
    const server = await as(null);
    const res = await server.inject({ method: 'GET', url: '/conversations/conv-1/messages' });
    expect(res.statusCode).toBe(401);
    expect(fake.calls.findMany).toBe(0);
    expect(fake.calls.count).toBe(0);
  });

  it('member can list messages (200 with paginated data)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({ method: 'GET', url: '/conversations/conv-1/messages' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(2);
    expect(body.data.data).toHaveLength(2);
  });

  it('non-member cannot list messages (403 NOT_A_MEMBER, no content or count leak)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({ method: 'GET', url: '/conversations/conv-1/messages' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(fake.calls.findMany).toBe(0);
    expect(fake.calls.count).toBe(0);
  });

  it('removed member cannot list messages (403)', async () => {
    const server = await as(REMOVED);
    const res = await server.inject({ method: 'GET', url: '/conversations/conv-1/messages' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
  });

  it('non-member on a nonexistent conversation also gets 403 (no existence oracle)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({
      method: 'GET',
      url: '/conversations/conv-does-not-exist/messages',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
  });

  it('member identity in the query string is ignored (auth identity wins)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({
      method: 'GET',
      url: `/conversations/conv-1/messages?userId=${MEMBER.userId}`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
  });
});
