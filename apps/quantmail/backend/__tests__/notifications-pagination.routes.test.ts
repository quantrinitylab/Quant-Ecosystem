// @vitest-environment node
// ============================================================================
// GET /notifications — cursor pagination (QM notifications-pagination fix).
//
// The center used to be hard-capped at one `limit` window while
// `unreadCount` counted ALL unread, so rows beyond the newest window were
// unreachable in the UI. The fix is opaque cursor paging: each page returns
// `hasMore` + `nextCursor`, and the next page continues strictly below the
// cursor row (createdAt desc, id desc tiebreak) — never an offset, so rows
// inserted between pages cannot shift a page boundary.
//
// HARNESS: the REAL notificationRoutes on a bare Fastify app, with the REAL
// error handler. Prisma is an in-memory fake that honors the query shapes
// these routes issue: userId + active-TTL filter, the cursor AND/OR
// predicate, orderBy, take, and the isRead count filter.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import notificationRoutes from '../routes/notifications';

interface NotifRow {
  id: string;
  userId: string;
  title: string;
  isRead: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}

const NOW = Date.now();

function row(
  id: string,
  userId: string,
  minutesAgo: number,
  isRead = false,
): NotifRow {
  return {
    id,
    userId,
    title: id,
    isRead,
    expiresAt: null,
    createdAt: new Date(NOW - minutesAgo * 60 * 1000),
  };
}

function seed(): NotifRow[] {
  return [
    row('n1', 'u-1', 1),
    row('n2', 'u-1', 2),
    // Another user's row interleaved in time: paging must never surface it.
    row('other', 'u-2', 3),
    row('n3', 'u-1', 4),
    row('n4', 'u-1', 5, true), // read: excluded from unreadCount, kept in pages
    row('n5', 'u-1', 6),
  ];
}

type Where = Record<string, unknown>;

function asDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function matchesActive(rowValue: NotifRow, where: Where, now: Date): boolean {
  if (where.userId !== undefined && rowValue.userId !== where.userId) return false;
  // Active filter arrives as OR: [{ expiresAt: null }, { expiresAt: { gt: now } }].
  const or = where.OR as Array<Record<string, unknown>> | undefined;
  if (or) {
    const ok = or.some((clause) => {
      if (clause.expiresAt === null) return rowValue.expiresAt === null;
      const gt = (clause.expiresAt as { gt?: unknown } | undefined)?.gt;
      return gt !== undefined && rowValue.expiresAt !== null && rowValue.expiresAt.getTime() > asDate(gt).getTime();
    });
    if (!ok) return false;
  }
  // Cursor predicate arrives as AND: [{ OR: [{ createdAt: { lt } },
  // { createdAt, id: { lt } }] }].
  const and = where.AND as Array<Record<string, unknown>> | undefined;
  if (and) {
    for (const clause of and) {
      const cursorOr = clause.OR as Array<Record<string, unknown>> | undefined;
      if (!cursorOr) continue;
      const ok = cursorOr.some((c) => {
        const lt = (c.createdAt as { lt?: unknown } | undefined)?.lt;
        if (lt !== undefined) return rowValue.createdAt.getTime() < asDate(lt).getTime();
        const eq = c.createdAt;
        const idLt = (c.id as { lt?: unknown } | undefined)?.lt;
        return (
          eq !== undefined &&
          rowValue.createdAt.getTime() === asDate(eq).getTime() &&
          idLt !== undefined &&
          rowValue.id < String(idLt)
        );
      });
      if (!ok) return false;
    }
  }
  if (where.isRead !== undefined && rowValue.isRead !== where.isRead) return false;
  return true;
}

function fakePrisma() {
  const rows: NotifRow[] = [];
  return {
    rows,
    notification: {
      findMany: vi.fn(async ({ where, take }: { where: Where; take?: number }) => {
        const now = new Date();
        const sorted = rows
          .filter((r) => matchesActive(r, where, now))
          .sort((a, b) => {
            if (b.createdAt.getTime() !== a.createdAt.getTime()) {
              return b.createdAt.getTime() - a.createdAt.getTime();
            }
            return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
          });
        return take === undefined ? sorted : sorted.slice(0, take);
      }),
      count: vi.fn(async ({ where }: { where: Where }) => {
        const now = new Date();
        return rows.filter((r) => matchesActive(r, where, now)).length;
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
}

type FakePrisma = ReturnType<typeof fakePrisma>;
let prisma: FakePrisma;
let app: ReturnType<typeof Fastify>;

async function buildApp(userId: string | null = 'u-1') {
  prisma = fakePrisma();
  prisma.rows.push(...seed());
  app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request: FastifyRequest) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  return app;
}

async function getPage(url: string) {
  const response = await app.inject({ method: 'GET', url });
  return { status: response.statusCode, body: response.json() };
}

describe('GET /notifications — cursor pagination', () => {
  beforeEach(async () => {
    await buildApp('u-1');
  });

  afterEach(async () => {
    await app.close();
  });

  it('pages through every row with no overlap and no gap', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const url = cursor
        ? `/notifications?limit=2&cursor=${encodeURIComponent(cursor)}`
        : '/notifications?limit=2';
      const { status, body } = await getPage(url);
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      const ids = body.data.notifications.map((n: NotifRow) => n.id);
      expect(ids).toHaveLength(page < 2 ? 2 : 1);
      for (const id of ids) expect(seen).not.toContain(id);
      seen.push(...ids);
      if (!body.data.hasMore) {
        expect(body.data.nextCursor).toBeNull();
        break;
      }
      expect(typeof body.data.nextCursor).toBe('string');
      cursor = body.data.nextCursor;
    }
    expect(seen).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
    // The other user's interleaved row never leaks into any page.
    expect(seen).not.toContain('other');
  });

  it('reports the global unreadCount and totalCount on every page, not the page count', async () => {
    const first = await getPage('/notifications?limit=2');
    expect(first.body.data.unreadCount).toBe(4); // n1, n2, n3, n5 (n4 is read)
    expect(first.body.data.totalCount).toBe(5);
    const second = await getPage(
      `/notifications?limit=2&cursor=${encodeURIComponent(first.body.data.nextCursor)}`,
    );
    expect(second.body.data.unreadCount).toBe(4);
    expect(second.body.data.totalCount).toBe(5);
  });

  it('returns everything in one page when no cursor/limit pressure applies', async () => {
    const { status, body } = await getPage('/notifications');
    expect(status).toBe(200);
    expect(body.data.notifications.map((n: NotifRow) => n.id)).toEqual([
      'n1',
      'n2',
      'n3',
      'n4',
      'n5',
    ]);
    expect(body.data.hasMore).toBe(false);
    expect(body.data.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor with 400, never a 500 or a silent reset', async () => {
    const { status, body } = await getPage('/notifications?cursor=!!!not-base64!!!');
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('requires auth on paged requests too', async () => {
    await buildApp(null);
    const { status } = await getPage('/notifications?limit=2');
    expect(status).toBe(401);
  });
});
