// ===========================================================================
// QC-F-020 — reactions were local-only theatre; voice notes were fake text
// ===========================================================================
//
// Pre-fix state (verified firsthand on origin/main):
//  - MessageService.reactToMessage existed and was unit-tested, but NO
//    backend route exposed it: POST /messages/:id/reactions 404'd, and the
//    thread page kept reactions in a local useState map — invisible to
//    other members, gone on reload, unlimited duplicates per user.
//  - The thread page "sent" voice notes as a TEXT message whose content
//    was the fabricated string `Voice note (Xs)`; the recorder's real
//    audio blob was discarded (its onAudioRecorded callback had no
//    consumer), and the send schema rejected the empty content a real
//    audio message carries.
//
// These tests mount the REAL messages route plugin on a bare Fastify
// instance with a preHandler that installs `request.auth` exactly the way
// the server-core auth plugin does, plus a mirror of its AppError error
// handler. The service is the real one; only Prisma is an in-memory fake
// with stable module-level identities (no fresh-identity mocks).
//
// Every behaviour test FAILS against the pre-fix code (route missing /
// schema rejecting) and passes with the fix — verified by negative
// control.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import messagesRoutes from '../routes/messages';

// Stable identities (module-level).
const MEMBER = { userId: 'user_member', username: 'member' };
const MEMBER2 = { userId: 'user_member2', username: 'member2' };
const OUTSIDER = { userId: 'user_outsider', username: 'outsider' };

interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  mediaUrl: string | null;
  metadata: Record<string, unknown>;
  isDeleted: boolean;
  createdAt: Date;
}

function makeFakePrisma() {
  const members = [
    { conversationId: 'conv-1', userId: MEMBER.userId, leftAt: null },
    { conversationId: 'conv-1', userId: MEMBER2.userId, leftAt: null },
  ];
  const messages: MessageRow[] = [
    {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: MEMBER2.userId,
      content: 'hello',
      type: 'TEXT',
      mediaUrl: null,
      metadata: {},
      isDeleted: false,
      createdAt: new Date('2026-10-11T00:00:00Z'),
    },
  ];
  let seq = 0;

  const messageDelegate = {
    async findUnique({ where }: any) {
      return messages.find((m) => m.id === where.id) ?? null;
    },
    async update({ where, data }: any) {
      const row = messages.find((m) => m.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    },
    async create({ data }: any) {
      seq += 1;
      const row: MessageRow = {
        id: `msg-new-${seq}`,
        conversationId: data.conversationId,
        senderId: data.senderId,
        content: data.content,
        type: String(data.type),
        mediaUrl: data.mediaUrl ?? null,
        metadata: (data.metadata ?? {}) as Record<string, unknown>,
        isDeleted: false,
        createdAt: new Date(),
      };
      messages.push(row);
      return row;
    },
  };

  const prisma = {
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
          .filter((m) => m.conversationId === where.conversationId && m.leftAt === where.leftAt)
          .map((m) => ({ userId: m.userId }));
      },
    },
    message: messageDelegate,
    async $transaction(cb: (tx: unknown) => Promise<unknown>) {
      const tx = {
        message: messageDelegate,
        conversation: { async update() { return {}; } },
        messageOutbox: { async create() { return {}; } },
      };
      return cb(tx);
    },
  };

  return { prisma, messages };
}

async function buildRouteApp(
  auth: { userId: string; username: string } | null,
  prisma: unknown,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Mirror of server-core error-handler's AppError branch.
  app.setErrorHandler((err, _request, reply) => {
    // Mirror of server-core error-handler's ZodError branch (-> 400).
    if (err instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', statusCode: 400 },
      });
    }
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
  // Same mount as backend/app.ts.
  await app.register(messagesRoutes, { prefix: '/conversations' });
  await app.ready();
  return app;
}

