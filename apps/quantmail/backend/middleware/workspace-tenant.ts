import { createAppError } from '@quant/server-core';

export interface WorkspaceContext {
  workspaceId: string;
  userId: string;
  role?: string;
}

/**
 * Extracts workspace and user context from incoming request headers or auth state.
 * Implements ERPGo SaaS v9.8 context extraction.
 */
export function extractWorkspaceContext(req: any): WorkspaceContext | null {
  if (!req) return null;
  const headers = req.headers || {};
  const workspaceId =
    headers['x-workspace-id'] ||
    headers['x-workspace'] ||
    headers['workspace-id'] ||
    req.auth?.workspaceId ||
    req.user?.workspaceId ||
    req.workspaceId;

  const userId =
    headers['x-user-id'] ||
    headers['user-id'] ||
    req.auth?.userId ||
    req.user?.id ||
    req.user?.userId ||
    'system-user';

  const role = headers['x-workspace-role'] || headers['role'] || req.auth?.role || req.user?.role;

  if (!workspaceId) {
    return null;
  }

  return {
    workspaceId: String(workspaceId),
    userId: String(userId),
    ...(role ? { role: String(role) } : {}),
  };
}

/**
 * Verifies that a resource belongs to the active workspace tenant.
 * Throws AppError 403 FORBIDDEN if mismatched (ERPGo Row-Level Security).
 */
export function verifyTenantOwnership(
  resourceWorkspaceId: string,
  currentWorkspaceId: string,
): boolean {
  if (!resourceWorkspaceId || !currentWorkspaceId || resourceWorkspaceId !== currentWorkspaceId) {
    throw createAppError(
      'Cross-tenant access forbidden: resource workspace does not match active tenant',
      403,
      'FORBIDDEN',
    );
  }
  return true;
}

/**
 * Injects workspace tenant scope into database queries or filter objects.
 */
export function withTenantScope<T>(
  queryFilter: T,
  workspaceId: string,
): T & { workspaceId: string } {
  if (!workspaceId) {
    throw createAppError('Workspace ID is required for tenant-scoped query', 400, 'BAD_REQUEST');
  }
  return {
    ...(queryFilter as any),
    workspaceId,
  };
}
