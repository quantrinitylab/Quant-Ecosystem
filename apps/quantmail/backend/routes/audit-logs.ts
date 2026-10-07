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

/** Read-only view of the in-memory audit store (test support / query fallback). */
export function getServerAuditLogStore(): AuditLogRecord[] {
  return memoryAuditLogsStore;
}

/**
 * Server-side audit append — the ONLY write path for audit records.
 *
 * K9 (M20): the client-writable `POST /audit-logs` endpoint was closed because
 * it let any authenticated client forge arbitrary audit records. Audit writes
 * now happen exclusively from trusted backend code paths (e.g. the staff-gated
 * admin mutations in `routes/admin.ts` via `recordAdminAudit`), which call this
 * function — or `prisma.auditLog.create` directly — after a successful mutation.
 * This function is deliberately NOT reachable over HTTP.
 */
export function appendServerAuditRecord(
  entry: Omit<AuditLogRecord, 'id' | 'timestamp' | 'createdAt'>,
): AuditLogRecord {
  const now = new Date().toISOString();
  const record: AuditLogRecord = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
    createdAt: now,
    ...entry,
  };
  memoryAuditLogsStore.unshift(record);
  return record;
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

  // POST /audit-logs — CLOSED (K9/M20). Audit records are append-only and
  // written server-side by trusted backend code paths only. The previous
  // handler let any authenticated client forge arbitrary audit entries
  // (client-supplied action/resource), which contradicted the spec
  // ("append-oriented and protected from ordinary product mutation").
  fastify.post('/', async () => {
    throw createAppError(
      'Audit records are written server-side only; client-supplied audit writes are disabled',
      405,
      'AUDIT_LOG_CLIENT_WRITE_DISABLED',
    );
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
