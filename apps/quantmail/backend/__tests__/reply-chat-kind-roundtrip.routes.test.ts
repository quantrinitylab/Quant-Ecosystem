// ============================================================================
// Silent-loss P1 (backend half): end-to-end honesty — what we claim sent must
// be retrievable.
//
// A chat-kind reply (messageKind='chat' — the mark the quick-reply bar sends
// via POST /emails/:id/reply) written through the REAL EmailService.compose —
// the exact persistence call the reply route makes — must come back from the
// REAL GET /threads/:id read path (ThreadService.getThread +
// formatEmailRecord, served over HTTP via app.inject) with messageKind='chat'.
//
// The prisma double below is a shared in-memory store, not canned rows: the
// write and the read both go through it, so a serialization break on either
// side (stored 'CHAT' vs wire 'chat') shows up here exactly as it would for
// a user whose reply vanished after a "Message sent!" toast.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { EmailService, toMessageKind } from '../services/email.service';
import threadsRoutes from '../routes/threads';

type Row = Record<string, any>;

function matchesWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as Row[]).some((c) => matchesWhere(row, c))) return false;
    } else if (key === 'AND') {
      if (!(cond as Row[]).every((c) => matchesWhere(row, c))) return false;
    } else if (cond === null) {
      if (row[key] !== null && row[key] !== undefined) return false;
    } else if (typeof cond === 'object') {
      throw new Error(`test double: unsupported condition ${key}=${JSON.stringify(cond)}`);
    } else if (row[key] !== cond) {
      return false;
    }
  }
  return true;
}

/** Postgres defaults: NULLs last on ASC. Only the shapes getThread emits. */
function compareRows(a: Row, b: Row, orderBy: Array<Record<string, string>>): number {
  for (const term of orderBy) {
    const [field, dir] = Object.entries(term)[0];
    const av = a[field] instanceof Date ? a[field].getTime() : a[field];
    const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
    if (av == null && bv == null) continue;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av !== bv) return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
  }
  return 0;
}

function makePrisma() {
  const users: Row[] = [];
  const emails: Row[] = [];
  const threads: Row[] = [];
  const outbox: Row[] = [];
  let seq = 0;

  const emailModel = {
    create: vi.fn(async ({ data }: Row) => {
      const row: Row = {
        id: `e-${++seq}-${Date.now()}`,
        userId: data.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        receivedAt: null,
        deletedAt: null,
        isRead: false,
        isStarred: false,
        isDraft: false,
        isSent: false,
        ...data,
      };
      emails.push(row);
      return row;
    }),
    findUnique: vi.fn(async ({ where }: Row) => emails.find((e) => e.id === where.id) ?? null),
    findMany: vi.fn(async (args: Row = {}) => {
      const out = emails.filter((e) => matchesWhere(e, args.where ?? {}));
      const orderBy = args.orderBy ? (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) : [];
      out.sort((a, b) => compareRows(a, b, orderBy));
      // getThread includes the folder relation; the double has no folders.
      return out.map((e) => ({ ...e, folder: null }));
    }),
  };

  const tx = {
    email: emailModel,
    outboxEvent: {
      create: vi.fn(async ({ data }: Row) => {
        const row = { id: `ob-${outbox.length + 1}`, createdAt: new Date(), ...data };
        outbox.push(row);
        return row;
      }),
    },
  };

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: Row) => users.find((u) => u.id === where.id) ?? null),
      findMany: vi.fn(async () => []),
    },
    email: emailModel,
    emailThread: {
      findUnique: vi.fn(async ({ where }: Row) => threads.find((t) => t.id === where.id) ?? null),
    },
    outboxEvent: tx.outboxEvent,
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
  };

  return { prisma: prisma as never, users, emails, threads, outbox };
}

async function buildThreadsApp(prisma: never) {
  const app: FastifyInstance = Fastify({ logger: false });
  app.addHook('onRequest', async (request) => {
    const id = (request.headers['x-test-user'] as string) || '';
    if (id) (request as any).auth = { userId: id };
  });
  app.decorate('prisma', prisma);
  app.setErrorHandler((error: any, _req, reply) => {
    const status = error?.statusCode ?? 500;
    reply.status(status).send({
      success: false,
      error: { code: error?.code ?? 'INTERNAL_ERROR', message: error?.message ?? 'error' },
    });
  });
  await app.register(threadsRoutes, { prefix: '/threads' });
  await app.ready();
  return app;
}