describe('QC-F-020 reactions routes (real wiring for reactToMessage)', () => {
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

  it('rejects unauthenticated reaction with 401 and persists nothing', async () => {
    const server = await as(null);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '👍' },
    });
    expect(res.statusCode).toBe(401);
    expect(fake.messages[0]!.metadata).toEqual({});
  });

  it('member reaction persists into message metadata (200, server truth returned)', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '👍' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.metadata.reactions).toEqual({ '👍': [MEMBER.userId] });
    // Persisted on the stored record, not just echoed:
    expect(fake.messages[0]!.metadata).toEqual({ reactions: { '👍': [MEMBER.userId] } });
  });

  it('reacting again with the same emoji toggles it off (no duplicates)', async () => {
    const server = await as(MEMBER);
    await server.inject({
      method: 'POST',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '👍' },
    });
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '👍' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.metadata.reactions).toEqual({});
  });

  it('two members reacting with the same emoji accumulate both userIds', async () => {
    const server = await as(MEMBER);
    await server.inject({
      method: 'POST',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '❤️' },
    });
    app = await buildRouteApp(MEMBER2, fake.prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '❤️' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.metadata.reactions).toEqual({
      '❤️': [MEMBER.userId, MEMBER2.userId],
    });
  });

  it('non-member cannot react (403 NOT_A_MEMBER, nothing persisted)', async () => {
    const server = await as(OUTSIDER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '👍' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_A_MEMBER');
    expect(fake.messages[0]!.metadata).toEqual({});
  });

  it('reacting to a missing message is 404 MESSAGE_NOT_FOUND', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/messages/msg-nope/reactions',
      payload: { emoji: '👍' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('empty emoji body is rejected (400) and persists nothing', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(fake.messages[0]!.metadata).toEqual({});
  });

  it('identity in the body cannot override the authenticated user', async () => {
    const server = await as(MEMBER);
    const res = await server.inject({
      method: 'POST',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '👍', userId: OUTSIDER.userId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.metadata.reactions).toEqual({ '👍': [MEMBER.userId] });
  });

  it('DELETE removes only the caller reaction and is idempotent', async () => {
    const server = await as(MEMBER);
    await server.inject({
      method: 'POST',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '👍' },
    });
    const removed = await server.inject({
      method: 'DELETE',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '👍' },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().data.metadata.reactions).toEqual({});
    const again = await server.inject({
      method: 'DELETE',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '👍' },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().data.metadata.reactions).toEqual({});
  });

  it('DELETE by a non-member is 403 and keeps existing reactions', async () => {
    const server = await as(MEMBER);
    await server.inject({
      method: 'POST',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '👍' },
    });
    app = await buildRouteApp(OUTSIDER, fake.prisma);
    const res = await app.inject({
      method: 'DELETE',
      url: '/conversations/messages/msg-1/reactions',
      payload: { emoji: '👍' },
    });
    expect(res.statusCode).toBe(403);
    expect(fake.messages[0]!.metadata).toEqual({ reactions: { '👍': [MEMBER.userId] } });
  });
});

describe('QC-F-020 voice-note send (real AUDIO message, not fake text)', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    fake = makeFakePrisma();
    app = null;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('member can send an audio message with empty text content + mediaUrl + duration metadata', async () => {
    app = await buildRouteApp(MEMBER, fake.prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv-1/messages',
      payload: {
        content: '',
        type: 'audio',
        mediaUrl: 'data:audio/webm;base64,AAAA',
        metadata: { voiceDurationMs: 2500 },
      },
    });
    expect(res.statusCode).toBe(201);
    const stored = fake.messages.find((m) => m.id !== 'msg-1');
    expect(stored).toBeDefined();
    expect(stored!.type).toBe('AUDIO');
    expect(stored!.mediaUrl).toBe('data:audio/webm;base64,AAAA');
    expect(stored!.metadata).toEqual({ voiceDurationMs: 2500 });
    // The fabricated label must NOT be what got stored as content:
    expect(stored!.content).toBe('');
  });

  it('a message with neither content nor mediaUrl is still rejected (400)', async () => {
    app = await buildRouteApp(MEMBER, fake.prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv-1/messages',
      payload: { content: '', type: 'text' },
    });
    expect(res.statusCode).toBe(400);
    expect(fake.messages).toHaveLength(1);
  });

  it('plain text send still works exactly as before (201)', async () => {
    app = await buildRouteApp(MEMBER, fake.prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv-1/messages',
      payload: { content: 'hello world', type: 'text' },
    });
    expect(res.statusCode).toBe(201);
    const stored = fake.messages.find((m) => m.id !== 'msg-1');
    expect(stored!.content).toBe('hello world');
  });
});
