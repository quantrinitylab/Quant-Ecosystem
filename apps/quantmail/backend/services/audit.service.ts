import type { PrismaClient } from '@quant/database';
import { createAppError } from '@quant/server-core';

export interface AuditLogItem {
  id: string;
  userId: string;
  orgId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  timestamp: Date | string;
  createdAt: Date | string;
}

export interface QueryAuditLogsOptions {
  orgId?: string;
  userId?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
  page?: number;
}

export interface PaginatedAuditLogs {
  items: AuditLogItem[];
  nextCursor?: string | null;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthContextParam {
  userId?: string;
  role?: string;
  orgId?: string;
  organizationId?: string;
  orgRole?: string;
  [key: string]: unknown;
}

const ALLOWED_AUDIT_ROLES = new Set(['ADMIN', 'AUDITOR', 'OWNER']);

export class AuditService {
  constructor(private readonly prisma?: PrismaClient) {}

  /**
   * Validate that the authenticated session possesses ADMIN or AUDITOR authorization
   * within the target tenant / organization, and reject cross-tenant access.
   */
  authorizeTenantAccess(
    auth: AuthContextParam | undefined,
    requestedOrgId?: string,
  ): {
    orgId: string;
    role: string;
  } {
    if (!auth || !auth.userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const sessionOrgId = (auth.orgId || auth.organizationId) as string | undefined;
    const targetOrgId = requestedOrgId || sessionOrgId;

    if (!targetOrgId) {
      // Check if user has global or fallback admin role
      const role = String(auth.role || auth.orgRole || '').toUpperCase();
      if (!ALLOWED_AUDIT_ROLES.has(role)) {
        throw createAppError(
          'Forbidden: Organization access denied. Requires ADMIN or AUDITOR role.',
          403,
          'FORBIDDEN_ORGANIZATION_ACCESS',
        );
      }
      return { orgId: '', role };
    }

    // Cross-tenant prevention: if token is bound to an org, it cannot query another org
    if (sessionOrgId && requestedOrgId && sessionOrgId !== requestedOrgId) {
      throw createAppError(
        `Forbidden: Token issued for organization ${sessionOrgId} cannot access ${requestedOrgId}.`,
        403,
        'FORBIDDEN_ORGANIZATION_ACCESS',
      );
    }

    const role = String(auth.orgRole || auth.role || '').toUpperCase();
    if (!ALLOWED_AUDIT_ROLES.has(role)) {
      throw createAppError(
        `Forbidden: Role ${role || 'MEMBER'} does not have audit log permissions in organization ${targetOrgId}.`,
        403,
        'FORBIDDEN_ORGANIZATION_ACCESS',
      );
    }

    return { orgId: targetOrgId, role };
  }

  /**
   * Query audit logs with strict tenant isolation and cursor-based pagination.
   */
  async queryLogs(
    options: QueryAuditLogsOptions,
    memoryStore?: AuditLogItem[],
  ): Promise<PaginatedAuditLogs> {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
    const page = options.page ?? 1;
    const { orgId, userId, action, resource, from, to, cursor } = options;

    const prisma = this.prisma as any;
    if (prisma?.auditLog?.findMany) {
      try {
        const where: Record<string, unknown> = {};
        if (orgId) {
          where.orgId = orgId;
        }
        if (userId) {
          where.userId = userId;
        }
        if (action) {
          where.action = { contains: action, mode: 'insensitive' };
        }
        if (resource) {
          where.resource = { contains: resource, mode: 'insensitive' };
        }
        if (from || to) {
          where.timestamp = {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          };
        }

        const findArgs: Record<string, unknown> = {
          where,
          orderBy: { timestamp: 'desc' },
          take: limit + 1,
        };

        if (cursor) {
          findArgs.cursor = { id: cursor };
          findArgs.skip = 1;
        } else if (page > 1) {
          findArgs.skip = (page - 1) * limit;
        }

        const [total, records] = await Promise.all([
          prisma.auditLog.count({ where }).catch(() => 0),
          prisma.auditLog.findMany(findArgs),
        ]);

        let nextCursor: string | null = null;
        let items = records as AuditLogItem[];
        if (items.length > limit) {
          items = items.slice(0, limit);
          nextCursor = items[items.length - 1]?.id ?? null;
        }

        return {
          items,
          nextCursor,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
          },
        };
      } catch {
        // Fall back to memory store if DB is offline
      }
    }

    // In-memory fallback
    let filtered = [...(memoryStore ?? [])];
    if (orgId) {
      filtered = filtered.filter((l) => l.orgId === orgId);
    }
    if (userId) {
      filtered = filtered.filter((l) => l.userId === userId);
    }
    if (action) {
      filtered = filtered.filter((l) => l.action.toLowerCase().includes(action.toLowerCase()));
    }
    if (resource) {
      filtered = filtered.filter((l) => l.resource.toLowerCase().includes(resource.toLowerCase()));
    }
    if (from) {
      const fromTime = new Date(from).getTime();
      filtered = filtered.filter((l) => new Date(l.timestamp).getTime() >= fromTime);
    }
    if (to) {
      const toTime = new Date(to).getTime();
      filtered = filtered.filter((l) => new Date(l.timestamp).getTime() <= toTime);
    }

    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const total = filtered.length;

    let items: AuditLogItem[];
    let nextCursor: string | null = null;

    if (cursor) {
      const cursorIndex = filtered.findIndex((item) => item.id === cursor);
      const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      const slice = filtered.slice(startIndex, startIndex + limit + 1);
      if (slice.length > limit) {
        items = slice.slice(0, limit);
        nextCursor = items[items.length - 1]?.id ?? null;
      } else {
        items = slice;
        nextCursor = null;
      }
    } else {
      const startIndex = (page - 1) * limit;
      items = filtered.slice(startIndex, startIndex + limit);
      if (startIndex + limit < total) {
        nextCursor = items[items.length - 1]?.id ?? null;
      }
    }

    return {
      items,
      nextCursor,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
