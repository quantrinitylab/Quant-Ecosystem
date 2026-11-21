// ===========================================================================
// QC-F-101 — durable inbox read path regression tests (cases 9-15)
//
// The REAL notifications route plugin on a bare Fastify instance (the
// QC-F-021 pattern): a preHandler hook installs `request.auth` exactly the
// way the real auth plugin does, and the AppError mapping is mirrored.
// Prisma is an in-memory fake with stable module-level identities.
//
// Covers the new QC-F-101 endpoints only:
//   GET   /notifications          (inbox list)
//   POST  /notifications/read-all (mark all read)
//   PATCH /notifications/:id/read (mark one read)
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import notificationsRoutes from '../routes/notifications';

// Stable identities (module-level — no fresh-identity mocks).
const USER_R = { userId: 'user_inbox_r', username: 'rinbox' };
const USER_OTHER = { userId: 'user_inbox_other', username: 'oinbox' };

interface InboxRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  actionUrl: string | null;
  sourceApp: string | null;
  sourceUserId: string | null;
  sourceEntityId: string | null;
  data: unknown;
  isRead: boolean;
  readAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

function row(partial: Partial<InboxRow> & { id: string }): InboxRow {
  return {
    userId: USER_R.userId,
    type: 'message',
    title: 't',
    body: 'New message',
    imageUrl: null,
    actionUrl: '/chat/conv_x',
    sourceApp: 'quantchat',
    sourceUserId: 'user_sender',
    sourceEntityId: 'msg_x',
    data: {},
    isRead: false,
    readAt: null,
    expiresAt: null,
    createdAt: new Date(),
    ...partial,
  };
}

const T = Date.now();

// Seeded store: R's rows are n_r1 (newest, unread), n_r2 (unread,
// quantmail, future expiry), n_r3 (read); two rows belong to another user;
// n_exp is R's row but expired — it must never appear in a listing.
function seedRows(): InboxRow[] {
  return [
    row({ id: 'n_r1', createdAt: new Date(T - 10 * 60_000) }),
    row({
      id: 'n_r2',
      createdAt: new Date(T - 20 * 60_000),
      sourceApp: 'quantmail',
      expiresAt: new Date(T + 60 * 60_000),
    }),
    row({ id: 'n_r3', createdAt: new Date(T - 30 * 60_000), isRead: true }),
    row({ id: 'n_o1', userId: USER_OTHER.userId, createdAt: new Date(T - 5 * 60_000) }),
    row({ id: 'n_o2', userId: USER_OTHER.userId, createdAt: new Date(T - 6 * 60_000) }),
    row({
      id: 'n_exp',
      createdAt: new Date(T - 40 * 60_000),
      expiresAt: new Date(T - 60 * 60_000),
    }),
  ];
}

function matchesWhere(r: InboxRow, where: any): boolean {
  if (where.userId !== undefined && r.userId !== where.userId) return false;
  if (where.sourceApp !== undefined && r.sourceApp !== where.sourceApp) return false;
  if (where.isRead !== undefined && r.isRead !== where.isRead) return false;
  if (Array.isArray(where.OR)) {
    const ok = where.OR.some((cond: any) => {
      if (!('expiresAt' in cond)) return false;
      if (cond.expiresAt === null) return r.expiresAt === null;
      if (cond.expiresAt?.gt) {
        return r.expiresAt !== null && r.expiresAt > cond.expiresAt.gt;
      }
      return false;
    });
    if (!ok) return false;
  }
  return true;
}

