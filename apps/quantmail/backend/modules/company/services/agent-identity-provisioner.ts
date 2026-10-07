// ============================================================================
// Company OS module — Agent mailbox-identity provisioner (Phase 6)
// quantmail-superhub · Task 19.2 (Requirements 10.3, 11.1, 11.2, 11.4)
// ============================================================================
//
// PURPOSE
//   `spawnFleet` (Task 19.1) gives every `AgentWorker` a unique, tenant-scoped
//   QuantMail mailbox identity through this injectable PORT (design §"INTERFACE
//   AgentIdentityProvisioner"). Task 19.2 ships the REAL provisioner, which
//   EXTENDS the existing alias/identity + OAuth-scope model (`@quant/auth`)
//   rather than inventing a new auth system:
//
//       PROCEDURE createAgentMailbox(orgId, workerId, roleKey) RETURNS MailboxIdentity
//         PRECONDITION:  org belongs to a single tenant (ceoUserId)
//         POSTCONDITION: address is unique + clearly agent-namespaced
//                        (e.g. coder-3.{orgId}@agents.{tenant-domain})
//         POSTCONDITION: identity granted ONLY agent-bus scope + worker tool scope
//         INVARIANT:     agent scope can never read the CEO's human inbox or
//                        another tenant's data
//
//       PROCEDURE revokeAgentMailbox(workerId) RETURNS Void
//         POSTCONDITION: tokens revoked on retire; mailbox archived for audit
//
//   PERSISTENCE
//     Identities are persisted additively as `AgentMailboxIdentity`
//     { id, orgId, tenantId, workerSlot, address, scopes[], status } (see the
//     Prisma schema + `prisma-stub.d.ts`). The address is derived from the
//     worker slot + org id + a TENANT-SCOPED agents domain, so addresses are
//     unique AND visibly partitioned by tenant. The granted scope set is ALWAYS
//     `['agent-bus', ...validated tool scope]` — human-inbox / cross-tenant /
//     global OAuth scopes are rejected fail-closed and can never be granted.
//
//   ISOLATION INVARIANT (Req 11.3 / 22.1, validated by Task 19.3's property)
//     Because (a) the granted scopes exclude every human/global OAuth scope and
//     (b) the tenant id is stamped on the identity (and baked into the agents
//     domain), an agent identity's authority is confined to the agent bus + its
//     own tools, within its own tenant — it can never read the CEO's human
//     inbox or another tenant's mail/repos.

import { createAppError } from '@quant/server-core';
import type { PrismaClient } from '@prisma/client';
import type { AgentRoleKey } from './role-catalog.service';

/** A provisioned, tenant-scoped agent mailbox identity. */
export interface AgentMailboxIdentity {
  /** Stable identity id persisted on `AgentWorker.mailboxIdentityId`. */
  mailboxIdentityId: string;
  /** The agent-namespaced email address for the worker's mailbox. */
  address: string;
}

/** Request to provision one worker's mailbox identity. */
export interface AgentIdentityProvisionRequest {
  orgId: string;
  /** The org's single tenant (every agent identity is scoped to it). */
  tenantId: string;
  /**
   * A stable, human-readable slot for the worker within its role, e.g.
   * `coder-3`. Used both for the agent-namespaced address and as the
   * per-worker model-override match key.
   */
  workerSlot: string;
  roleKey: AgentRoleKey;
  /**
   * The worker's tool scope (the `ToolDescriptor` keys the role may use). The
   * granted OAuth scope set is `['agent-bus', ...toolScope]` — and ONLY that.
   * Any human-inbox / cross-tenant / global scope here is rejected fail-closed.
   */
  toolScope?: string[];
}

/**
 * Mailbox-identity provisioning seam (design §"INTERFACE
 * AgentIdentityProvisioner"). `spawnFleet` calls `provision` once per worker
 * and records the returned `mailboxIdentityId`; `revoke` is called on retire to
 * revoke tokens and archive the mailbox for audit.
 */
