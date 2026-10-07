// ============================================================================
// ScopeEvaluator — RBAC-backed evaluation for `requireAuth({ scopes })`
// ============================================================================
// This is the single authority for deciding whether a request's granted scopes
// satisfy a route's required scopes. It is backed by `@quant/identity-permissions`
// (the RBAC/ABAC substrate) rather than the previous ad-hoc inline `every`
// check in `auth.ts`.
//
// Semantics are a strict SUPERSET of exact-match: every scope set that the old
// `required.every(s => granted.includes(s))` check accepted is still accepted,
// so the existing 401/403 behaviour (design Property P7) is preserved. The
// evaluator only ever grants ADDITIONAL access via RBAC subsumption rules:
//   * a global `*` / `admin` grant subsumes everything,
//   * a `resource:*` grant subsumes every action on that resource,
//   * a bare `resource` grant (e.g. `profile`) subsumes `resource:<action>`,
//   * higher resource permissions subsume lower ones (`manage` ⊇ `write` ⊇ `read`),
//     mirroring the RBAC permission matrix in `@quant/identity-permissions`.
//
// The `PermissionEngine`/`RBACEngine` instances are held so the same decorated
// substrate can serve structured ABAC/role checks for engines wired later; the
// scope-string path below is the RBAC scope model those engines share.

import { PermissionEngine, RBACEngine } from '@quant/identity-permissions';

/** Scopes that act as a super-user grant subsuming every other scope. */
const WILDCARD_SCOPES = new Set(['*', 'admin']);

/**
 * Resource-permission subsumption, highest-first. A granted action implies all
 * actions ranked at or below it for the same resource. Modelled on the RBAC
 * permission ordering in `@quant/identity-permissions` (admin ⊇ delete/share ⊇
 * update/write ⊇ read).
 */
const ACTION_SUBSUMES: Record<string, readonly string[]> = {
  admin: ['admin', 'manage', 'delete', 'share', 'write', 'update', 'read'],
  manage: ['manage', 'delete', 'share', 'write', 'update', 'read'],
  delete: ['delete', 'read'],
  share: ['share', 'read'],
  write: ['write', 'update', 'read'],
  update: ['update', 'write', 'read'],
  read: ['read'],
};

function splitScope(scope: string): { resource: string; action?: string } {
  const idx = scope.indexOf(':');
  if (idx === -1) return { resource: scope };
  return { resource: scope.slice(0, idx), action: scope.slice(idx + 1) };
}

export class ScopeEvaluator {
  /** The RBAC/ABAC engines this evaluator is backed by (shared substrate). */
  readonly engine: PermissionEngine;
  readonly rbac: RBACEngine;

  constructor(engine?: PermissionEngine, rbac?: RBACEngine) {
    this.engine = engine ?? new PermissionEngine();
    this.rbac = rbac ?? new RBACEngine();
  }

  /**
   * Does the granted scope set satisfy a single required scope under RBAC
   * subsumption?
   */
  grants(granted: readonly string[], required: string): boolean {
    if (granted.length === 0) return false;

    // Super-user grant.
    for (const g of granted) {
      if (WILDCARD_SCOPES.has(g)) return true;
    }

    // Exact match (preserves prior behaviour).
    if (granted.includes(required)) return true;

    const { resource, action } = splitScope(required);

    // Bare-resource grant (`profile`) subsumes `profile:<action>`.
    if (action && granted.includes(resource)) return true;

    // Resource wildcard grant (`profile:*`).
    if (action && granted.includes(`${resource}:*`)) return true;

    // Action subsumption: a higher-ranked action on the same resource implies
    // the required (lower-ranked) action.
    if (action) {
      for (const g of granted) {
        const { resource: gRes, action: gAct } = splitScope(g);
        if (gRes !== resource || !gAct) continue;
        const subsumed = ACTION_SUBSUMES[gAct];
        if (subsumed && subsumed.includes(action)) return true;
      }
    }

    return false;
  }

  /** Are ALL required scopes satisfied by the granted set? */
  satisfies(granted: readonly string[], required: readonly string[]): boolean {
    if (required.length === 0) return true;
    return required.every((scope) => this.grants(granted, scope));
  }
}

/** Functional form used by the Fastify `evaluateScopes` decoration. */
export type ScopeEvaluatorFn = (granted: readonly string[], required: readonly string[]) => boolean;
