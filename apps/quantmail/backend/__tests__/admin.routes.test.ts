import { describe, it, expect } from 'vitest';
import fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import adminRoutes from '../routes/admin';

/**
 * Deterministic Prisma stub for the read-only admin KPIs. Records the `where`
 * clauses so the tests can assert the query shape (24h windows, non-deleted
 * files) without a live database — the box can't run Postgres.
 */
function makePrisma() {
  const calls: Record<string, any> = {};
  return {
    calls,
    user: { count: async () => 1234 },
    session: {
      count: async (args: any) => {
        calls.sessionWhere = args?.where;
        return 56;
      },
    },
    file: {
      aggregate: async (args: any) => {
        calls.fileAggWhere = args?.where;
        return { _sum: { size: 987654321 } };
      },
      count: async (args: any) => {
        calls.fileCountWhere = args?.where;
        return 42;
      },
    },
    deliveryAttempt: {
      groupBy: async (args: any) => {
        calls.groupBy = args;
        return [
          { status: 'sent', _count: 900 },
          { status: 'bounced', _count: 100 },
          { status: 'deferred', _count: 20 },
          { status: 'queued', _count: 5 },
        ];
      },
    },
  };
}

async function buildTestApp(opts?: { userId?: string; role?: string }) {
  const app = fastify();
  await app.register(errorHandlerPlugin);
  const prisma = makePrisma();
  app.decorate('prisma', prisma);
  app.addHook('preHandler', async (req) => {
    if (opts?.userId) {
      (req as unknown as { auth?: unknown }).auth = { userId: opts.userId, role: opts.role };
    }
  });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.ready();
  return { app, prisma };
}

const ENDPOINTS = [
  '/admin/accounts/count',
  '/admin/sessions/active',
  '/admin/storage/summary',
  '/admin/mail/deliverability',
];

describe('QuantMail per-app Admin API (Phase 1 pilot backend)', () => {
  describe('authorization — fails closed', () => {
    it.each(ENDPOINTS)('returns 401 for an unauthenticated request to %s', async (url) => {
      const { app } = await buildTestApp();
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it.each(ENDPOINTS)('returns 403 for a signed-in non-staff (USER) request to %s', async (url) => {
      const { app } = await buildTestApp({ userId: 'u-1', role: 'USER' });
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('admits MODERATOR as staff (case-insensitive role)', async () => {
      const { app } = await buildTestApp({ userId: 'mod-1', role: 'moderator' });
      const res = await app.inject({ method: 'GET', url: '/admin/accounts/count' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('KPI endpoints — staff (ADMIN)', () => {
    it('GET /admin/accounts/count returns the total account count', async () => {
      const { app } = await buildTestApp({ userId: 'a-1', role: 'ADMIN' });
      const res = await app.inject({ method: 'GET', url: '/admin/accounts/count' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true, data: { total: 1234 } });
    });

    it('GET /admin/sessions/active counts only live, unexpired, recent sessions', async () => {
      const { app, prisma } = await buildTestApp({ userId: 'a-1', role: 'ADMIN' });
      const res = await app.inject({ method: 'GET', url: '/admin/sessions/active' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.active).toBe(56);
      expect(body.data.windowHours).toBe(24);
      expect(prisma.calls.sessionWhere.isActive).toBe(true);
      expect(prisma.calls.sessionWhere.expiresAt.gt).toBeInstanceOf(Date);
      expect(prisma.calls.sessionWhere.lastActivityAt.gte).toBeInstanceOf(Date);
    });

    it('GET /admin/storage/summary sums bytes over non-deleted files', async () => {
      const { app, prisma } = await buildTestApp({ userId: 'a-1', role: 'ADMIN' });
      const res = await app.inject({ method: 'GET', url: '/admin/storage/summary' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ usedBytes: 987654321, fileCount: 42 });
      expect(prisma.calls.fileAggWhere.isDeleted).toBe(false);
      expect(prisma.calls.fileCountWhere.isDeleted).toBe(false);
    });

    it('GET /admin/mail/deliverability rates success over resolved attempts only', async () => {
      const { app, prisma } = await buildTestApp({ userId: 'a-1', role: 'ADMIN' });
      const res = await app.inject({ method: 'GET', url: '/admin/mail/deliverability' });
      expect(res.statusCode).toBe(200);
      const { data } = res.json();
      // 900 sent, 100 bounced, 20 deferred, 5 queued.
      expect(data.total).toBe(1025);
      expect(data.sent).toBe(900);
      expect(data.bounced).toBe(100);
      // resolved = sent + bounced = 1000 → 900/1000 = 0.9 (in-flight excluded).
      expect(data.successRate).toBeCloseTo(0.9, 10);
      expect(data.windowHours).toBe(24);
      expect(prisma.calls.groupBy.by).toEqual(['status']);
      expect(prisma.calls.groupBy.where.attemptedAt.gte).toBeInstanceOf(Date);
    });

    it('reports a null success rate when no attempts have resolved', async () => {
      const app = fastify();
      await app.register(errorHandlerPlugin);
      app.decorate('prisma', {
        deliveryAttempt: {
          groupBy: async () => [
            { status: 'queued', _count: 3 },
            { status: 'deferred', _count: 2 },
          ],
        },
      });
      app.addHook('preHandler', async (req) => {
        (req as unknown as { auth?: unknown }).auth = { userId: 'a-1', role: 'ADMIN' };
      });
      await app.register(adminRoutes, { prefix: '/admin' });
      await app.ready();
      const res = await app.inject({ method: 'GET', url: '/admin/mail/deliverability' });
      expect(res.statusCode).toBe(200);
      const { data } = res.json();
      expect(data.total).toBe(5);
      expect(data.successRate).toBeNull();
    });
  });
});
