// ===========================================================================
// QC-F-038 — ephemeral BOLA regression tests (/view + /screenshot)
// ===========================================================================
//
// POST /conversations/messages/:messageId/view extracted the caller's userId
// only for the 401 check and never passed it to the service:
// DisappearingService.markViewedAndScheduleDeletion had no requester
// parameter, no membership check, and no timer validation (schema was
// min(1) with NO max) — any logged-in user who learned a messageId could
// start a 1-second destruction timer on anyone's message.
// POST /conversations/messages/:messageId/screenshot had no membership check
// either, and the system message's displayed name came from the request BODY
// (`viewerName`), so anyone could inject a forged "<anyone> took a
// screenshot" SYSTEM message into any conversation.
//
// These tests mount the REAL ephemeral route plugin on a bare Fastify
// instance. A preHandler hook installs `request.auth` exactly the way the
// real auth plugin does; a minimal error handler mirrors the server-core
// AppError mapping. The service is the real one; only Prisma is an
// in-memory fake with stable identities.
//
// Every authorization test FAILS against the pre-fix code (verified by
// negative control) and passes with the fix.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// The service only needs the Prisma enum *values* at runtime; stub them the
// same way qc-f-017-conversations-bola.routes.test.ts does.
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

import ephemeralRoutes from '../routes/ephemeral';

// Stable identities (module-level — no fresh-identity mocks).
const SENDER = { userId: 'user_sender', username: 'sender' };
const MEMBER = { userId: 'user_member', username: 'riya' };
const OUTSIDER = { userId: 'user_outsider', username: 'mallory' };
const REMOVED = { userId: 'user_removed', username: 'exmember' };

function makeFakePrisma() {
  const message: Record<string, unknown> = {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: SENDER.userId,
    type: 'TEXT',
    content: 'secret snap text',
    metadata: {},
    expiresAt: null,
    isDeleted: false,
  };

  const memberRows = [
    { id: 'cm-sender', conversationId: 'conv-1', userId: SENDER.userId, leftAt: null as Date | null },
    { id: 'cm-member', conversationId: 'conv-1', userId: MEMBER.userId, leftAt: null as Date | null },
    {
      id: 'cm-removed',
      conversationId: 'conv-1',
      userId: REMOVED.userId,
      leftAt: new Date('2026-01-01T00:00:00Z'),
    },
  ];

  const createdMessages: Record<string, unknown>[] = [];
  const updateCalls: Record<string, unknown>[] = [];

  const prisma = {
    message: {
      async findUnique({ where }: any) {
        if (where.id !== message.id) return null;
        return message;
      },
      async update({ where, data }: any) {
        updateCalls.push({ where, data });
        Object.assign(message, data);
        return message;
      },
      async create({ data }: any) {
        const row = { id: `sys-${createdMessages.length + 1}`, ...data };
        createdMessages.push(row);
        return row;
      },
    },
    conversationMember: {
      async findFirst({ where }: any) {
        const row = memberRows.find(
          (m) =>
            m.conversationId === where.conversationId &&
            m.userId === where.userId &&
            (where.leftAt === null ? m.leftAt === null : true),
        );
        return row ?? null;
      },
    },
  };

  return { prisma, message, createdMessages, updateCalls };
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
  await app.register(ephemeralRoutes, { prefix: '/conversations' });
  await app.ready();
  return app;
}

describe('QC-F-038 ephemeral BOLA (view + screenshot)', () => {
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

  const viewUrl = '/conversations/messages/msg-1/view';
  const screenshotUrl = '/conversations/messages/msg-1/screenshot';

  it('rejects unauthenticated /view with 401', async () => {
    const server = await as(null);
    const res = await server.inject({
      method: 'POST',
      url: viewUrl,
      payload: { timerSeconds: 5 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects unauthenticated /screenshot with 401', async () => {
    const server = await as(null);
    const res = await server.inject({ method: 'POST', url: screenshotUrl, payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('member can mark viewed with a preset timer (200, expiresAt = viewedAt + 5s)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'POST',
      url: viewUrl,
      payload: { timerSeconds: 5 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    const viewedAt = Date.parse(body.data.viewedAt);
    const expiresAt = Date.parse(body.data.expiresAt);
    expect(expiresAt - viewedAt).toBe(5000);
    expect(fake.updateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('non-member cannot mark viewed (403 NOT_A_MEMBER, nothing scheduled)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({
      method: 'POST',
      url: viewUrl,
      payload: { timerSeconds: 5 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(fake.updateCalls).toHaveLength(0);
    expect(fake.message.expiresAt).toBeNull();
  });

  it('removed member cannot mark viewed (403 NOT_A_MEMBER)', async () => {
    const server = await as(REMOVED);
    const res = await server.inject({
      method: 'POST',
      url: viewUrl,
      payload: { timerSeconds: 5 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(fake.updateCalls).toHaveLength(0);
  });

  it('member cannot use the 1-second attack timer (400 INVALID_TIMER)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'POST',
      url: viewUrl,
      payload: { timerSeconds: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_TIMER');
    expect(fake.updateCalls).toHaveLength(0);
  });

  it('view on a missing message is 404 MESSAGE_NOT_FOUND', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/messages/nope/view',
      payload: { timerSeconds: 5 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('member screenshot names the AUTH identity, never the body (201)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'POST',
      url: screenshotUrl,
      payload: { viewerName: 'Viktor' },
    });
    expect(res.statusCode).toBe(201);
    expect(fake.createdMessages).toHaveLength(1);
    const created = fake.createdMessages[0] as any;
    expect(created.content).toBe('riya took a screenshot');
    expect(JSON.stringify(created)).not.toContain('Viktor');
    expect(created.senderId).toBe(MEMBER.userId);
    expect(created.metadata.screenshotBy).toBe(MEMBER.userId);
    expect(created.metadata.targetMessageId).toBe('msg-1');
  });

  it('member screenshot without a body name still uses the auth identity (201)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({ method: 'POST', url: screenshotUrl, payload: {} });
    expect(res.statusCode).toBe(201);
    const created = fake.createdMessages[0] as any;
    expect(created.content).toBe('riya took a screenshot');
  });

  it('non-member cannot inject a screenshot system message (403, nothing created)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({
      method: 'POST',
      url: screenshotUrl,
      payload: { viewerName: 'riya' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(fake.createdMessages).toHaveLength(0);
  });

  it('removed member cannot inject a screenshot system message (403)', async () => {
    const server = await as(REMOVED);
    const res = await server.inject({ method: 'POST', url: screenshotUrl, payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(fake.createdMessages).toHaveLength(0);
  });
});
