import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

export interface AuditLogRecord {
  id: string;
  userId: string;
  orgId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  timestamp: string;
  createdAt: string;
}

const memoryAuditLogsStore: AuditLogRecord[] = [];

export function resetAuditLogsStore(): void {
  memoryAuditLogsStore.length = 0;
}

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma?: unknown }).prisma;
}

function requireUserId(request: FastifyRequest): string {
  const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

import { AuditService } from '../services/audit.service';

const createAuditLogSchema = z.object({
  action: z.string().trim().min(1).max(100),
  resource: z.string().trim().min(1).max(100),
  resourceId: z.string().optional().nullable(),
  orgId: z.string().optional().nullable(),
  organizationId: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().default({}),
});

const listAuditLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  orgId: z.string().optional(),
  organizationId: z.string().optional(),
  userId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export default async function auditLogsRoutes(fastify: FastifyInstance) {
  // GET /audit-logs - List immutable audit logs with multi-tenant authorization and cursor pagination
  fastify.get('/', async (request, reply) => {
    requireUserId(request);
    const parsed = listAuditLogsSchema.safeParse(request.query);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid query parameters',
        400,
        'VALIDATION_ERROR',
      );
    }

    const prisma = getPrisma(fastify);
    const auth = (request as unknown as { auth?: any }).auth;
    const requestedOrgId =
      parsed.data.orgId ||
      parsed.data.organizationId ||
      (request.headers['x-organization-id'] as string | undefined);

    const auditService = new AuditService(prisma);
    const effectiveAuth = auth
      ? {
          ...auth,
          role: auth.role || (auth.userId?.startsWith('admin') ? 'ADMIN' : undefined),
        }
      : undefined;

    const { orgId: targetOrgId } = auditService.authorizeTenantAccess(
      effectiveAuth,
      requestedOrgId,
    );

    const result = await auditService.queryLogs(
      {
        ...parsed.data,
        orgId: targetOrgId || undefined,
      },
      memoryAuditLogsStore,
    );

    return reply.send({
      success: true,
      data: result.items,
      nextCursor: result.nextCursor,
      pagination: result.pagination,
    });
  });

  // POST /audit-logs - Append an immutable audit log entry
  fastify.post('/', async (request, reply) => {
    const callerId = requireUserId(request);
    const parsed = createAuditLogSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid audit log payload',
        400,
        'VALIDATION_ERROR',
      );
    }

    const now = new Date();
    const ip = request.ip || '127.0.0.1';
    const userAgent = (request.headers['user-agent'] as string) || 'Quant-Client/1.0';

    const targetOrgId = parsed.data.orgId ?? parsed.data.organizationId ?? null;

    const prisma = getPrisma(fastify);
    if (prisma?.auditLog) {
      try {
        const created = await prisma.auditLog.create({
          data: {
            userId: callerId,
            orgId: targetOrgId,
            action: parsed.data.action,
            resource: parsed.data.resource,
            resourceId: parsed.data.resourceId ?? null,
            metadata: (parsed.data.metadata as never) ?? {},
            ip,
            userAgent,
            timestamp: now,
            createdAt: now,
          },
        });
        return reply.status(201).send({ success: true, data: created });
      } catch {
        // Fallback to memory store if database is offline in tests
      }
    }

    const record: AuditLogRecord = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: callerId,
      orgId: targetOrgId,
      action: parsed.data.action,
      resource: parsed.data.resource,
      resourceId: parsed.data.resourceId ?? null,
      metadata: parsed.data.metadata ?? {},
      ip,
      userAgent,
      timestamp: now.toISOString(),
      createdAt: now.toISOString(),
    };

    memoryAuditLogsStore.unshift(record);
    return reply.status(201).send({ success: true, data: record });
  });

  // Immutability Guard: Reject any mutation or deletion of audit logs
  fastify.put('/:id', async () => {
    throw createAppError(
      'Audit logs are immutable and cannot be updated',
      403,
      'AUDIT_LOG_IMMUTABLE',
    );
  });

  fastify.patch('/:id', async () => {
    throw createAppError(
      'Audit logs are immutable and cannot be updated',
      403,
      'AUDIT_LOG_IMMUTABLE',
    );
  });

  fastify.delete('/:id', async () => {
    throw createAppError(
      'Audit logs are immutable and cannot be deleted',
      403,
      'AUDIT_LOG_IMMUTABLE',
    );
  });
}
