/**
 * CUST-P0-2 regression: the send path must never fake success.
 *
 * History: self-test sends (kundan@quantmail.in → self) surfaced
 * "An internal error occurred" and no Sent confirmation/folder. The schema
 * drift behind that 500 is fixed by migrations; this suite locks in the
 * code-level guarantee added on top: when the outbound queue is unreachable
 * (mirrored here with the REAL EmailService + REAL OutboundDeliveryPipeline
 * and no Redis), POST /emails/:id/send must fail with a REAL, retryable
 * error — never a 202 "Email queued for delivery" while the draft was
 * silently left undeliverable.
 *
 * Exercise the REAL route handler (POST /emails/:id/send) with the REAL
 * EmailService + REAL OutboundDeliveryPipeline.createQueue() (real BullMQ,
 * no Redis in this environment) and a mock Prisma whose delegates succeed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
      updateMany: vi.fn(async () => ({ count: 0 })),
      count: vi.fn(async () => 0),
    },
    user: {
      findUnique: vi.fn(async () => ({
        email: 'kundan@quantmail.in',
        displayName: 'Kundan',
        username: 'kundan',
      })),
      // kundan@quantmail.in IS an internal user: no external recipients.
      findMany: vi.fn(async () => [
        { email: 'kundan@quantmail.in', username: 'kundan' },
      ]),
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
  };
  return { prisma, updates };
}

async function buildApp() {
  const app: FastifyInstance = Fastify({ logger: false });
  app.addHook('onRequest', async (request) => {
    (request as any).auth = { userId: 'u1' };
  });
  const { prisma, updates } = makePrisma();
  app.decorate('prisma', prisma as any);
  // The real error handler: 5xx unknown errors -> "An internal error occurred",
  // known AppErrors -> their real code/message.
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

describe('CUST-P0-2: no fake success on the send path (real pipeline, no Redis)', () => {
  beforeEach(() => {
    delete process.env['REDIS_URL'];
    delete process.env['REDIS_HOST'];
    delete process.env['REDIS_PORT'];
  });

  it('composer payload { delayMs: 10000 } fails honestly with 503, draft NOT flipped', async () => {
    const { app, updates } = await buildApp();
    try {
      const res = await withTimeout(
        app.inject({ method: 'POST', url: '/emails/draft1/send', payload: { delayMs: 10000 } }),
        45000,
        'POST /emails/draft1/send {delayMs:10000}',
      );
      const body = JSON.parse(res.body);
      // No silent fake-success: the queue is down, nothing was queued.
      expect(res.statusCode).toBe(503);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('DELIVERY_QUEUE_UNAVAILABLE');
      // The real reason surfaces — never the generic internal-error string.
      expect(body.error.message).not.toContain('An internal error occurred');
      expect(body.error.message).toContain('remains a draft');
      // The draft was never flipped to Sent: no isSent=true update happened.
      const sentFlip = updates.find((u) => (u.data as any).isSent === true);
      expect(sentFlip).toBeUndefined();
    } finally {
      await app.close();
    }
  }, 60000);

  it('immediate send {} to an internal recipient still succeeds without Redis', async () => {
    const { app, updates } = await buildApp();
    try {
      const res = await withTimeout(
        app.inject({ method: 'POST', url: '/emails/draft1/send', payload: {} }),
        45000,
        'POST /emails/draft1/send {}',
      );
      // No delay and no external recipients: nothing needs the queue, so the
      // send completes honestly (delivered internally by the route below).
      expect(res.statusCode).toBe(202);
      const sentFlip = updates.find((u) => (u.data as any).isSent === true);
      expect(sentFlip).toBeDefined();
    } finally {
      await app.close();
    }
  }, 60000);
});
