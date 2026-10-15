/**
 * Quick-reply schedule-send (backend half): POST /emails/:id/reply accepts the
 * same `sendAt` contract as POST /emails/:id/send — one schedule mechanism
 * across compose surfaces, no second implementation.
 *
 * Before the fix, the reply route had no sendAt field: the quick-reply bar
 * could only send immediately, and the composers' scheduled sends went through
 * the send route. Now the reply route validates sendAt exactly like
 * handleComposeOrSend (invalid -> 400, past -> 400, never a silent immediate
 * send), hands the delay to the same durable queue via EmailService.send, and
 * skips internal delivery + the realtime message.new broadcast while the
 * message is still scheduled (nothing delivered yet — broadcasting it would
 * be a lie and would reconcile against a row that does not exist).
 *
 * These tests exercise the REAL route handler with a mock Prisma:
 *   (a) past sendAt    -> 400 VALIDATION_ERROR, no draft composed
 *   (b) invalid sendAt -> 400 VALIDATION_ERROR
 *   (c) future sendAt  -> passes validation, reaches the delayed queue path
 *       (503 DELIVERY_QUEUE_UNAVAILABLE here — no Redis in this environment,
 *       the same convention as schedule-past-sendat-400.test.ts; the point is
 *       it is QUEUED, not silently sent immediately)
 */
import { describe, it, expect, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import emailsRoutes from '../routes/emails';

const ORIGINAL_ROW = {
  id: 'msg1',
  userId: 'u1',
  threadId: 'thread1',
  folderId: null as string | null,
  fromAddress: 'friend@example.com',
  fromName: 'Friend',
  toAddresses: ['kundan@quantmail.in'],
  ccAddresses: [],
  bccAddresses: [],
  subject: 'hello',
  bodyHtml: '<p>hello</p>',
  bodyPlain: 'hello',
  isRead: false,
  isDraft: false,
  isSent: false,
  isSpam: false,
  isTrash: false,
  receivedAt: new Date(),
  sentAt: null as Date | null,
  deletedAt: null as Date | null,
  deliveryStatus: 'delivered',
  messageId: null as string | null,
  messageKind: 'MAIL',
};

function makePrisma() {
  const created: Array<Record<string, any>> = [];
  const deleted: Array<unknown> = [];
  const prisma = {
    email: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where?.id === 'msg1') return { ...ORIGINAL_ROW };
        const draft = created.find((c) => c.id === where?.id);
        return draft ? { ...draft } : null;
      }),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data }: any) => ({ id: where?.id, ...data })),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: 'new1', userId: 'u1', ...data };
        created.push(row);
        return row;
      }),
      delete: vi.fn(async ({ where }: any) => {
        deleted.push(where);
        return { id: where?.id };
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => 0),
    },
    user: {
      findUnique: vi.fn(async () => ({
        email: 'kundan@quantmail.in',
        displayName: 'Kundan',
        username: 'kundan',
      })),
      findMany: vi.fn(async () => [{ email: 'kundan@quantmail.in', username: 'kundan' }]),
    },
    emailFolder: {
      findFirst: vi.fn(async () => ({ id: 'sent-folder-id' })),
      create: vi.fn(async ({ data }: any) => ({ id: 'new-folder-id', ...data })),
    },
    emailThread: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => ({ id: 'thread1', ...data })),
      update: vi.fn(async ({ data }: any) => data),
    },
    contact: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => ({ id: 'c1', ...data })),
      update: vi.fn(async ({ data }: any) => data),
      upsert: vi.fn(async ({ create }: any) => ({ id: 'c1', ...create })),
    },
    outboxEvent: {
      create: vi.fn(async ({ data }: any) => ({
        id: 'outbox-1',
        publishedAt: null,
        createdAt: new Date(),
        ...data,
      })),
    },
    $transaction: null as unknown as ReturnType<typeof vi.fn>,
  };
  prisma.$transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma));
  return { prisma, created, deleted };
}