function makeInboxFakePrisma(initial: InboxRow[] = []) {
  const rows = initial.map((r) => ({ ...r }));
  const calls = { findMany: 0, count: 0, findUnique: 0, update: 0, updateMany: 0 };

  const notification = {
    async findMany({ where, orderBy, take }: any) {
      calls.findMany++;
      let out = rows.filter((r) => matchesWhere(r, where));
      if (orderBy?.createdAt === 'desc') {
        out = [...out].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (typeof take === 'number') out = out.slice(0, take);
      return out.map((r) => ({ ...r }));
    },
    async count({ where }: any) {
      calls.count++;
      return rows.filter((r) => matchesWhere(r, where)).length;
    },
    async findUnique({ where }: any) {
      calls.findUnique++;
      const found = rows.find((r) => r.id === where.id);
      return found ? { ...found } : null;
    },
    async update({ where, data }: any) {
      calls.update++;
      const found = rows.find((r) => r.id === where.id);
      if (!found) throw new Error('not found');
      Object.assign(found, data);
      return { ...found };
    },
    async updateMany({ where, data }: any) {
      calls.updateMany++;
      let count = 0;
      for (const r of rows) {
        if (matchesWhere(r, where)) {
          Object.assign(r, data);
          count++;
        }
      }
      return { count };
    },
  };

  return { prisma: { notification }, calls, rows };
}

async function buildRouteApp(
  auth: { userId: string; username: string } | null,
  prisma: unknown,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
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
  await app.register(notificationsRoutes, { prefix: '/notifications' });
  await app.ready();
  return app;
}

describe('QC-F-101 GET /notifications inbox (cases 9-14)', () => {
  let app: FastifyInstance | null = null;
  let fake: ReturnType<typeof makeInboxFakePrisma>;

  beforeEach(() => {
    fake = makeInboxFakePrisma(seedRows());
    app = null;
  });
  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  async function asInbox(auth: { userId: string; username: string } | null, prisma?: unknown) {
    app = await buildRouteApp(auth, prisma ?? fake.prisma);
    return app;
  }

  // Case 9 — unauthenticated: 401, and the notification store is never read.
  it('case 9: GET /notifications without auth is 401 UNAUTHORIZED and reads nothing', async () => {
    const server = await asInbox(null);
    const res = await server.inject({ method: 'GET', url: '/notifications/' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
    expect(fake.calls.findMany).toBe(0);
    expect(fake.calls.count).toBe(0);
  });

  // Case 10 — only the caller's rows, newest-first, limit honoured.
  it('case 10: returns only the caller rows newest-first with limit/total/unreadCount', async () => {
    const server = await asInbox(USER_R);
    const res = await server.inject({ method: 'GET', url: '/notifications/' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.notifications.map((n: InboxRow) => n.id)).toEqual(['n_r1', 'n_r2', 'n_r3']);
    expect(data.total).toBe(3);
    expect(data.unreadCount).toBe(2);
  });

  it('case 10: limit=2 returns two rows but the full total and unreadCount', async () => {
    const server = await asInbox(USER_R);
    const res = await server.inject({ method: 'GET', url: '/notifications/?limit=2' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.notifications.map((n: InboxRow) => n.id)).toEqual(['n_r1', 'n_r2']);
    expect(data.total).toBe(3);
    expect(data.unreadCount).toBe(2);
  });

  // Case 11 — sourceApp + unreadOnly filters (and unreadCount follows them).
  it('case 11: ?sourceApp=quantmail filters rows and the unreadCount', async () => {
    const server = await asInbox(USER_R);
    const res = await server.inject({ method: 'GET', url: '/notifications/?sourceApp=quantmail' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.notifications.map((n: InboxRow) => n.id)).toEqual(['n_r2']);
    expect(data.total).toBe(1);
    expect(data.unreadCount).toBe(1);
  });

  it('case 11: ?unreadOnly=true returns only unread rows', async () => {
    const server = await asInbox(USER_R);
    const res = await server.inject({ method: 'GET', url: '/notifications/?unreadOnly=true' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.notifications.map((n: InboxRow) => n.id)).toEqual(['n_r1', 'n_r2']);
    expect(data.total).toBe(2);
    expect(data.unreadCount).toBe(2);
  });

  it('case 11: ?unreadOnly=false is NOT coerced to true (only true/\'true\' counts)', async () => {
    const server = await asInbox(USER_R);
    const res = await server.inject({ method: 'GET', url: '/notifications/?unreadOnly=false' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.notifications.map((n: InboxRow) => n.id)).toEqual([
      'n_r1',
      'n_r2',
      'n_r3',
    ]);
  });

  // Case 12 — expired rows never list.
  it('case 12: expired rows never appear in the list', async () => {
    const server = await asInbox(USER_R);
    const res = await server.inject({ method: 'GET', url: '/notifications/?limit=100' });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.notifications.map((n: InboxRow) => n.id);
    expect(ids).not.toContain('n_exp');
    expect(ids).toContain('n_r1');
    expect(ids).toContain('n_r2'); // future expiry is listed
    expect(res.json().data.total).toBe(3);
  });

  // Case 13 — invalid limits are 400, never silently clamped.
  it.each(['0', '500', 'abc'])(
    'case 13: ?limit=%s is 400 VALIDATION_ERROR',
    async (limit) => {
      const server = await asInbox(USER_R);
      const res = await server.inject({ method: 'GET', url: `/notifications/?limit=${limit}` });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    },
  );

  // Case 14 — honest empty vs missing DB.
  it('case 14: a genuinely empty inbox is 200 with zero counts', async () => {
    fake = makeInboxFakePrisma([]);
    const server = await asInbox(USER_R);
    const res = await server.inject({ method: 'GET', url: '/notifications/' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { notifications: [], unreadCount: 0, total: 0 },
    });
  });

  it('case 14: a prisma without the notification delegate is 503 DB_UNAVAILABLE, not an empty list', async () => {
    const server = await asInbox(USER_R, {}); // no notification delegate at all
    const res = await server.inject({ method: 'GET', url: '/notifications/' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'DB_UNAVAILABLE' } });
  });
});

describe('QC-F-101 mark-read authority (case 15)', () => {
  let app: FastifyInstance | null = null;
  let fake: ReturnType<typeof makeInboxFakePrisma>;

  beforeEach(() => {
    fake = makeInboxFakePrisma(seedRows());
    app = null;
  });
  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  async function asInbox(auth: { userId: string; username: string }) {
    app = await buildRouteApp(auth, fake.prisma);
    return app;
  }

  it('case 15: PATCH marks the caller\'s own row read (isRead + readAt)', async () => {
    const server = await asInbox(USER_R);
    const res = await server.inject({ method: 'PATCH', url: '/notifications/n_r1/read' });
    expect(res.statusCode).toBe(200);
    const updated = res.json().data;
    expect(updated.id).toBe('n_r1');
    expect(updated.isRead).toBe(true);
    expect(updated.readAt).not.toBeNull();
    expect(fake.rows.find((r) => r.id === 'n_r1')!.isRead).toBe(true);
  });

  it('case 15: PATCH on another user\'s row is 404, not 403 — existence does not leak', async () => {
    const server = await asInbox(USER_R);
    const res = await server.inject({ method: 'PATCH', url: '/notifications/n_o1/read' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'NOTIFICATION_NOT_FOUND' },
    });
    expect(fake.rows.find((r) => r.id === 'n_o1')!.isRead).toBe(false);
  });

  it('case 15: PATCH on a missing id is 404', async () => {
    const server = await asInbox(USER_R);
    const res = await server.inject({ method: 'PATCH', url: '/notifications/n_missing/read' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'NOTIFICATION_NOT_FOUND' },
    });
  });

  it('case 15: PATCH on an already-read row is idempotent (200, same row, no rewrite)', async () => {
    const server = await asInbox(USER_R);
    const res = await server.inject({ method: 'PATCH', url: '/notifications/n_r3/read' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe('n_r3');
    expect(res.json().data.isRead).toBe(true);
    expect(fake.calls.update).toBe(0);
  });

  it('case 15: POST read-all flips only the caller\'s unread rows and reports the count', async () => {
    const server = await asInbox(USER_R);
    const res = await server.inject({ method: 'POST', url: '/notifications/read-all' });
    expect(res.statusCode).toBe(200);
    // n_r1, n_r2 unread; n_r3 already read; n_exp unread but expired — the
    // route's updateMany carries no expiry filter (QuantMail parity).
    expect(res.json().data.updated).toBe(3);
    for (const r of fake.rows) {
      if (r.userId === USER_R.userId) expect(r.isRead).toBe(true);
    }
    // The other user's rows are untouched.
    expect(fake.rows.find((r) => r.id === 'n_o1')!.isRead).toBe(false);
    expect(fake.rows.find((r) => r.id === 'n_o2')!.isRead).toBe(false);
  });
});
