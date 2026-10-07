// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 19.2 — Unit tests for the real
// AgentIdentityProvisioner (Requirements 10.3, 11.1, 11.2, 11.4)
// ============================================================================
//
// Tests the REAL implementation from Task 19.2
// (`modules/company/services/agent-identity-provisioner.ts`) against an
// in-memory mock of the `agentMailboxIdentity` Prisma delegate — no real DB.
//
// COVERAGE
//   provision / createAgentMailbox
//     - mints a UNIQUE, agent-namespaced, TENANT-SCOPED address (Req 11.1);
//     - persists the identity granting ONLY `agent-bus` + the worker's tool
//       scope (Req 11.2) — never a human-inbox / cross-tenant / global scope;
//     - stamps the tenant id on the identity (cross-tenant isolation, Req 11.3);
//     - FAILS CLOSED with 422 FORBIDDEN_AGENT_SCOPE when a human/global scope
//       is requested, persisting nothing;
//     - is idempotent for an ACTIVE identity (same slot → same identity);
//     - different tenants yield different agents domains.
//   revoke / revokeAgentMailbox
//     - archives the identity (status ARCHIVED) and records revoked/archived
//       timestamps, PRESERVING the row for audit (Req 11.4);
//     - is idempotent on an already-archived identity;
//     - re-provisioning a retired slot fails closed (no silent reuse).
//   buildAgentScopes (scope-policy unit)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PrismaAgentIdentityProvisioner,
  createPrismaAgentIdentityProvisioner,
  buildAgentScopes,
  defaultTenantDomain,
  AGENT_BUS_SCOPE,
} from '../modules/company/services/agent-identity-provisioner';

// ---------------------------------------------------------------------------
// In-memory mock of the `agentMailboxIdentity` Prisma delegate
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
      // Enforce the @@unique([address]) and @@unique([orgId, workerSlot]).
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

const BASE_REQUEST = {
  orgId: 'org-1',
  tenantId: 'tenant-1',
  workerSlot: 'coder-3',
  roleKey: 'coder' as const,
  toolScope: ['read_file', 'edit_file', 'open_pr'],
};

// ===========================================================================
// provision
// ===========================================================================

