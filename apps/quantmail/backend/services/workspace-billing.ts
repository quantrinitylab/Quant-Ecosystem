// ============================================================================
// QuantMail — ERPGo-Grade Workspace Billing & Resource Quota Service
// ============================================================================

export type WorkspacePlan = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE' | string;

const PLAN_SEAT_LIMITS: Record<string, number> = {
  FREE: 5,
  STARTER: 15,
  PRO: 50,
  ENTERPRISE: 10000,
};

const PLAN_STORAGE_LIMITS: Record<string, number> = {
  FREE: 1 * 1024 * 1024 * 1024, // 1 GB
  STARTER: 10 * 1024 * 1024 * 1024, // 10 GB
  PRO: 100 * 1024 * 1024 * 1024, // 100 GB
  ENTERPRISE: 1024 * 1024 * 1024 * 1024, // 1 TB
};

/**
 * Checks whether a workspace is within its seat limit for the given plan.
 */
export function checkWorkspaceSeatLimit(
  workspaceId: string,
  currentMembersCount: number,
  plan: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE' | string,
): { allowed: boolean; maxSeats: number; message?: string } {
  const normalizedPlan = (plan || 'FREE').toUpperCase();
  const maxSeats = PLAN_SEAT_LIMITS[normalizedPlan] ?? PLAN_SEAT_LIMITS['FREE']!;
  const allowed = currentMembersCount < maxSeats;
  return {
    allowed,
    maxSeats,
    ...(allowed
      ? {}
      : {
          message: `Workspace has reached maximum seat limit of ${maxSeats} for plan ${normalizedPlan}.`,
        }),
  };
}

/**
 * Checks whether a workspace is within its storage quota for the given plan.
 */
export function checkWorkspaceStorageLimit(
  workspaceId: string,
  currentUsageBytes: number,
  plan: string,
): { allowed: boolean; maxStorageBytes: number; percentageUsed: number } {
  const normalizedPlan = (plan || 'FREE').toUpperCase();
  const maxStorageBytes = PLAN_STORAGE_LIMITS[normalizedPlan] ?? PLAN_STORAGE_LIMITS['FREE']!;
  const percentageUsed =
    maxStorageBytes > 0 ? Number(((currentUsageBytes / maxStorageBytes) * 100).toFixed(2)) : 0;
  const allowed = currentUsageBytes <= maxStorageBytes;
  return {
    allowed,
    maxStorageBytes,
    percentageUsed,
  };
}
