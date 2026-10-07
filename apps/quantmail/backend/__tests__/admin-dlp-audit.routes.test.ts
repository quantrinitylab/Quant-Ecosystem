import { describe, it, expect } from 'vitest';
import fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import adminRoutes from '../routes/admin';

/**
 * K9 (M20 Admin DLP/Audit) — staff-gated audit log viewer tests.
 *
 * `GET /admin/audit/logs` is the read-only viewer backing the M20 screen.
 * Unlike `/audit-logs` (tenant-scoped, ADMIN/AUDITOR/OWNER), staff
 * (ADMIN + MODERATOR) can query across organizations and optionally scope with
 * `organizationId`/`orgId`. All rows come from the deterministic Prisma stub.
 */

function makeAuditPrisma(entries: any[]) {
  const matches = (entry: any, where: any): boolean => {
    if (!where) return true;
    if (where.orgId && entry.orgId !== where.orgId) return false;
    if (where.userId && entry.userId !== where.userId) return false;
    if (
      where.action?.contains &&
      !entry.action.toLowerCase().includes(String(where.action.contains).toLowerCase())
    )
      return false;
    if (
      where.resource?.contains &&
      !entry.resource.toLowerCase().includes(String(where.resource.contains).toLowerCase())
    )
      return false;
    if (where.timestamp?.gte && new Date(entry.timestamp) < new Date(where.timestamp.gte))
      return false;
    if (where.timestamp?.lte && new Date(entry.timestamp) > new Date(where.timestamp.lte))
      return false;
    return true;
  };
  const sorted = () =>
    [...entries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  return {
    auditLog: {
      findMany: async (args: any) => {
        let rows = sorted().filter((e) => matches(e, args?.where));
        if (args?.cursor?.id) {
          const index = rows.findIndex((r) => r.id === args.cursor.id);
          rows = index >= 0 ? rows.slice(index + 1) : rows;
        } else if (args?.skip) {
          rows = rows.slice(args.skip);
        }
        if (args?.take) rows = rows.slice(0, args.take);
        return rows;
      },
      count: async (args: any) => sorted().filter((e) => matches(e, args?.where)).length,
    },
  };
}

const SEED = [
  {
    id: 'a1',
    userId: 'admin-1',
    orgId: 'org-1',
    action: 'admin.mail.domain.register',
    resource: 'mail_domain',
    resourceId: 'dom-1',
    metadata: {},
    ip: '127.0.0.1',
    userAgent: 'test',
    timestamp: new Date('2026-10-08T10:00:00Z'),
    createdAt: new Date('2026-10-08T10:00:00Z'),
  },
  {
    id: 'a2',
    userId: 'admin-1',
    orgId: 'org-1',
    action: 'admin.mail.domain.verify',
    resource: 'mail_domain',
    resourceId: 'dom-1',
    metadata: {},
    ip: '127.0.0.1',
    userAgent: 'test',
    timestamp: new Date('2026-10-08T11:00:00Z'),
    createdAt: new Date('2026-10-08T11:00:00Z'),
  },
  {
    id: 'a3',
    userId: 'admin-2',
    orgId: 'org-2',
    action: 'EXPORT_MBOX',
    resource: 'EMAIL',
    resourceId: null,
    metadata: {},
    ip: '127.0.0.1',
    userAgent: 'test',
    timestamp: new Date('2026-10-08T12:00:00Z'),
    createdAt: new Date('2026-10-08T12:00:00Z'),
  },
];

async function buildTestApp(opts?: { userId?: string; role?: string }) {
  const app = fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', makeAuditPrisma(SEED) as unknown as never);
  app.addHook('preHandler', async (req) => {
    if (opts?.userId) {
      (req as unknown as { auth?: unknown }).auth = { userId: opts.userId, role: opts.role };
    }
  });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.ready();
  return app;
}

describe('K9 M20 — GET /admin/audit/logs', () => {
  it('returns 401 for an unauthenticated request', async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/admin/audit/logs' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 for a signed-in non-staff (USER) request', async () => {
    const app = await buildTestApp({ userId: 'user-1', role: 'USER' });
    const res = await app.inject({ method: 'GET', url: '/admin/audit/logs' });
    expect(res.statusCode).toBe(403);
  });

  it('lets MODERATOR staff view the log (AdminGuard parity)', async () => {
    const app = await buildTestApp({ userId: 'mod-1', role: 'MODERATOR' });
    const res = await app.inject({ method: 'GET', url: '/admin/audit/logs' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(3);
  });

  it('returns entries newest-first with pagination metadata', async () => {
    const app = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
    const res = await app.inject({ method: 'GET', url: '/admin/audit/logs?limit=2' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe('a3');
    expect(body.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(body.nextCursor).toBe('a2');
  });

  it('scopes by organizationId when given', async () => {
    const app = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/audit/logs?organizationId=org-1',
    });
    expect(res.json().data.map((e: any) => e.id)).toEqual(['a2', 'a1']);
    expect(res.json().pagination.total).toBe(2);
  });

  it('filters by action and resource substrings', async () => {
    const app = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/audit/logs?action=domain.verify&resource=mail_domain',
    });
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('a2');
  });

  it('filters by userId and date range', async () => {
    const app = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/audit/logs?userId=admin-1&from=2026-10-08T10:30:00Z&to=2026-10-08T11:30:00Z',
    });
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('a2');
  });

  it('returns an empty list (not an error) when nothing matches', async () => {
    const app = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
    const res = await app.inject({ method: 'GET', url: '/admin/audit/logs?action=NOPE' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(res.json().pagination.total).toBe(0);
  });

  it('rejects an invalid limit with 400', async () => {
    const app = await buildTestApp({ userId: 'admin-1', role: 'ADMIN' });
    const res = await app.inject({ method: 'GET', url: '/admin/audit/logs?limit=500' });
    expect(res.statusCode).toBe(400);
  });
});
