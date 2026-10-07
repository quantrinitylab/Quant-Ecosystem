// @vitest-environment node
// ============================================================================
// Task 19.3 — Property test: agent mailbox authz never leaks across tenants
// quantmail-superhub · Phase 6 — Agent Company OS (Pillar 5)
// ============================================================================
//
// Feature: quantmail-superhub, Property 7: agent mailbox authz never leaks across tenants
//
// **Property P7 (tenant isolation of agent identities)** — for ANY two
// orgs/tenants and ANY worker tool scope, an agent identity's granted authority
// can NEVER read the CEO's human inbox or another tenant's mail/repos. Concretely
// the property has three facets, all asserted below against the REAL provisioner
// from Task 19.2 (`modules/company/services/agent-identity-provisioner.ts`):
//
//   (P7-a) Scope confinement — the granted scope set of every provisioned
//          identity is ALWAYS a subset of {'agent-bus'} ∪ requested-tool-scope,
//          led by 'agent-bus', and NEVER contains any human-inbox / global /
//          cross-tenant scope (e.g. email:read, messages:read, profile, *,
//          admin, wallet:*, inbox). An agent therefore can never reach the
//          CEO's human inbox.
//
//   (P7-b) Tenant confinement — an identity's stamped tenantId always equals
//          the tenant it was provisioned for, and its address lives in that
//          tenant's OWN agents domain (`agents.<slug(tenant)>.quantmail`). For
//          any two DISTINCT tenants the agents domains — and thus the minted
//          addresses — are different / partitioned by tenant, so an identity is
//          confined to its own tenant and can never inhabit another tenant's
//          mail namespace.
//
//   (P7-c) Fail-closed minting — for any tool scope that contains a forbidden
//          (human-inbox / global / colon-namespaced) scope, BOTH
//          `buildAgentScopes` and the full `provision` path FAIL CLOSED by
//          throwing FORBIDDEN_AGENT_SCOPE and persisting NOTHING. A leaky
//          identity can never be minted.
//
// **Validates: Requirements 11.3, 22.1**
//   - 11.3 — an agent identity's scope can never read the CEO's human inbox or
//            another tenant's data (tenant isolation of agent identities).
//   - 22.1 — every pillar query/tool action is ownership/tenant filtered so
//            another owner's/tenant's data is never reachable.
//
// HARNESS: tests the REAL `PrismaAgentIdentityProvisioner` against an in-memory
// mock of the `agentMailboxIdentity` Prisma delegate (mirrors the mock pattern
// in `agent-identity-provisioner.service.test.ts`). No real DB, no network.
// Library: fast-check, >= 100 runs per property (the ecosystem's JS property
// tool).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  PrismaAgentIdentityProvisioner,
  buildAgentScopes,
  defaultTenantDomain,
  AGENT_BUS_SCOPE,
  type AgentIdentityProvisionRequest,
} from '../modules/company/services/agent-identity-provisioner';

