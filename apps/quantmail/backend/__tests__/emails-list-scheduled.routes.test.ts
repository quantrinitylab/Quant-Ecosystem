/**
 * QM-SCHEDULED — the Scheduled mailbox: GET /emails?folderType=SCHEDULED.
 *
 * Scheduled sends were invisible and unmanageable after scheduling: the
 * backend persisted the future send (`sentAt` = the scheduled fire time,
 * `deliveryStatus = 'queued'` while the BullMQ delay holds the job back)
 * but no list endpoint exposed them. This suite pins the new query contract
 * with the REAL route handler (Fastify inject + mock Prisma):
 *
 *   (a) folderType=SCHEDULED issues exactly: userId scoped, isSent=true,
 *       deliveryStatus='queued', isTrash=false, sentAt > now — so delivered
 *       mail, other users' rows, trashed rows and sends whose time already
 *       passed never appear.
 *   (b) the list is ordered by scheduled time, soonest first (a to-do list,
 *       not a timeline).
 *   (c) the keyset cursor is ignored on this view (it encodes the descending
 *       receivedAt/createdAt/id ordering of every other view; a cursor would
 *       page the ascending sentAt ordering wrongly) — even a garbage cursor
 *       must not 400 here.
 *   (d) queued rows arrive with `scheduledAt` bridged from `sentAt`
 *       (formatEmailRecord), so the client can render the fire time without
 *       special-casing the wire shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import emailsRoutes from '../routes/emails';

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 60 * 1000);

const QUEUED_ROW = {
  id: 'sched1',
  userId: 'u1',
  threadId: null as string | null,
  folderId: 'sent-folder-id',
  fromAddress: 'kundan@quantmail.in',
  fromName: 'Kundan',
  toAddresses: ['friend@example.com'],
  ccAddresses: [],
  bccAddresses: [],
  subject: 'scheduled mail',
  bodyHtml: '<p>later</p>',
  bodyPlain: 'later',
  isRead: false,
  isStarred: false,
  isDraft: false,
  isSent: true,
  isSpam: false,
  isTrash: false,
  receivedAt: null as Date | null,
  sentAt: FUTURE,
  deletedAt: null as Date | null,
  deliveryStatus: 'queued',
  messageId: '<sched1@quantmail.in>',
  messageKind: 'MAIL',
  createdAt: new Date(),
};

const captured: { where?: unknown; orderBy?: unknown } = {};

function makePrisma(rows: unknown[] = [QUEUED_ROW]) {
  const prisma = {
    email: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async (args: any) => {
        captured.where = args?.where;
        captured.orderBy = args?.orderBy;
        return rows;
      }),
      update: vi.fn(async ({ data }: any) => ({ ...QUEUED_ROW, ...data })),
      create: vi.fn(async ({ data }: any) => ({ id: 'new1', ...data })),
      updateMany: vi.fn(async () => ({ count: 0 })),
      count: vi.fn(async () => rows.length),
    },
    user: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
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
      create: vi.fn(async ({ data }: any) => ({ id: 'outbox-1', ...data })),
    },
    $transaction: null as unknown as ReturnType<typeof vi.fn>,
  };
  prisma.$transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma));
  return prisma;
}

async function buildApp(rows: unknown[] = [QUEUED_ROW]) {
  const app: FastifyInstance = Fastify({ logger: false });
  app.addHook('onRequest', async (request) => {
    (request as any).auth = { userId: 'u1' };
  });
  app.decorate('prisma', makePrisma(rows) as any);
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
  return app;
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

describe('QM-SCHEDULED — GET /emails?folderType=SCHEDULED', () => {
  beforeEach(() => {
    captured.where = undefined;
    captured.orderBy = undefined;
  });

  it('issues the Scheduled query contract: own queued sends with a future fire time', async () => {
    const app = await buildApp();
    try {
      const res = await withTimeout(
        app.inject({ method: 'GET', url: '/emails?folderType=SCHEDULED' }),
        45000,
        'GET /emails?folderType=SCHEDULED',
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      const where = captured.where as Record<string, unknown>;
      // Tenant isolation: always scoped to the authenticated user.
      expect(where.userId).toBe('u1');
      // Only fired sends whose delivery is still held back by the queue…
      expect(where.isSent).toBe(true);
      expect(where.deliveryStatus).toBe('queued');
      // …not trashed…
      expect(where.isTrash).toBe(false);
      // …and whose scheduled time has not passed yet.
      const sentAt = where.sentAt as { gt?: Date };
      expect(sentAt?.gt).toBeInstanceOf(Date);
      expect((sentAt.gt as Date).getTime()).toBeGreaterThan(Date.now() - 5000);
      expect(where.deletedAt).toBeNull();
    } finally {
      await app.close();
    }
  }, 60000);

  it('orders soonest scheduled send first, not newest first', async () => {
    const app = await buildApp();
    try {
      const res = await withTimeout(
        app.inject({ method: 'GET', url: '/emails?folderType=SCHEDULED' }),
        45000,
        'GET /emails?folderType=SCHEDULED (order)',
      );
      expect(res.statusCode).toBe(200);
      const orderBy = captured.orderBy as Array<Record<string, string>>;
      expect(orderBy[0]).toEqual({ sentAt: 'asc' });
    } finally {
      await app.close();
    }
  }, 60000);

  it('ignores the keyset cursor on this view (even a garbage cursor is 200)', async () => {
    const app = await buildApp();
    try {
      const res = await withTimeout(
        app.inject({ method: 'GET', url: '/emails?folderType=SCHEDULED&cursor=!!!garbage!!!' }),
        45000,
        'GET /emails?folderType=SCHEDULED&cursor=garbage',
      );
      // The cursor encodes the descending timeline ordering of the other
      // views; SCHEDULED orders by sentAt ascending, so a cursor would page
      // it wrongly — it is dropped, never decoded (garbage must not 400).
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).success).toBe(true);
    } finally {
      await app.close();
    }
  }, 60000);

  it('bridges scheduledAt from sentAt on queued rows, leaves delivered rows alone', async () => {
    const delivered = {
      ...QUEUED_ROW,
      id: 'sent1',
      deliveryStatus: 'delivered',
      sentAt: PAST,
      scheduledAt: undefined,
    };
    const app = await buildApp([QUEUED_ROW, delivered]);
    try {
      const res = await withTimeout(
        app.inject({ method: 'GET', url: '/emails?folderType=SCHEDULED' }),
        45000,
        'GET /emails?folderType=SCHEDULED (bridge)',
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const queued = body.data.find((r: any) => r.id === 'sched1');
      // The fire time is visible to the client as `scheduledAt` — the field
      // the client's Email type already declares.
      expect(queued).toBeDefined();
      expect(new Date(queued.scheduledAt).getTime()).toBe(FUTURE.getTime());
      const done = body.data.find((r: any) => r.id === 'sent1');
      // A delivered send's sentAt is history, not a schedule: no bridge.
      expect(done.scheduledAt).toBeUndefined();
    } finally {
      await app.close();
    }
  }, 60000);
});
