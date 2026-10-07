import { describe, it, expect, beforeEach } from 'vitest';
import fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import auditLogsRoutes, {
  resetAuditLogsStore,
  appendServerAuditRecord,
} from '../routes/audit-logs';

async function buildTestApp(userId?: string) {
  const app = fastify();
  await app.register(errorHandlerPlugin);
  app.addHook('preHandler', async (req) => {
    if (userId) {
      (req as unknown as { auth?: { userId?: string } }).auth = { userId };
    }
  });
  await app.register(auditLogsRoutes, { prefix: '/audit-logs' });
  await app.ready();
  return app;
}

// K9 (M20): client-writable audit entries were closed. Tests seed the store
// through `appendServerAuditRecord` — the server-side-only write path that
// trusted backend code (e.g. the admin mutations in `routes/admin.ts`) uses.
function seedServerRecord(overrides?: Partial<Parameters<typeof appendServerAuditRecord>[0]>) {
  return appendServerAuditRecord({
    userId: 'admin-user-1',
    orgId: null,
    action: 'SEED_ACTION',
    resource: 'SEED_RESOURCE',
    resourceId: null,
    metadata: {},
    ip: '127.0.0.1',
    userAgent: 'test',
    ...overrides,
  });
}

describe('Sovereign Immutable Audit Logs Routes (Task X06, K9-hardened)', () => {
  beforeEach(() => {
    resetAuditLogsStore();
  });

  it('POST /audit-logs is closed: client writes return 405 AUDIT_LOG_CLIENT_WRITE_DISABLED', async () => {
    const app = await buildTestApp('admin-user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/audit-logs',
      payload: {
        action: 'USER_ROLE_CHANGED',
        resource: 'USER',
        resourceId: 'target-user-99',
        metadata: { oldRole: 'MEMBER', newRole: 'ADMIN' },
      },
    });

    expect(res.statusCode).toBe(405);
    expect(res.json().error.code).toBe('AUDIT_LOG_CLIENT_WRITE_DISABLED');
  });

  it('server-side records are listed by GET with pagination', async () => {
    for (let i = 1; i <= 5; i++) {
      seedServerRecord({
        action: `ACTION_${i}`,
        resource: 'WORKSPACE',
        resourceId: `ws-${i}`,
      });
    }
    const app = await buildTestApp('admin-user-1');

    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs?page=1&limit=3',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(3);
    expect(body.pagination.total).toBe(5);
    expect(body.pagination.totalPages).toBe(2);
  });

  it('GET /audit-logs filters records by action and resource', async () => {
    seedServerRecord({ action: 'EXPORT_MBOX', resource: 'EMAIL' });
    seedServerRecord({ action: 'DELETE_FILE', resource: 'DRIVE' });
    const app = await buildTestApp('admin-user-1');

    const emailLogs = await app.inject({
      method: 'GET',
      url: '/audit-logs?resource=EMAIL',
    });
    expect(emailLogs.statusCode).toBe(200);
    expect(emailLogs.json().data.length).toBe(1);
    expect(emailLogs.json().data[0].action).toBe('EXPORT_MBOX');
  });

  it('strictly rejects PUT, PATCH, and DELETE with 403 AUDIT_LOG_IMMUTABLE', async () => {
    const record = seedServerRecord({ action: 'SECURITY_ALERT', resource: 'AUTH' });
    const app = await buildTestApp('admin-user-1');
    const logId = record.id;

    // Reject PUT
    const putRes = await app.inject({
      method: 'PUT',
      url: `/audit-logs/${logId}`,
      payload: { action: 'MODIFIED_ACTION' },
    });
    expect(putRes.statusCode).toBe(403);
    expect(putRes.json().error.code).toBe('AUDIT_LOG_IMMUTABLE');

    // Reject PATCH
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/audit-logs/${logId}`,
      payload: { action: 'MODIFIED_ACTION' },
    });
    expect(patchRes.statusCode).toBe(403);
    expect(patchRes.json().error.code).toBe('AUDIT_LOG_IMMUTABLE');

    // Reject DELETE
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/audit-logs/${logId}`,
    });
    expect(delRes.statusCode).toBe(403);
    expect(delRes.json().error.code).toBe('AUDIT_LOG_IMMUTABLE');
  });

  it('rejects unauthenticated calls to audit logs with 401', async () => {
    const app = await buildTestApp(); // No userId
    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs',
    });
    expect(res.statusCode).toBe(401);
  });
});
