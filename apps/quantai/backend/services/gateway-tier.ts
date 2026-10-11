// ============================================================================
// Gateway permission tiers from the verified JWT role claim (F-111)
// ============================================================================
// The agent gateway gates tool execution on a per-user PermissionTier
// (0=Auto, 1=Notify, 2=Confirm, 3=Admin). The tier is derived from the role
// claim of the caller's JWT, which the global requireAuth hook
// (packages/server-core) has already signature-verified BEFORE any gateway
// route runs. This module consumes request.auth.role — it never parses or
// trusts a raw token itself.
//
// WAR-ROOM FREEZE (2026-10-11): the identity-root role claim is verbatim
// UPPERCASE — USER | ADMIN | MODERATOR | CREATOR | ADVERTISER. This mapping
// does NO lowercasing, normalization, or guessing: exact-match only.
// 'admin', 'Admin' and any unknown string FAIL CLOSED to tier 1.
// Only ADMIN may reach tier 3 (the tier reserved for tier-3 tools such as
// quantads.set-budget).

import type { PermissionTier } from '@quant/quant-tools';

const ROLE_TO_TIER: Record<string, PermissionTier> = {
  ADMIN: 3,
  MODERATOR: 2,
};

/**
 * Verbatim role claim -> PermissionTier. Everything not explicitly mapped
 * (USER, CREATOR, ADVERTISER, missing claim, non-string values, lowercase
 * look-alikes) fails closed to tier 1.
 */
export function roleToPermissionTier(role: unknown): PermissionTier {
  if (typeof role !== 'string') return 1;
  return ROLE_TO_TIER[role] ?? 1;
}