async function buildApp() {
  const app: FastifyInstance = Fastify({ logger: false });
  app.addHook('onRequest', async (request) => {
    (request as any).auth = { userId: 'u1' };
  });
  const { prisma, created, deleted } = makePrisma();
  app.decorate('prisma', prisma as any);
  // The route prefers a decorated suppressionService; the module-level one
  // needs DATABASE_URL. Nothing is suppressed in this suite.
  app.decorate(
    'suppressionService',
    {
      filterAllowedRecipients: async (recipients: string[]) => ({
        allowed: recipients,
        suppressed: [],
      }),
    } as any,
  );
  app.setErrorHandler((error: any, _req, reply) => {
    const status = error?.statusCode ?? 500;
    reply.status(status).send({
      success: false,
      error: {
        code: error?.code ?? 'INTERNAL_ERROR',
        message: status === 500 ? 'An internal error occurred' : (error?.message ?? 'error'),
        statusCode: status,
      },
    });
  });
  await app.register(emailsRoutes, { prefix: '/emails' });
  await app.ready();
  return { app, prisma, created, deleted };
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMED OUT after ${ms}ms: ${label}`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function replyPayload(sendAt?: string) {
  return {
    body: 'on it, see you then',
    messageKind: 'chat',
    clientMessageId: 'cid-1',
    ...(sendAt ? { sendAt } : {}),
  };
}

describe('reply schedule-send: POST /emails/:id/reply sendAt contract', () => {
  it('past sendAt -> 400 VALIDATION_ERROR, no draft composed, nothing sent', async () => {
    const { app, prisma } = await buildApp();
    try {
      const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const res = await withTimeout(
        app.inject({ method: 'POST', url: '/emails/msg1/reply', payload: replyPayload(pastIso) }),
        45000,
        'POST /emails/msg1/reply {sendAt: past}',
      );
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toMatch(/past/i);
      // Validation runs before compose: no draft was minted for a dead send.
      expect((prisma.email.create as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  }, 60000);

  it('invalid sendAt -> 400 VALIDATION_ERROR', async () => {
    const { app } = await buildApp();
    try {
      const res = await withTimeout(
        app.inject({ method: 'POST', url: '/emails/msg1/reply', payload: replyPayload('not-a-date') }),
        45000,
        'POST /emails/msg1/reply {sendAt: invalid}',
      );
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  }, 60000);

  it('future sendAt -> accepted into the delayed queue path (503 here: no Redis), never silently immediate', async () => {
    const { app, prisma } = await buildApp();
    try {
      const futureIso = new Date(Date.now() + 3_600_000).toISOString();
      const res = await withTimeout(
        app.inject({ method: 'POST', url: '/emails/msg1/reply', payload: replyPayload(futureIso) }),
        45000,
        'POST /emails/msg1/reply {sendAt: future}',
      );
      const body = JSON.parse(res.body);
      // No Redis in this environment: the delayed send cannot enqueue, so the
      // send service throws an honest 503 and the draft stays a draft — the
      // same convention as the /send route's scheduled test. The point is the
      // sendAt was ACCEPTED (validation passed) and routed to the delayed
      // path instead of going out immediately.
      expect(res.statusCode).toBe(503);
      expect(body.error.code).toBe('DELIVERY_QUEUE_UNAVAILABLE');
      // The reply WAS composed (draft minted) — validation did not reject it.
      expect((prisma.email.create as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  }, 60000);

  it('immediate reply without sendAt passes validation (no VALIDATION_ERROR — unchanged path)', async () => {
    const { app } = await buildApp();
    try {
      const res = await withTimeout(
        app.inject({ method: 'POST', url: '/emails/msg1/reply', payload: replyPayload() }),
        45000,
        'POST /emails/msg1/reply (immediate)',
      );
      const body = JSON.parse(res.body);
      // In this environment the send itself 503s (no Redis, no SES), but it
      // must NOT be a VALIDATION_ERROR — the no-sendAt path is unchanged.
      expect(body.error?.code).not.toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  }, 60000);
});
