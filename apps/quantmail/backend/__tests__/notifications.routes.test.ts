// @vitest-environment node
// ============================================================================
// /notifications — retention wiring (the QM unbounded-accumulation fix).
//
//   1. GET / lazily prunes the CALLER's expired rows before listing: expired
//      rows disappear from the table, not just from the response; another
//      user's expired rows are never touched; null-expiresAt rows are never
//      touched.
//   2. DELETE / (clear-all) deletes the caller's rows only and reports the
//      real deleted count — no 200-over-nothing.
//   3. Auth is still mandatory on both.
//
// HARNESS: the REAL notificationRoutes on a bare Fastify app at the
// `/notifications` prefix `app.ts` mounts them under, with the REAL error
// handler. Prisma is an in-memory fake of the delegates these routes touch.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import notificationRoutes from '../routes/notifications';

interface NotifRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  isRead: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}

function seed(): NotifRow[] {
  // Relative to the real clock: the GET handler prunes with `new Date()`,
  // so fixtures must be expired/fresh relative to actual test time.
  const now = Date.now();
  return [
    {
      id: 'expired-mine', userId: 'u-1', type: 'new_email', title: 'old', isRead: false,
      expiresAt: new Date(now - 60 * 1000), createdAt: new Date(now - 40 * 86400000),
    },
    {
      id: 'null-ttl', userId: 'u-1', type: 'new_email', title: 'no ttl', isRead: false,
      expiresAt: null, createdAt: new Date(now),
    },
    {
      id: 'future', userId: 'u-1', type: 'new_email', title: 'fresh', isRead: false,
      expiresAt: new Date(now + 86400000), createdAt: new Date(now),
    },
    {
      id: 'expired-other', userId: 'u-2', type: 'new_email', title: 'theirs', isRead: false,
      expiresAt: new Date(now - 60 * 1000), createdAt: new Date(now - 40 * 86400000),
    },
  ];
}

function matchesActive(row: NotifRow, userId: string, now: Date): boolean {
  if (row.userId !== userId) return false;
  return row.expiresAt === null || row.expiresAt.getTime() > now.getTime();
}

function rowIsExpired(row: NotifRow, where: Record<string, unknown>): boolean {
  if (where.expiresAt === undefined || row.expiresAt === null) return false;
  const lte = (where.expiresAt as { lte: Date }).lte;
  return row.expiresAt.getTime() <= new Date(lte).getTime();
}

function fakePrisma() {
  const rows: NotifRow[] = [];
  return {
    rows,
    notification: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const now = new Date();
        return rows
          .filter((row) => matchesActive(row, String(where.userId), now))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const now = new Date();
        return rows.filter((row) => matchesActive(row, String(where.userId), now) && !row.isRead)
          .length;
      }),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        // Mirrors the real Prisma semantics for the three shapes these
        // routes issue: prune { userId, expiresAt: { lte } }, clear-all
        // { userId }, and delete-one { id, userId }.
        let count = 0;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          const row = rows[i]!;
          const idMatch = where.id === undefined || row.id === where.id;
          const userMatch = where.userId === undefined || row.userId === where.userId;
          const shapeMatch =
            where.id !== undefined
              ? idMatch && userMatch
              : userMatch && (where.expiresAt === undefined || rowIsExpired(row, where));
          if (shapeMatch) {
            rows.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      }),
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

describe('GET /notifications — retention', () => {
  beforeEach(async () => {
    await buildApp('u-1');
  });

  afterEach(async () => {
    await app.close();
  });

  it('prunes the caller\'s expired rows before listing, keeps null-TTL and future rows', async () => {
    const response = await app.inject({ method: 'GET', url: '/notifications' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    const ids = body.data.notifications.map((n: NotifRow) => n.id);
    expect(ids).toContain('null-ttl');
    expect(ids).toContain('future');
    expect(ids).not.toContain('expired-mine');
    // Physically removed, not just hidden: the prune targeted only the caller.
    expect(prisma.rows.some((r) => r.id === 'expired-mine')).toBe(false);
    expect(prisma.rows.some((r) => r.id === 'null-ttl')).toBe(true);
    expect(prisma.rows.some((r) => r.id === 'future')).toBe(true);
  });

  it('never prunes another user\'s expired rows', async () => {
    await app.inject({ method: 'GET', url: '/notifications' });
    expect(prisma.rows.some((r) => r.id === 'expired-other')).toBe(true);
  });

  it('requires auth', async () => {
    await buildApp(null);
    const response = await app.inject({ method: 'GET', url: '/notifications' });
    expect(response.statusCode).toBe(401);
  });
});

describe('DELETE /notifications — clear-all', () => {
  beforeEach(async () => {
    await buildApp('u-1');
  });

  afterEach(async () => {
    await app.close();
  });

  it('deletes the caller\'s rows and reports the real count', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/notifications' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { deleted: 3 } });
    expect(prisma.rows.filter((r) => r.userId === 'u-1')).toHaveLength(0);
    // Another user's rows survive.
    expect(prisma.rows.filter((r) => r.userId === 'u-2')).toHaveLength(1);
  });

  it('reports 0 when there is nothing to delete', async () => {
    prisma.rows.length = 0;
    const response = await app.inject({ method: 'DELETE', url: '/notifications' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { deleted: 0 } });
  });

  it('requires auth', async () => {
    await buildApp(null);
    const response = await app.inject({ method: 'DELETE', url: '/notifications' });
    expect(response.statusCode).toBe(401);
  });
});
