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
  // fix/qm-send-order-outbox (flip-first): the send path reads the row back
  // between writes (versionedUpdate's re-read, compensateSendFlip's guard), so
  // the fake keeps real row state — later reads see earlier writes, and the
  // conditional updateMany honours the version predicate plus the
  // requireUnsent (isDraft/isSent) predicate, like the real query.
  const rows = new Map<string, Record<string, unknown>>([['draft1', { ...DRAFT_ROW }]]);
  const applyData = (row: Record<string, unknown>, data: Record<string, unknown>) => {
    const next = { ...row };
    for (const [k, v] of Object.entries(data)) {
      if (k === 'version' && typeof v === 'object' && v !== null && 'increment' in v) {
        next['version'] = ((row['version'] as number) ?? 0) + (v as { increment: number }).increment;
      } else {
        next[k] = v;
      }
    }
    return next;
  };
  const matchesWhere = (row: Record<string, unknown>, where: any) => {
    if (where?.id !== undefined && row['id'] !== where.id) return false;
    if (where?.version !== undefined && (row['version'] ?? 0) !== where.version) return false;
    if (where?.isDraft !== undefined && row['isDraft'] !== where.isDraft) return false;
    if (where?.isSent !== undefined && row['isSent'] !== where.isSent) return false;
    return true;
  };
  const prisma = {
    email: {
      findUnique: vi.fn(async ({ where }: any) => {
        const row = where?.id ? rows.get(where.id) : undefined;
        return row ? { ...row } : null;
      }),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data }: any) => {
        const row = (where?.id ? rows.get(where.id) : undefined) ?? { ...DRAFT_ROW };
        const next = applyData(row, data);
        if (where?.id) rows.set(where.id, next);
        updates.push({ where, data });
        return { ...next };
      }),
      create: vi.fn(async ({ data }: any) => ({ id: 'new1', ...data })),
      // QM-BACK-002: versionedUpdate's conditional updateMany must match the
      // row; record it like `update` so the sent-flip assertions keep working.
      updateMany: vi.fn(async ({ where, data }: any) => {
        const row = (where?.id ? rows.get(where.id) : undefined) ?? { ...DRAFT_ROW };
        if (!matchesWhere(row, where)) return { count: 0 };
        const next = applyData(row, data);
        if (where?.id) rows.set(where.id, next);
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
    // K1: EmailService mutations run inside `prisma.$transaction`; the double
    // hands the callback the mock itself as the tx client and records outbox
    // writes.
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

  it('composer payload { delayMs: 10000 } fails honestly with 503, flip compensated back to draft', async () => {
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
      // fix/qm-send-order-outbox (flip-first): the durable sent-flip commits
      // BEFORE the transmit attempt, so an isSent=true write does happen —
      // but only on a still-unsent draft (the atomic send-once guard), and
      // the failed enqueue is compensated back to a draft before the 503
      // surfaces, so the row ends as a draft and the user can retry.
      const sentFlip = updates.find((u) => (u.data as any).isSent === true);
      expect(sentFlip).toBeDefined();
      expect((sentFlip!.where as any).isDraft).toBe(true);
      expect((sentFlip!.where as any).isSent).toBe(false);
      const last = updates[updates.length - 1]!;
      expect((last.data as any).isDraft).toBe(true);
      expect((last.data as any).isSent).toBe(false);
      expect((last.data as any).deliveryStatus).toBe('draft');
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
