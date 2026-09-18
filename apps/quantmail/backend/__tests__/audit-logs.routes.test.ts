import { describe, it, expect, beforeEach } from 'vitest';
import fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import auditLogsRoutes, { resetAuditLogsStore } from '../routes/audit-logs';

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

describe('Sovereign Immutable Audit Logs Routes (Task X06)', () => {
  beforeEach(() => {
    resetAuditLogsStore();
  });

  it('POST /audit-logs records an immutable audit log entry and returns status 201', async () => {
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

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.action).toBe('USER_ROLE_CHANGED');
    expect(body.data.resource).toBe('USER');
    expect(body.data.resourceId).toBe('target-user-99');
    expect(body.data.userId).toBe('admin-user-1');
    expect(body.data.metadata.oldRole).toBe('MEMBER');
  });

  it('GET /audit-logs lists audit log records with pagination', async () => {
    const app = await buildTestApp('admin-user-1');
    for (let i = 1; i <= 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/audit-logs',
        payload: {
          action: `ACTION_${i}`,
          resource: 'WORKSPACE',
          resourceId: `ws-${i}`,
        },
      });
    }

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
    const app = await buildTestApp('admin-user-1');
    await app.inject({
      method: 'POST',
      url: '/audit-logs',
      payload: { action: 'EXPORT_MBOX', resource: 'EMAIL' },
    });
    await app.inject({
      method: 'POST',
      url: '/audit-logs',
      payload: { action: 'DELETE_FILE', resource: 'DRIVE' },
    });

    const emailLogs = await app.inject({
      method: 'GET',
      url: '/audit-logs?resource=EMAIL',
    });
    expect(emailLogs.statusCode).toBe(200);
    expect(emailLogs.json().data.length).toBe(1);
    expect(emailLogs.json().data[0].action).toBe('EXPORT_MBOX');
  });

  it('strictly rejects PUT, PATCH, and DELETE with 403 AUDIT_LOG_IMMUTABLE', async () => {
    const app = await buildTestApp('admin-user-1');
    const createRes = await app.inject({
      method: 'POST',
      url: '/audit-logs',
      payload: { action: 'SECURITY_ALERT', resource: 'AUTH' },
    });
    const logId = createRes.json().data.id;

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