describe("chat-kind reply round trip: compose (reply route's write) -> GET /threads/:id (read)", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("a reply composed with messageKind='chat' is retrievable from its thread with messageKind='chat'", async () => {
    const { prisma, users, threads } = makePrisma();
    users.push({ id: 'u1', email: 'kundan@quantmail.in', displayName: 'Kundan', username: 'kundan' });
    threads.push({
      id: 't1',
      userId: 'u1',
      subject: 'Re: kal milte hain',
      participantAddresses: ['friend@example.com', 'kundan@quantmail.in'],
      messageCount: 1,
      lastEmailAt: new Date('2026-10-10T10:00:00Z'),
    });

    const emailService = new EmailService(prisma);

    // The original inbound message the reply answers.
    await (prisma as any).email.create({
      data: {
        id: 'e-original',
        userId: 'u1',
        threadId: 't1',
        fromAddress: 'friend@example.com',
        fromName: 'Friend',
        toAddresses: ['kundan@quantmail.in'],
        subject: 'kal milte hain',
        bodyPlain: 'kal 5 baje milte hain?',
        messageKind: 'MAIL',
        isRead: true,
        receivedAt: new Date('2026-10-10T10:00:00Z'),
        createdAt: new Date('2026-10-10T10:00:00Z'),
      },
    });

    // Exactly the compose call POST /emails/:id/reply makes for a quick-reply
    // "Send as: Message" send: the route normalizes the wire 'chat' through
    // toMessageKind() and passes the thread linkage through.
    const reply = await emailService.compose({
      userId: 'u1',
      toAddresses: ['friend@example.com'],
      ccAddresses: [],
      bccAddresses: [],
      subject: 'Re: kal milte hain',
      bodyPlain: 'Pakka, kal 5 baje milte hain',
      threadId: 't1',
      inReplyTo: 'e-original',
      messageKind: toMessageKind('chat'),
    });

    // Write-side honesty: the stored enum must carry the chat mark. (The
    // generated Prisma Email type predates the messageKind column — the field
    // is written via `as never` in compose and read defensively downstream —
    // so this asserts the runtime row, not the stale type.)
    const storedKind = (reply as unknown as { messageKind?: unknown }).messageKind;
    expect(storedKind).toBe('CHAT');
    expect(reply.threadId).toBe('t1');
    expect(reply.inReplyTo).toBe('e-original');

    // Read-side honesty, over real HTTP through the real threads route.
    app = await buildThreadsApp(prisma);
    const res = await app.inject({
      method: 'GET',
      url: '/threads/t1',
      headers: { 'x-test-user': 'u1' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const messages: Row[] = body.data.messages;
    expect(messages.length).toBe(2);
    const wireReply = messages.find((m) => m.id === reply.id);
    expect(wireReply).toBeDefined();
    // The client contract is lowercase 'chat' — what the thread view renders.
    expect(wireReply!.messageKind).toBe('chat');
    expect(wireReply!.bodyText).toBe('Pakka, kal 5 baje milte hain');
    // The original letter is untouched by the chat reply.
    expect(messages.find((m) => m.id === 'e-original')!.messageKind).toBe('mail');
  });

  it("GET /threads/:id does not leak another user's thread (404, not the thread)", async () => {
    const { prisma, users, threads } = makePrisma();
    users.push({ id: 'u1', email: 'kundan@quantmail.in', displayName: 'Kundan', username: 'kundan' });
    users.push({ id: 'u2', email: 'stranger@quantmail.in', displayName: 'Stranger', username: 'stranger' });
    threads.push({ id: 't1', userId: 'u1', subject: 'private', participantAddresses: [], messageCount: 0 });

    app = await buildThreadsApp(prisma);
    const res = await app.inject({
      method: 'GET',
      url: '/threads/t1',
      headers: { 'x-test-user': 'u2' },
    });
    // The route's getThread throws 403 internally, but the handler falls
    // through to email-id resolution and answers 404 — the thread's
    // existence (and its subject) is not leaked to another user.
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('private');
  });
});
