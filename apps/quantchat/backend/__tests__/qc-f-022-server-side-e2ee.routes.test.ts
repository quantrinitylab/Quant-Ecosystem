// ===========================================================================
// QC-F-022 — backend `encryption: 'e2e'` was server-side encryption theatre
// ===========================================================================
//
// Pre-fix state (verified firsthand on origin/main @ ea8695dd7):
//  - MessageService.sendMessage accepted `encryption: 'e2e'` +
//    `recipientPublicKeys`, received the PLAINTEXT on the server,
//    generated the AES session key on the server, and RSA-wrapped it per
//    recipient (`encryptForRecipients`). The server therefore saw every
//    "E2E" plaintext and session key — the opposite of end-to-end.
//  - The REST send route's zod schema did not declare those fields, so
//    an HTTP caller asking for 'e2e' had them silently stripped and the
//    plaintext was stored as an ordinary message under an E2EE belief.
//
// Fix pinned here: the server-side encryption API is removed; any
// request that asks this service/route to perform "e2e" encryption is
// rejected fail-closed (400 E2EE_REQUIRES_CLIENT_SIDE_ENCRYPTION) and
// persists NOTHING. Ordinary sends, and content that is already
// client-side ciphertext, pass through unchanged/opaque. Real E2EE is
// client-side only via the /e2ee ciphertext relay.
//
// Route tests mount the REAL messages route plugin on a bare Fastify
// instance with a preHandler installing `request.auth` the way the
// server-core auth plugin does, plus a mirror of its error handler.
// Only Prisma is faked, with stable module-level identities.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as crypto from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import messagesRoutes from '../routes/messages';

function realPublicKeyBase64(): string {
  const { publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return Buffer.from(publicKey).toString('base64');
}

const MEMBER = { userId: 'user_member', username: 'member' };
const MEMBER2 = { userId: 'user_member2', username: 'member2' };

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
  const messages: MessageRow[] = [];
  let seq = 0;
  const messageDelegate = {
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
    // QC-F-359 fixture migration: the blocked-send gate reads the
    // conversation TYPE from the row (this suite's only conversation
    // is the 1:1 conv-1, so DIRECT) and block lists from user
    // preferences (null = readable empty list, 'clear' both
    // directions). Assertions unchanged.
    conversation: {
      async findUnique({ where }: any) {
        return { id: where.id, type: 'DIRECT' };
      },
    },
    user: {
      async findUnique({ where }: any) {
        return { id: where.id, preferences: null };
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

type FakePrisma = ReturnType<typeof makeFakePrisma>['prisma'];

async function buildRouteApp(
  auth: { userId: string; username: string } | null,
  prisma: FakePrisma,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
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
  await app.register(messagesRoutes, { prefix: '/conversations' });
  await app.ready();
  return app;
}

describe('QC-F-022 send route — server-side "e2e" requests are rejected, never stripped/stored', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    fake = makeFakePrisma();
    app = null;
  });
  afterEach(async () => {
    if (app) await app.close();
  });

  it('POST with encryption:e2e + recipientPublicKeys -> 400 E2EE_REQUIRES_CLIENT_SIDE_ENCRYPTION, nothing stored', async () => {
    app = await buildRouteApp(MEMBER, fake.prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv-1/messages',
      payload: {
        content: 'top secret',
        encryption: 'e2e',
        recipientPublicKeys: [{ userId: MEMBER2.userId, publicKey: realPublicKeyBase64() }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('E2EE_REQUIRES_CLIENT_SIDE_ENCRYPTION');
    expect(fake.messages).toHaveLength(0);
  });

  it('POST with encryption:e2e alone -> 400, nothing stored (no silent plaintext downgrade)', async () => {
    app = await buildRouteApp(MEMBER, fake.prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv-1/messages',
      payload: { content: 'top secret', encryption: 'e2e' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('E2EE_REQUIRES_CLIENT_SIDE_ENCRYPTION');
    expect(fake.messages).toHaveLength(0);
  });

  it('POST with recipientPublicKeys alone -> 400, nothing stored', async () => {
    app = await buildRouteApp(MEMBER, fake.prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv-1/messages',
      payload: {
        content: 'top secret',
        recipientPublicKeys: [{ userId: MEMBER2.userId, publicKey: realPublicKeyBase64() }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('E2EE_REQUIRES_CLIENT_SIDE_ENCRYPTION');
    expect(fake.messages).toHaveLength(0);
  });

  it('unauthenticated e2e request is 401 first, nothing stored', async () => {
    app = await buildRouteApp(null, fake.prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv-1/messages',
      payload: { content: 'top secret', encryption: 'e2e' },
    });
    expect(res.statusCode).toBe(401);
    expect(fake.messages).toHaveLength(0);
  });

  it('control: ordinary text send still works (201, stored verbatim)', async () => {
    app = await buildRouteApp(MEMBER, fake.prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv-1/messages',
      payload: { content: 'hello world', type: 'text' },
    });
    expect(res.statusCode).toBe(201);
    expect(fake.messages).toHaveLength(1);
    expect(fake.messages[0]!.content).toBe('hello world');
  });

  it('control: already-client-encrypted ciphertext content is stored opaque, verbatim', async () => {
    app = await buildRouteApp(MEMBER, fake.prisma);
    const ciphertext = '{"ciphertext":"b3BhcXVl","nonce":"bg==","authTag":"dA=="}';
    const res = await app.inject({
      method: 'POST',
      url: '/conversations/conv-1/messages',
      payload: { content: ciphertext, type: 'text' },
    });
    expect(res.statusCode).toBe(201);
    expect(fake.messages[0]!.content).toBe(ciphertext);
  });
});
