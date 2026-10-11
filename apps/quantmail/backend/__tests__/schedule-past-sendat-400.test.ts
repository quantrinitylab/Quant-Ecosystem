/**
 * Schedule-send honesty P1: a past `sendAt` must NEVER fall through to an
 * immediate send while the UI claims "scheduled".
 *
 * Before the fix, POST /emails/:id/send with a past sendAt skipped the
 * `parsedDate > now` branch, left delayMs undefined, and the send went out
 * IMMEDIATELY — while the composer had already toasted 'Email scheduled'.
 *
 * These tests exercise the REAL route handler (POST /emails/:id/send) with a
 * mock Prisma, and pin:
 *   (a) past sendAt   -> 400 VALIDATION_ERROR, honest message, draft NOT flipped
 *   (b) invalid sendAt -> 400 VALIDATION_ERROR (existing guard, unchanged)
 *   (c) future sendAt -> passes validation (reaches the queue path; 503 here
 *       because there is no Redis in this environment — same as the delayMs
 *       case in the CUST-P0-2 suite)
 */
import { describe, it, expect, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import emailsRoutes from '../routes/emails';

const DRAFT_ROW = {
  id: 'draft1',
  userId: 'u1',
  threadId: null as string | null,
  folderId: null as string | null,
  fromAddress: 'kundan@quantmail.in',
  fromName: 'Kundan',
  toAddresses: ['kundan@quantmail.in'],
  ccAddresses: [],
  bccAddresses: [],
  subject: 'self test',
  bodyHtml: '<p>hi</p>',
  bodyPlain: 'hi',
  isRead: false,
  isDraft: true,
  isSent: false,
  isSpam: false,
  isTrash: false,
  receivedAt: null as Date | null,
  sentAt: null as Date | null,
  deletedAt: null as Date | null,
  deliveryStatus: 'draft',
  messageId: null as string | null,
  messageKind: 'MAIL',
};

function makePrisma() {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const prisma = {
    email: {
      findUnique: vi.fn(async ({ where }: any) =>
        where?.id === 'draft1' ? { ...DRAFT_ROW } : null,
      ),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data }: any) => {
        updates.push({ where, data });
        return { ...DRAFT_ROW, ...data };
      }),
      create: vi.fn(async ({ data }: any) => ({ id: 'new1', ...data })),
      updateMany: vi.fn(async ({ where, data }: any) => {
        updates.push({ where, data });
        return { count: 1 };
      }),
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
  return { prisma, updates };
}

async function buildApp() {
  const app: FastifyInstance = Fastify({ logger: false });
  app.addHook('onRequest', async (request) => {
    (request as any).auth = { userId: 'u1' };
  });
  const { prisma, updates } = makePrisma();
  app.decorate('prisma', prisma as any);
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
  return { app, updates };
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

describe('schedule-send honesty: past sendAt is rejected, never sent immediately', () => {
  it('past sendAt -> 400 VALIDATION_ERROR with honest copy, draft NOT flipped to sent', async () => {
    const { app, updates } = await buildApp();
    try {
      const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const res = await withTimeout(
        app.inject({ method: 'POST', url: '/emails/draft1/send', payload: { sendAt: pastIso } }),
        45000,
        'POST /emails/draft1/send {sendAt: past}',
      );
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      // Honest copy: says the time is in the past, never claims "scheduled".
      expect(body.error.message).toMatch(/past/i);
      // The draft was never flipped to Sent: no isSent=true update happened.
      const sentFlip = updates.find((u) => (u.data as any).isSent === true);
      expect(sentFlip).toBeUndefined();
    } finally {
      await app.close();
    }
  }, 60000);

  it('sendAt exactly now -> 400 VALIDATION_ERROR (not a schedule)', async () => {
    const { app, updates } = await buildApp();
    try {
      const res = await withTimeout(
        app.inject({
          method: 'POST',
          url: '/emails/draft1/send',
          payload: { sendAt: new Date().toISOString() },
        }),
        45000,
        'POST /emails/draft1/send {sendAt: now}',
      );
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      const sentFlip = updates.find((u) => (u.data as any).isSent === true);
      expect(sentFlip).toBeUndefined();
    } finally {
      await app.close();
    }
  }, 60000);

  it('invalid sendAt -> 400 VALIDATION_ERROR (existing guard unchanged)', async () => {
    const { app } = await buildApp();
    try {
      const res = await withTimeout(
        app.inject({
          method: 'POST',
          url: '/emails/draft1/send',
          payload: { sendAt: 'not-a-date' },
        }),
        45000,
        'POST /emails/draft1/send {sendAt: invalid}',
      );
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  }, 60000);

  it('future sendAt -> passes validation (reaches the queue path, 503 with no Redis)', async () => {
    const { app } = await buildApp();
    try {
      const futureIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const res = await withTimeout(
        app.inject({ method: 'POST', url: '/emails/draft1/send', payload: { sendAt: futureIso } }),
        45000,
        'POST /emails/draft1/send {sendAt: future}',
      );
      const body = JSON.parse(res.body);
      // Not the 400 validation error: the schedule was accepted and the send
      // attempted the delivery queue, which is down in this environment.
      expect(res.statusCode).toBe(503);
      expect(body.error.code).toBe('DELIVERY_QUEUE_UNAVAILABLE');
    } finally {
      await app.close();
    }
  }, 60000);
});
