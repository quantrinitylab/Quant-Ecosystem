import { describe, it, expect, beforeEach } from 'vitest';
import fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import auditLogsRoutes, { resetAuditLogsStore } from '../routes/audit-logs';
import { AuditService } from '../services/audit.service';

interface TestAuthContext {
  userId?: string;
  role?: string;
  orgId?: string;
  orgRole?: string;
}

async function buildTestApp(auth?: TestAuthContext) {
  const app = fastify();
  await app.register(errorHandlerPlugin);
  app.addHook('preHandler', async (req) => {
    if (auth?.userId) {
      (req as unknown as { auth?: TestAuthContext }).auth = auth;
    }
  });
  await app.register(auditLogsRoutes, { prefix: '/audit-logs' });
  await app.ready();
  return app;
}

describe('Task W33-02: Tenant Authorization Hardening for Enterprise Audit Logs', () => {
  beforeEach(() => {
    resetAuditLogsStore();
  });

  describe('Authentication & Role Authorization Gate', () => {
    it('returns 401 UNAUTHORIZED when no authentication session exists', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/audit-logs',
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN_ORGANIZATION_ACCESS for non-admin tokens (MEMBER / USER)', async () => {
      const app = await buildTestApp({
        userId: 'regular-user-123',
        role: 'USER',
        orgId: 'tenant-alpha',
        orgRole: 'MEMBER',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/audit-logs?orgId=tenant-alpha',
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN_ORGANIZATION_ACCESS');
    });

    it('returns 403 FORBIDDEN_ORGANIZATION_ACCESS on cross-tenant query attempts', async () => {
      const app = await buildTestApp({
        userId: 'admin-tenant-alpha',
        role: 'ADMIN',
        orgId: 'tenant-alpha',
      });

      // Attempting to query logs of tenant-beta with a tenant-alpha admin token
      const res = await app.inject({
        method: 'GET',
        url: '/audit-logs?orgId=tenant-beta',
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN_ORGANIZATION_ACCESS');
    });

    it('allows GET /audit-logs for authenticated ADMIN within session org', async () => {
      const app = await buildTestApp({
        userId: 'admin-user-1',
        role: 'ADMIN',
        orgId: 'tenant-alpha',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/audit-logs',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('allows GET /audit-logs for authenticated AUDITOR role', async () => {
      const app = await buildTestApp({
        userId: 'auditor-user-42',
        role: 'AUDITOR',
        orgId: 'tenant-alpha',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/audit-logs?orgId=tenant-alpha',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('Multi-Tenant Data Isolation & Cursor-Based Pagination', () => {
    it('strictly isolates audit logs by orgId, preventing cross-tenant data leakage', async () => {
      const appAlpha = await buildTestApp({
        userId: 'admin-alpha',
        role: 'ADMIN',
        orgId: 'tenant-alpha',
      });

      // Seed audit entries for tenant-alpha
      await appAlpha.inject({
        method: 'POST',
        url: '/audit-logs',
        payload: {
          action: 'POLICY_CREATED',
          resource: 'RETENTION_POLICY',
          orgId: 'tenant-alpha',
        },
      });

      // Seed audit entries for tenant-beta
      const appBeta = await buildTestApp({
        userId: 'admin-beta',
        role: 'ADMIN',
        orgId: 'tenant-beta',
      });
      await appBeta.inject({
        method: 'POST',
        url: '/audit-logs',
        payload: {
          action: 'LEGAL_HOLD_PLACED',
          resource: 'LEGAL_HOLD',
          orgId: 'tenant-beta',
        },
      });

      // Query as tenant-alpha admin
      const resAlpha = await appAlpha.inject({
        method: 'GET',
        url: '/audit-logs',
      });

      expect(resAlpha.statusCode).toBe(200);
      const dataAlpha = resAlpha.json().data;
      expect(dataAlpha.length).toBe(1);
      expect(dataAlpha[0].action).toBe('POLICY_CREATED');
      expect(dataAlpha[0].orgId).toBe('tenant-alpha');

      // Query as tenant-beta admin
      const resBeta = await appBeta.inject({
        method: 'GET',
        url: '/audit-logs',
      });

      expect(resBeta.statusCode).toBe(200);
      const dataBeta = resBeta.json().data;
      expect(dataBeta.length).toBe(1);
      expect(dataBeta[0].action).toBe('LEGAL_HOLD_PLACED');
      expect(dataBeta[0].orgId).toBe('tenant-beta');
    });

    it('supports cursor-based pagination with limit and nextCursor', async () => {
      const app = await buildTestApp({
        userId: 'admin-user-cursor',
        role: 'ADMIN',
        orgId: 'tenant-cursor',
      });

      // Create 5 log records
      const ids: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const createRes = await app.inject({
          method: 'POST',
          url: '/audit-logs',
          payload: {
            action: `EVENT_${i}`,
            resource: 'RESOURCE',
            orgId: 'tenant-cursor',
          },
        });
        ids.push(createRes.json().data.id);
      }

      // Fetch page 1 with limit 2
      const firstPage = await app.inject({
        method: 'GET',
        url: '/audit-logs?limit=2',
      });

      expect(firstPage.statusCode).toBe(200);
      const firstBody = firstPage.json();
      expect(firstBody.data.length).toBe(2);
      expect(firstBody.nextCursor).toBeDefined();
      expect(firstBody.nextCursor).toBeTruthy();

      // Fetch page 2 using cursor
      const secondPage = await app.inject({
        method: 'GET',
        url: `/audit-logs?limit=2&cursor=${firstBody.nextCursor}`,
      });

      expect(secondPage.statusCode).toBe(200);
      const secondBody = secondPage.json();
      expect(secondBody.data.length).toBe(2);
      // Ensure no duplicate items across pages
      const firstIds = new Set(firstBody.data.map((d: any) => d.id));
      for (const item of secondBody.data) {
        expect(firstIds.has(item.id)).toBe(false);
      }
    });

    it('verifies AuditService passes orgId in where clause to Prisma findMany', async () => {
      let capturedArgs: any = null;
      const mockPrisma: any = {
        auditLog: {
          findMany: async (args: any) => {
            capturedArgs = args;
            return [];
          },
          count: async () => 0,
        },
      };

      const auditService = new AuditService(mockPrisma);
      await auditService.queryLogs({
        orgId: 'tenant-scoped-99',
        limit: 10,
        cursor: 'cursor-abc',
      });

      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.where.orgId).toBe('tenant-scoped-99');
      expect(capturedArgs.cursor).toEqual({ id: 'cursor-abc' });
      expect(capturedArgs.take).toBe(11);
    });
  });
});