describe('PrismaAgentIdentityProvisioner.provision', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let provisioner: PrismaAgentIdentityProvisioner;

  beforeEach(() => {
    prisma = createMockPrisma();
    provisioner = new PrismaAgentIdentityProvisioner(prisma as never);
  });

  it('mints a unique, agent-namespaced, tenant-scoped address (Req 11.1)', async () => {
    const identity = await provisioner.provision(BASE_REQUEST);

    // <workerSlot>.<orgId>@agents.<tenant>.quantmail — org-scoped local part,
    // tenant-scoped domain.
    expect(identity.address).toBe('coder-3.org-1@agents.tenant-1.quantmail');
    expect(identity.mailboxIdentityId).toBe('identity-1');
  });

  it('persists the identity granting ONLY agent-bus + the worker tool scope (Req 11.2)', async () => {
    await provisioner.provision(BASE_REQUEST);

    const [row] = prisma.agentMailboxIdentity.rows;
    expect(row.scopes).toEqual([AGENT_BUS_SCOPE, 'read_file', 'edit_file', 'open_pr']);
    // agent-bus is always present and always first.
    expect((row.scopes as string[])[0]).toBe(AGENT_BUS_SCOPE);
  });

  it('stamps the org tenant id and ACTIVE status on the identity (Req 11.3)', async () => {
    await provisioner.provision(BASE_REQUEST);
    const [row] = prisma.agentMailboxIdentity.rows;
    expect(row.tenantId).toBe('tenant-1');
    expect(row.orgId).toBe('org-1');
    expect(row.status).toBe('ACTIVE');
    expect(row.roleKey).toBe('CODER');
  });

  it('FAILS CLOSED with 422 FORBIDDEN_AGENT_SCOPE on a human-inbox scope, persisting nothing', async () => {
    await expect(
      provisioner.provision({
        ...BASE_REQUEST,
        toolScope: ['read_file', 'email:read'],
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'FORBIDDEN_AGENT_SCOPE' });
    // No identity was persisted (the scope check runs before any write).
    expect(prisma.agentMailboxIdentity.rows).toHaveLength(0);
  });

  it('rejects a wildcard/global scope as well (fail closed)', async () => {
    await expect(
      provisioner.provision({ ...BASE_REQUEST, toolScope: ['*'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_AGENT_SCOPE' });
  });

  it('is idempotent for an ACTIVE identity (same slot returns the same identity)', async () => {
    const first = await provisioner.provision(BASE_REQUEST);
    const second = await provisioner.provision(BASE_REQUEST);
    expect(second.mailboxIdentityId).toBe(first.mailboxIdentityId);
    expect(prisma.agentMailboxIdentity.rows).toHaveLength(1);
  });

  it('uses a different agents domain per tenant (cross-tenant partitioning)', async () => {
    const a = await provisioner.provision(BASE_REQUEST);
    const b = await provisioner.provision({
      ...BASE_REQUEST,
      orgId: 'org-2',
      tenantId: 'tenant-2',
    });
    expect(a.address).toContain('@agents.tenant-1.quantmail');
    expect(b.address).toContain('@agents.tenant-2.quantmail');
    expect(a.address).not.toBe(b.address);
  });

  it('rejects an incomplete request (400 IDENTITY_REQUEST_INVALID)', async () => {
    await expect(provisioner.provision({ ...BASE_REQUEST, tenantId: '   ' })).rejects.toMatchObject(
      { statusCode: 400, code: 'IDENTITY_REQUEST_INVALID' },
    );
  });
});

// ===========================================================================
// revoke
// ===========================================================================

describe('PrismaAgentIdentityProvisioner.revoke', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let provisioner: PrismaAgentIdentityProvisioner;

  beforeEach(() => {
    prisma = createMockPrisma();
    provisioner = new PrismaAgentIdentityProvisioner(prisma as never);
  });

  it('archives the identity for audit and records revoke/archive timestamps (Req 11.4)', async () => {
    const { mailboxIdentityId } = await provisioner.provision(BASE_REQUEST);

    await provisioner.revoke(mailboxIdentityId);

    const [row] = prisma.agentMailboxIdentity.rows;
    // Preserved (not deleted) but no longer usable.
    expect(prisma.agentMailboxIdentity.rows).toHaveLength(1);
    expect(row.status).toBe('ARCHIVED');
    expect(row.revokedAt).toBeInstanceOf(Date);
    expect(row.archivedAt).toBeInstanceOf(Date);
  });

  it('is idempotent on an already-archived identity', async () => {
    const { mailboxIdentityId } = await provisioner.provision(BASE_REQUEST);
    await provisioner.revoke(mailboxIdentityId);
    const firstArchivedAt = prisma.agentMailboxIdentity.rows[0].archivedAt;

    await expect(provisioner.revoke(mailboxIdentityId)).resolves.toBeUndefined();
    // No second mutation occurred.
    expect(prisma.agentMailboxIdentity.rows[0].archivedAt).toBe(firstArchivedAt);
  });

  it('refuses to silently reuse a retired slot on re-provision (409 IDENTITY_ARCHIVED)', async () => {
    const { mailboxIdentityId } = await provisioner.provision(BASE_REQUEST);
    await provisioner.revoke(mailboxIdentityId);

    await expect(provisioner.provision(BASE_REQUEST)).rejects.toMatchObject({
      statusCode: 409,
      code: 'IDENTITY_ARCHIVED',
    });
  });

  it('throws 404 IDENTITY_NOT_FOUND for an unknown id', async () => {
    await expect(provisioner.revoke('nope')).rejects.toMatchObject({
      statusCode: 404,
      code: 'IDENTITY_NOT_FOUND',
    });
  });
});

// ===========================================================================
// buildAgentScopes + helpers
// ===========================================================================

describe('buildAgentScopes (scope policy)', () => {
  it('always includes agent-bus first and de-duplicates', () => {
    expect(buildAgentScopes(['read_file', 'read_file'])).toEqual([AGENT_BUS_SCOPE, 'read_file']);
    expect(buildAgentScopes([])).toEqual([AGENT_BUS_SCOPE]);
    // An explicit agent-bus in the tool scope is tolerated and not duplicated.
    expect(buildAgentScopes([AGENT_BUS_SCOPE, 'edit_file'])).toEqual([
      AGENT_BUS_SCOPE,
      'edit_file',
    ]);
  });

  it('throws on any human-inbox / global / colon-namespaced scope', () => {
    for (const bad of ['email:read', 'messages:read', 'profile', 'wallet:write', '*', 'admin']) {
      expect(() => buildAgentScopes([bad])).toThrowError();
    }
  });
});

describe('defaultTenantDomain + factory', () => {
  it('derives a tenant-scoped agents domain', () => {
    expect(defaultTenantDomain('Tenant_42')).toBe('agents.tenant-42.quantmail');
  });

  it('factory returns a working provisioner', async () => {
    const prisma = createMockPrisma();
    const provisioner = createPrismaAgentIdentityProvisioner(prisma as never);
    const identity = await provisioner.provision(BASE_REQUEST);
    expect(identity.address).toBe('coder-3.org-1@agents.tenant-1.quantmail');
  });
});