export interface AgentIdentityProvisioner {
  provision(
    request: AgentIdentityProvisionRequest,
  ): AgentMailboxIdentity | Promise<AgentMailboxIdentity>;
  /**
   * Retire a worker's mailbox identity: revoke its tokens and archive it for
   * audit so it is preserved but unusable. Optional on the port so lightweight
   * test/seam doubles need not implement it.
   */
  revoke?(mailboxIdentityId: string): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Scope policy (Requirements 11.1, 11.2, 11.4 — the isolation invariant)
// ---------------------------------------------------------------------------

/** The single reserved scope every agent identity holds for the email bus. */
export const AGENT_BUS_SCOPE = 'agent-bus';

/**
 * Human-inbox / global OAuth scopes (from `@quant/common`'s `PermissionScope`)
 * plus catch-all/admin tokens that an agent identity may NEVER hold. Granting
 * any of these would let an agent read the CEO's human inbox or escape its
 * tenant, violating the design INVARIANT. Requesting one fails closed.
 */
const FORBIDDEN_AGENT_SCOPES: ReadonlySet<string> = new Set([
  // wildcards / privilege escalation
  '*',
  'admin',
  'root',
  'superuser',
  // identity / profile / human mail
  'openid',
  'profile',
  'email',
  'profile:read',
  'profile:write',
  'email:read',
  'email:send',
  'messages:read',
  'messages:write',
  'contacts:read',
  'contacts:write',
  'media:read',
  'media:upload',
  'posts:read',
  'posts:write',
  // billing / workspace / analytics / agent-management (not a worker concern)
  'wallet:read',
  'wallet:write',
  'subscription:manage',
  'workspace:manage',
  'workspace:read',
  'analytics:read',
  'ads:manage',
  'agent:manage',
  // explicit human-inbox aliases
  'inbox',
  'inbox:read',
  'human-inbox',
]);

/** A valid agent tool-scope key: lowercase, underscore-separated, no colons. */
const TOOL_SCOPE_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Validate a requested tool scope and FAIL CLOSED on anything that is a
 * human-inbox / cross-tenant / global scope. Colon-namespaced OAuth scopes
 * (e.g. `email:read`) are never valid agent tool scopes, so they are rejected
 * outright in addition to the explicit denylist.
 */
function assertGrantableToolScope(scope: string): void {
  const normalized = typeof scope === 'string' ? scope.trim().toLowerCase() : '';
  if (
    normalized.length === 0 ||
    normalized === AGENT_BUS_SCOPE ||
    FORBIDDEN_AGENT_SCOPES.has(normalized) ||
    normalized.includes(':') ||
    !TOOL_SCOPE_PATTERN.test(normalized)
  ) {
    if (normalized === AGENT_BUS_SCOPE) return; // tolerated; deduped below
    throw createAppError(
      `Tool scope '${scope}' may not be granted to an agent mailbox identity ` +
        `(only the '${AGENT_BUS_SCOPE}' scope plus a worker's own tool scope are permitted)`,
      422,
      'FORBIDDEN_AGENT_SCOPE',
    );
  }
}

/**
 * Build the FINAL granted scope set for an agent identity: `agent-bus` first,
 * then each de-duplicated, validated tool scope. The result is guaranteed to
 * contain ONLY the bus scope + the worker's tool scope and never a human/global
 * scope (the isolation invariant).
 */
export function buildAgentScopes(toolScope: readonly string[] = []): string[] {
  const scopes: string[] = [AGENT_BUS_SCOPE];
  const seen = new Set<string>([AGENT_BUS_SCOPE]);
  for (const raw of toolScope) {
    const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (normalized === AGENT_BUS_SCOPE || seen.has(normalized)) continue;
    assertGrantableToolScope(normalized);
    seen.add(normalized);
    scopes.push(normalized);
  }
  return scopes;
}

// ---------------------------------------------------------------------------
// Address derivation (Requirement 11.1 — unique + agent-namespaced + tenant)
// ---------------------------------------------------------------------------

/** Lowercase + reduce to DNS/local-part-safe characters for an address part. */
function slug(value: string): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Resolves the tenant-scoped agents mail domain for a tenant. */
export type TenantDomainResolver = (tenantId: string) => string;

/**
 * Default tenant-domain policy: `agents.{tenant}.quantmail` — every tenant gets
 * its OWN agents domain so addresses are partitioned by tenant at the DNS level
 * (reinforcing the cross-tenant isolation invariant). Swappable via options for
 * a real per-tenant verified domain.
 */
export function defaultTenantDomain(tenantId: string): string {
  return `agents.${slug(tenantId)}.quantmail`;
}

/** Options for the production provisioner. */
export interface PrismaAgentIdentityProvisionerOptions {
  /** Resolves the tenant-scoped agents domain (defaults to {@link defaultTenantDomain}). */
  tenantDomain?: TenantDomainResolver;
}

// ---------------------------------------------------------------------------
// Production provisioner
// ---------------------------------------------------------------------------

/**
 * The production `AgentIdentityProvisioner`. Persists a tenant-scoped
 * `AgentMailboxIdentity` per worker, granting ONLY `agent-bus` + the worker's
 * tool scope, and archives identities (revoking tokens) on retire. It extends
 * the existing alias/identity + OAuth-scope model rather than inventing new
 * auth: scopes are the same scope strings the rest of the platform uses, just
 * constrained to the agent-safe subset.
 */
export class PrismaAgentIdentityProvisioner implements AgentIdentityProvisioner {
  private readonly tenantDomain: TenantDomainResolver;

  constructor(
    private readonly prisma: PrismaClient,
    options: PrismaAgentIdentityProvisionerOptions = {},
  ) {
    this.tenantDomain = options.tenantDomain ?? defaultTenantDomain;
  }

