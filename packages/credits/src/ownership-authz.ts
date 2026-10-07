// ============================================================================
// Shared — neutral ownership/tenant authorization filter (Ownership_Authz)
// quantmail-superhub · Task 23.1 (Requirements 22.1, 22.2, 22.3)
// ============================================================================
//
// PURPOSE
//   The cross-cutting ownership/tenant authorization filter that EVERY pillar
//   query and tool action is filtered by (Requirement 22.1), so data owned by
//   another user or tenant is never returned or acted upon, and an unauthorized
//   resource request is denied (Requirement 22.2).
//
//   The mail domain already enforces this rule INLINE across its services as
//   `if (resource.userId !== userId) throw 403 FORBIDDEN`
//   (see `email.service.ts`, `thread.service.ts`, `folder.service.ts`,
//   `ai-email.service.ts`, and `OutboundDeliveryPipeline.enqueueSend`). This
//   module captures that EXACT rule once as {@link ownerOnlyAuthz} so the
//   Answer Engine and the Agent Runtime can INHERIT the same filter
//   (Requirement 22.3) via an injectable {@link OwnershipAuthzPort}, rather than
//   re-deriving (or drifting from) the mail-domain check — and without importing
//   any mail-domain service across a module boundary.
//
//   The filter is a pure, dependency-free policy object so it is trivially
//   unit-testable and can be wired as the production adapter in both modules.

import { createAppError } from './errors';

// ---------------------------------------------------------------------------
// Principal / resource shapes
// ---------------------------------------------------------------------------

/** The principal making a request (a user, or an agent acting for its owner). */
export interface OwnershipPrincipal {
  /** The owning user id the request is attributed to. */
  principalId: string;
  /** The tenant the principal belongs to (defaults to the principal itself). */
  tenantId?: string;
  /**
   * Whether the principal is an administrator of {@link tenantId}. A tenant
   * admin may access resources owned by other members of the SAME tenant
   * (e.g. a CEO/tenant-admin reading a wallet — Req 16.4). Defaults to false.
   */
  isTenantAdmin?: boolean;
}

/** A resource whose access is being authorized. */
export interface OwnedResource {
  /** The user id that owns the resource (the ownership key). */
  ownerId: string;
  /** The tenant the resource belongs to (when tenant-scoped). */
  tenantId?: string;
  /** Optional resource id, used only to enrich a denial message. */
  resourceId?: string;
  /** Optional resource kind (e.g. `email`, `chunk`, `repository`), for messages. */
  kind?: string;
}

/**
 * The injectable ownership/tenant authorization filter. Returns `true` iff the
 * principal is allowed to access/act on the resource. Implementations MUST fail
 * closed (return `false`) on missing/invalid inputs.
 */
export interface OwnershipAuthzPort {
  isAuthorized(principal: OwnershipPrincipal, resource: OwnedResource): boolean;
}

// ---------------------------------------------------------------------------
// The canonical owner-only filter (== the mail-domain rule)
// ---------------------------------------------------------------------------

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * The canonical ownership filter — identical in spirit to the mail domain's
 * inline `resource.userId !== userId -> 403` check, plus a tenant-admin
 * allowance for same-tenant administration:
 *
 *   - DIRECT OWNERSHIP: the principal owns the resource (`ownerId === principalId`).
 *   - TENANT ADMIN: the principal administers the resource's tenant
 *     (`isTenantAdmin && principal.tenantId === resource.tenantId`).
 *   - otherwise DENY (fail closed).
 */
export const ownerOnlyAuthz: OwnershipAuthzPort = {
  isAuthorized(principal, resource) {
    if (principal == null || resource == null) return false;
    if (!nonEmpty(principal.principalId) || !nonEmpty(resource.ownerId)) return false;

    // Direct ownership — the mail-domain rule.
    if (resource.ownerId === principal.principalId) return true;

    // Same-tenant administration (e.g. tenant-admin wallet reads, Req 16.4).
    if (
      principal.isTenantAdmin === true &&
      nonEmpty(principal.tenantId) &&
      nonEmpty(resource.tenantId) &&
      principal.tenantId === resource.tenantId
    ) {
      return true;
    }

    return false;
  },
};

/**
 * The PRODUCTION adapter the answers + agent modules wire as their {@link
 * OwnershipAuthzPort}: the same owner-only/tenant-admin rule the mail domain
 * enforces. Exposed as a factory so the wiring layer can later swap in a richer
 * tenant-membership backed implementation without touching the modules.
 */
export function createMailDomainOwnershipAuthz(): OwnershipAuthzPort {
  return ownerOnlyAuthz;
}

// ---------------------------------------------------------------------------
// Assertion helper (deny == throw 403, mirroring the mail-domain behaviour)
// ---------------------------------------------------------------------------

/**
 * Assert the principal is authorized for the resource, throwing the same
 * `403 FORBIDDEN` app error the mail domain raises on a failed ownership check
 * (Requirement 22.2). Use this at a tool-action / mutation choke point where an
 * unauthorized request must be rejected rather than silently filtered.
 */
export function assertOwnership(
  port: OwnershipAuthzPort,
  principal: OwnershipPrincipal,
  resource: OwnedResource,
): void {
  if (!port.isAuthorized(principal, resource)) {
    const what = resource.kind ?? 'resource';
    const which = nonEmpty(resource.resourceId) ? ` '${resource.resourceId}'` : '';
    throw createAppError(`Not authorized to access ${what}${which}`, 403, 'FORBIDDEN');
  }
}