// ---------------------------------------------------------------------------
// In-memory mock of the `agentMailboxIdentity` Prisma delegate (same shape as
// the Task 19.2 service test).
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  orgId: string;
  tenantId: string;
  workerSlot: string;
  roleKey: string | null;
  address: string;
  scopes: unknown;
  status: string;
  revokedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function createMockPrisma() {
  const rows: Row[] = [];
  let seq = 0;
  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) => (row as never as Record<string, unknown>)[k] === v);

  const delegate = {
    rows,
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((r) => matches(r, where)) ?? null,
    findUnique: async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((r) => matches(r, where)) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date('2024-01-01T00:00:00Z');
      const row: Row = {
        id: `identity-${++seq}`,
        roleKey: null,
        revokedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        ...(data as Partial<Row>),
      } as unknown as Row;
      if (rows.some((r) => r.address === row.address)) {
        throw new Error('Unique constraint failed on address');
      }
      rows.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const row = rows.find((r) => matches(r, where));
      if (!row) throw new Error('Record to update not found');
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  return { agentMailboxIdentity: delegate };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * A pool of LEGAL agent tool-scope keys: lowercase, underscore-only, no colon,
 * none in the forbidden set. These are the only kind of scope a worker may
 * legitimately request (the QuantCode-scoped tool keys + a few extras).
 */
const LEGAL_TOOL_SCOPES = [
  'read_file',
  'edit_file',
  'open_pr',
  'run_ci',
  'search_repo',
  'list_files',
  'write_test',
  'apply_patch',
  'git_status',
  'build',
  'lint',
] as const;

/**
 * Human-inbox / global / cross-tenant scopes that an agent identity may NEVER
 * hold. Any of these in a request must fail the provisioning closed. Includes
 * explicit denylist members and colon-namespaced OAuth scopes (rejected by the
 * no-colon rule). These are exactly the scopes that would let an agent read the
 * CEO's human inbox or escape its tenant.
 */
const FORBIDDEN_SCOPE_SAMPLES = [
  'email:read',
  'email:send',
  'messages:read',
  'messages:write',
  'contacts:read',
  'profile',
  'profile:read',
  'openid',
  'email',
  '*',
  'admin',
  'root',
  'superuser',
  'wallet:read',
  'wallet:write',
  'subscription:manage',
  'workspace:manage',
  'inbox',
  'inbox:read',
  'human-inbox',
] as const;

/**
 * Scopes that must NEVER appear in any granted scope set — the concrete
 * "can't read the CEO's human inbox / another tenant" leak vectors called out
 * by the task.
 */
const LEAK_SCOPES = [
  'email:read',
  'messages:read',
  'profile',
  '*',
  'admin',
  'wallet:read',
  'wallet:write',
  'inbox',
] as const;

/** Normalize a scope the same way the provisioner does (trim + lowercase). */
const normalize = (s: string): string => s.trim().toLowerCase();

/**
 * Tenant-id pool whose slugs are all DISTINCT, so two distinct tenant ids always
 * produce two distinct agents domains (lets us assert partitioning crisply).
 */
const TENANT_POOL = [
  'acme',
  'globex',
  'initech',
  'umbrella',
  'wayne-ent',
  'stark9',
  'Tenant_42',
] as const;
const tenantIdArb = fc.constantFrom(...TENANT_POOL);

const ORG_POOL = ['org-1', 'org-2', 'alpha', 'beta', 'gamma'] as const;
const orgIdArb = fc.constantFrom(...ORG_POOL);

const workerSlotArb = fc.constantFrom('coder-1', 'coder-3', 'reviewer-2', 'planner-1', 'tester-7');

const roleKeyArb = fc.constantFrom(
  'planner',
  'coder',
  'reviewer',
  'tester',
  'debugger',
  'upgrader',
  'devops',
);

/**
 * A legal tool scope, sometimes upper-cased / space-padded so the property also
 * exercises the provisioner's normalization (granted scope must still be the
 * normalized form, present in the requested set).
 */
const legalScopeArb = fc
  .constantFrom(...LEGAL_TOOL_SCOPES)
  .chain((s) => fc.constantFrom(s, s.toUpperCase(), `  ${s}  `));

/** A (possibly empty) requested legal tool scope, may contain dupes/case noise. */
const legalToolScopeArb = fc.array(legalScopeArb, { minLength: 0, maxLength: 6 });

// ===========================================================================
// P7-a — Scope confinement: granted ⊆ {agent-bus} ∪ requested, never human/global
// ===========================================================================

describe('Feature: quantmail-superhub, Property 7: agent mailbox authz never leaks across tenants', () => {
  it('P7-a: granted scopes are always a subset of {agent-bus} ∪ requested tool scope and never a human-inbox/global scope (Req 11.3, 22.1)', async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        tenantIdArb,
        workerSlotArb,
        roleKeyArb,
        legalToolScopeArb,
        async (orgId, tenantId, workerSlot, roleKey, toolScope) => {
          const prisma = createMockPrisma();
          const provisioner = new PrismaAgentIdentityProvisioner(prisma as never);

          const request = {
            orgId,
            tenantId,
            workerSlot,
            roleKey,
            toolScope,
          } as AgentIdentityProvisionRequest;

          await provisioner.provision(request);

          const [row] = prisma.agentMailboxIdentity.rows;
          const granted = row.scopes as string[];
          const requestedNormalized = new Set(toolScope.map(normalize));

          // agent-bus is always present and always first.
          expect(granted[0]).toBe(AGENT_BUS_SCOPE);

          // Every granted scope is either the bus scope or one the worker
          // actually requested (normalized) — never anything broader.
          for (const scope of granted) {
            const ok = scope === AGENT_BUS_SCOPE || requestedNormalized.has(scope);
            expect(ok).toBe(true);
          }

          // No granted scope is a human-inbox / global / cross-tenant leak
          // vector — an agent can never read the CEO's human inbox.
          for (const leak of LEAK_SCOPES) {
            expect(granted).not.toContain(leak);
          }
          // No colon-namespaced (OAuth/global) scope ever leaks through.
          expect(granted.some((s) => s.includes(':'))).toBe(false);

          // The persisted set equals what buildAgentScopes computes for the
          // request (single source of truth for the policy).
          expect(granted).toEqual(buildAgentScopes(toolScope));
        },
      ),
      { numRuns: 200 },
    );
  });

  // =========================================================================
  // P7-b — Tenant confinement: stamped tenant matches, domains partition by tenant
  // =========================================================================

  it('P7-b: an identity is confined to its own tenant and two distinct tenants get distinct, partitioned agents domains/addresses (Req 11.3, 22.1)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Two tenants + two orgs + a shared worker slot.
        fc.tuple(tenantIdArb, tenantIdArb),
        fc.tuple(orgIdArb, orgIdArb),
        workerSlotArb,
        roleKeyArb,
        legalToolScopeArb,
        async ([tenantA, tenantB], [orgA, orgB], workerSlot, roleKey, toolScope) => {
          // Each tenant has its OWN provisioner/store (separate tenant boundary).
          const prismaA = createMockPrisma();
          const prismaB = createMockPrisma();
          const provisionerA = new PrismaAgentIdentityProvisioner(prismaA as never);
          const provisionerB = new PrismaAgentIdentityProvisioner(prismaB as never);

          const idA = await provisionerA.provision({
            orgId: orgA,
            tenantId: tenantA,
            workerSlot,
            roleKey,
            toolScope,
          } as AgentIdentityProvisionRequest);
          const idB = await provisionerB.provision({
            orgId: orgB,
            tenantId: tenantB,
            workerSlot,
            roleKey,
            toolScope,
          } as AgentIdentityProvisionRequest);

          const rowA = prismaA.agentMailboxIdentity.rows[0];
          const rowB = prismaB.agentMailboxIdentity.rows[0];

          // Each identity is stamped with EXACTLY its own tenant, and its
          // address lives in that tenant's own agents domain.
          const domainA = defaultTenantDomain(tenantA);
          const domainB = defaultTenantDomain(tenantB);
          expect(rowA.tenantId).toBe(tenantA);
          expect(rowB.tenantId).toBe(tenantB);
          expect(idA.address.endsWith(`@${domainA}`)).toBe(true);
          expect(idB.address.endsWith(`@${domainB}`)).toBe(true);

          // An identity NEVER inhabits the other tenant's domain.
          if (domainA !== domainB) {
            expect(idA.address.includes(`@${domainB}`)).toBe(false);
            expect(idB.address.includes(`@${domainA}`)).toBe(false);
          }

          // Distinct tenants ⇒ distinct, partitioned agents domains (and thus
          // distinct addresses even for the same worker slot/org).
          if (tenantA !== tenantB) {
            expect(domainA).not.toBe(domainB);
            if (orgA === orgB) {
              expect(idA.address).not.toBe(idB.address);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // =========================================================================
  // P7-c — Fail-closed minting: any forbidden scope ⇒ throw + persist nothing
  // =========================================================================

  it('P7-c: a tool scope containing any human/global/cross-tenant scope fails closed (FORBIDDEN_AGENT_SCOPE) and mints nothing (Req 11.3, 22.1)', async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        tenantIdArb,
        workerSlotArb,
        roleKeyArb,
        legalToolScopeArb,
        fc.constantFrom(...FORBIDDEN_SCOPE_SAMPLES),
        // Insert the forbidden scope at a random position among legal ones.
        fc.nat(),
        async (orgId, tenantId, workerSlot, roleKey, legal, forbidden, pos) => {
          const toolScope = [...legal];
          const at = legal.length === 0 ? 0 : pos % (legal.length + 1);
          toolScope.splice(at, 0, forbidden);

          // (1) The pure scope-policy builder fails closed.
          expect(() => buildAgentScopes(toolScope)).toThrowError();

          // (2) The full provision path fails closed AND persists nothing.
          const prisma = createMockPrisma();
          const provisioner = new PrismaAgentIdentityProvisioner(prisma as never);

          let threw = false;
          let code: unknown;
          try {
            await provisioner.provision({
              orgId,
              tenantId,
              workerSlot,
              roleKey,
              toolScope,
            } as AgentIdentityProvisionRequest);
          } catch (err) {
            threw = true;
            code = (err as { code?: unknown }).code;
          }

          expect(threw).toBe(true);
          expect(code).toBe('FORBIDDEN_AGENT_SCOPE');
          // No leaky identity was minted — the store is empty.
          expect(prisma.agentMailboxIdentity.rows).toHaveLength(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});