  /**
   * Provision (or idempotently return) a worker's tenant-scoped mailbox
   * identity (design §"PROCEDURE createAgentMailbox").
   *
   * @throws 400 IDENTITY_REQUEST_INVALID when orgId/tenantId/workerSlot missing.
   * @throws 409 IDENTITY_ARCHIVED        when an identity for the slot exists
   *                                      but has been revoked/archived.
   * @throws 422 FORBIDDEN_AGENT_SCOPE    when a requested tool scope is a
   *                                      human-inbox/global scope (fail closed).
   */
  async provision(
    request: AgentIdentityProvisionRequest,
  ): Promise<AgentMailboxIdentity> {
    const orgId = typeof request.orgId === 'string' ? request.orgId.trim() : '';
    const tenantId =
      typeof request.tenantId === 'string' ? request.tenantId.trim() : '';
    const workerSlot =
      typeof request.workerSlot === 'string' ? request.workerSlot.trim() : '';
    if (orgId.length === 0 || tenantId.length === 0 || workerSlot.length === 0) {
      throw createAppError(
        'orgId, tenantId, and workerSlot are required to provision an agent identity',
        400,
        'IDENTITY_REQUEST_INVALID',
      );
    }

    // ----- 1. Build the restricted scope set (fail closed) -----------------
    // Done BEFORE any address derivation/persistence so a forbidden scope
    // provisions NOTHING.
    const scopes = buildAgentScopes(request.toolScope ?? []);

    // ----- 2. Derive the unique, tenant-scoped, agent-namespaced address ---
    const address = `${slug(workerSlot)}.${slug(orgId)}@${this.tenantDomain(tenantId)}`;

    // ----- 3. Idempotency: reuse an ACTIVE identity for this slot ----------
    const existing = await this.prisma.agentMailboxIdentity.findFirst({
      where: { orgId, workerSlot },
    });
    if (existing) {
      if (existing.status === 'ACTIVE') {
        return { mailboxIdentityId: existing.id, address: existing.address };
      }
      // A retired/archived identity for this slot must not be silently reused.
      throw createAppError(
        `Agent identity for worker '${workerSlot}' in org '${orgId}' has been retired and cannot be reused`,
        409,
        'IDENTITY_ARCHIVED',
      );
    }

    // ----- 4. Persist the tenant-scoped identity ---------------------------
    const created = await this.prisma.agentMailboxIdentity.create({
      data: {
        orgId,
        tenantId,
        workerSlot,
        roleKey: PRISMA_ROLE_KEY[request.roleKey] ?? null,
        address,
        scopes,
        status: 'ACTIVE',
      },
    });

    return { mailboxIdentityId: created.id, address: created.address };
  }

  /**
   * Retire a mailbox identity (design §"PROCEDURE revokeAgentMailbox"): revoke
   * its tokens and ARCHIVE it for audit. The row is preserved (never deleted)
   * but moves to a non-`ACTIVE` status so it can no longer authenticate.
   * Idempotent: revoking an already-archived identity is a no-op.
   */
  async revoke(mailboxIdentityId: string): Promise<void> {
    const id =
      typeof mailboxIdentityId === 'string' ? mailboxIdentityId.trim() : '';
    if (id.length === 0) {
      throw createAppError(
        'mailboxIdentityId is required to revoke an agent identity',
        400,
        'IDENTITY_REQUEST_INVALID',
      );
    }

    const identity = await this.prisma.agentMailboxIdentity.findUnique({
      where: { id },
    });
    if (!identity) {
      throw createAppError(
        'Agent mailbox identity not found',
        404,
        'IDENTITY_NOT_FOUND',
      );
    }
    if (identity.status === 'ARCHIVED') {
      return; // already retired — idempotent no-op
    }

    const now = new Date();
    await this.prisma.agentMailboxIdentity.update({
      where: { id },
      data: {
        // Tokens revoked AND archived for audit (preserved, unusable).
        status: 'ARCHIVED',
        revokedAt: identity.revokedAt ?? now,
        archivedAt: now,
      },
    });
  }
}

/** Maps a lowercase role key to the Prisma `AgentRoleKey` enum value. */
const PRISMA_ROLE_KEY: Record<AgentRoleKey, string> = {
  planner: 'PLANNER',
  coder: 'CODER',
  reviewer: 'REVIEWER',
  tester: 'TESTER',
  debugger: 'DEBUGGER',
  upgrader: 'UPGRADER',
  devops: 'DEVOPS',
};

/** Factory for the production provisioner (used as the orchestrator default). */
export function createPrismaAgentIdentityProvisioner(
  prisma: PrismaClient,
  options: PrismaAgentIdentityProvisionerOptions = {},
): AgentIdentityProvisioner {
  return new PrismaAgentIdentityProvisioner(prisma, options);
}

/**
 * Minimal in-memory default provisioner (the original Task 19.1 seam). Retained
 * for lightweight tests/offline seams that do not want a Prisma client. It
 * still enforces the scope invariant via {@link buildAgentScopes} but performs
 * no persistence. Production wiring uses {@link createPrismaAgentIdentityProvisioner}.
 */
export const defaultAgentIdentityProvisioner: AgentIdentityProvisioner = {
  provision({
    orgId,
    workerSlot,
    toolScope,
  }: AgentIdentityProvisionRequest): AgentMailboxIdentity {
    // Validate scopes so even the in-memory default cannot mint a leaky identity.
    buildAgentScopes(toolScope ?? []);
    return {
      mailboxIdentityId: `agent-identity.${orgId}.${workerSlot}`,
      address: `${slug(workerSlot)}.${slug(orgId)}@agents.local`,
    };
  },
};
