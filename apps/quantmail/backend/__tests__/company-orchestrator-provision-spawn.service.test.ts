// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 19.1 — Unit tests for CompanyOrchestrator
// provisionWorkspace + spawnFleet (Requirements 10.1, 10.2, 10.4, 10.5, 10.6)
// ============================================================================
//
// Tests the REAL implementation from Task 19.1
// (`modules/company/services/company-orchestrator.service.ts`) against a mocked
// Prisma client and injected fakes for the `RepoAccessPort`,
// `BranchProtectionService`, `AgentIdentityProvisioner`, and a real
// `RoleCatalog` driven by a deterministic `ModelRoutabilityPort` — no live
// `@quant/ai` engine, no network, no real database.
//
// COVERAGE
//   provisionWorkspace
//     - ATTACH requires the CEO to hold write scope (Req 10.1): a CEO without
//       write scope is rejected 403 WRITE_SCOPE_REQUIRED and the org is NOT
//       bound/advanced;
//     - ATTACH success binds workspaceRepoId, advances status to PROVISIONING,
//       and ensures a branch-protection rule on the default branch (Req 10.2);
//     - CREATE mints a repo owned by the CEO and configures branch protection;
//     - a missing org → 404 ORG_NOT_FOUND; a missing attach target → 404.
//   spawnFleet
//     - worker count matches the approved plan headcount (Req 10.4);
//     - every worker is tenant-scoped (tenantId == org.tenantId);
//     - model resolution honors CEO per-role / per-worker overrides else the
//       role default (Req 10.5);
//     - a non-routable model fails closed with 422 MODEL_NOT_ROUTABLE (Req 10.6);
//     - each worker is assigned a mailbox identity from the injected seam;
//     - spawning before provisioning → 409 WORKSPACE_NOT_PROVISIONED.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CompanyOrchestrator,
  type OrgPlan,
  type TenantOwnershipPort,
} from '../modules/company/services/company-orchestrator.service';
import {
  RoleCatalog,
  type ModelRoutabilityPort,
} from '../modules/company/services/role-catalog.service';
import type {
  AgentIdentityProvisioner,
} from '../modules/company/services/agent-identity-provisioner';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function createMockPrisma() {
  let workerSeq = 0;
  return {
    agentOrg: {
      findUnique: vi.fn(),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: where.id,
        ...data,
      })),
    },
    repository: {
      findUnique: vi.fn(),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'repo-created-id',
        storagePathUrl: null,
        ...data,
      })),
    },
    agentWorker: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: `worker-${++workerSeq}`,
        ...data,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      })),
    },
    // The orchestrator's default identity provisioner (Task 19.2) persists a
    // tenant-scoped AgentMailboxIdentity per worker. Tests that DON'T inject a
    // seam double exercise that real provisioner against this in-memory mock.
    agentMailboxIdentity: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: `identity-${++workerSeq}`,
        ...data,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      })),
    },
  };
}

/** Tenant-ownership fake (unused by provision/spawn but required by ctor). */
function ownership(tenantId: string | null): TenantOwnershipPort {
  return { resolveOwnedTenant: vi.fn(async () => tenantId) };
}

const DEFAULT_MODEL_IDS = ['gpt-4o', 'claude-sonnet-4', 'gpt-4o-mini'];

function routabilityAllowing(allowed: string[]): ModelRoutabilityPort {
  const set = new Set(allowed);
  return { isRoutable: (id: string) => set.has(id) };
}

function catalogAllowing(allowed: string[] = DEFAULT_MODEL_IDS): RoleCatalog {
  return new RoleCatalog({ routability: routabilityAllowing(allowed) });
}

/** A fake BranchProtectionService surface (only the two methods used). */
function fakeBranchProtection(opts: { existing?: { id: string } | null } = {}) {
  const getMatchingRule = vi.fn(async (_repoId: string, _branch: string) => opts.existing ?? null);
  const createRule = vi.fn(async (_input: { repoId: string; branchPattern: string }) => ({
    id: 'protection-rule-id',
  }));
  return { service: { getMatchingRule, createRule }, getMatchingRule, createRule };
}

/** A spy identity provisioner that records every request. */
function spyIdentityProvisioner(): AgentIdentityProvisioner & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    provision({ orgId, workerSlot }) {
      calls.push(workerSlot);
      return {
        mailboxIdentityId: `ident.${orgId}.${workerSlot}`,
        address: `${workerSlot}.${orgId}@agents.local`,
      };
    },
  };
}

function makeOrchestrator(opts: {
  prisma: ReturnType<typeof createMockPrisma>;
  catalog?: RoleCatalog;
  repoAccess?: { hasWriteScope: (repo: unknown, userId: string) => boolean | Promise<boolean> };
  branchProtection?: ReturnType<typeof fakeBranchProtection>['service'];
  identityProvisioner?: AgentIdentityProvisioner;
}) {
  return new CompanyOrchestrator(opts.prisma as never, {
    tenantOwnership: ownership('tenant-1'),
    roleCatalog: opts.catalog ?? catalogAllowing(),
    repoAccess: opts.repoAccess as never,
    branchProtection: opts.branchProtection as never,
    identityProvisioner: opts.identityProvisioner,
  });
}

const ORG = {
  id: 'org-1',
  ceoUserId: 'ceo-1',
  tenantId: 'tenant-1',
  goalText: 'goal',
  status: 'PLANNING',
  workspaceRepoId: null as string | null,
  budgetCap: 1000,
  costSpent: 0,
  maxIterations: 100,
  totalIterations: 0,
};

function repoOwnedBy(ownerId: string, defaultBranch = 'main') {
  return {
    id: 'repo-existing',
    ownerId,
    name: 'workspace',
    description: null,
    visibility: 'PRIVATE',
    defaultBranch,
    storagePathUrl: null,
  };
}

// ===========================================================================
// provisionWorkspace
// ===========================================================================

describe('CompanyOrchestrator.provisionWorkspace', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('rejects ATTACH when the CEO lacks write scope (Req 10.1) and does not bind/advance the org', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue({ ...ORG });
    // The repo is owned by someone else; owner-only-style policy denies the CEO.
    prisma.repository.findUnique.mockResolvedValue(repoOwnedBy('someone-else'));
    const bp = fakeBranchProtection();
    const orchestrator = makeOrchestrator({
      prisma,
      repoAccess: { hasWriteScope: (repo: unknown) => (repo as { ownerId: string }).ownerId === 'ceo-1' },
      branchProtection: bp.service,
    });

    await expect(
      orchestrator.provisionWorkspace('org-1', { mode: 'attach', repoId: 'repo-existing' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'WRITE_SCOPE_REQUIRED' });

    expect(prisma.agentOrg.update).not.toHaveBeenCalled();
    expect(bp.createRule).not.toHaveBeenCalled();
  });

  it('ATTACH success binds workspace, advances to PROVISIONING, and ensures branch protection (Req 10.2)', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue({ ...ORG });
    prisma.repository.findUnique.mockResolvedValue(repoOwnedBy('ceo-1', 'main'));
    const bp = fakeBranchProtection({ existing: null });
    const orchestrator = makeOrchestrator({
      prisma,
      repoAccess: { hasWriteScope: () => true },
      branchProtection: bp.service,
    });

    const ws = await orchestrator.provisionWorkspace('org-1', {
      mode: 'attach',
      repoId: 'repo-existing',
    });

    expect(ws).toMatchObject({
      orgId: 'org-1',
      repoId: 'repo-existing',
      defaultBranch: 'main',
      attached: true,
      branchProtectionRuleId: 'protection-rule-id',
    });
    // A protection rule is created on the default branch when none matches.
    expect(bp.getMatchingRule).toHaveBeenCalledWith('repo-existing', 'main');
    expect(bp.createRule).toHaveBeenCalledTimes(1);
    expect(bp.createRule.mock.calls[0][0]).toMatchObject({
      repoId: 'repo-existing',
      branchPattern: 'main',
    });
    // Org bound to the repo and advanced to PROVISIONING.
    const updateArg = prisma.agentOrg.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArg.data.workspaceRepoId).toBe('repo-existing');
    expect(updateArg.data.status).toBe('PROVISIONING');
  });

  it('does NOT re-create branch protection when a matching rule already exists', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue({ ...ORG });
    prisma.repository.findUnique.mockResolvedValue(repoOwnedBy('ceo-1'));
    const bp = fakeBranchProtection({ existing: { id: 'existing-rule' } });
    const orchestrator = makeOrchestrator({
      prisma,
      repoAccess: { hasWriteScope: () => true },
      branchProtection: bp.service,
    });

    const ws = await orchestrator.provisionWorkspace('org-1', {
      mode: 'attach',
      repoId: 'repo-existing',
    });

    expect(bp.createRule).not.toHaveBeenCalled();
    expect(ws.branchProtectionRuleId).toBe('existing-rule');
  });

  it('CREATE mints a repo owned by the CEO with branch protection configured', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue({ ...ORG });
    const bp = fakeBranchProtection({ existing: null });
    const orchestrator = makeOrchestrator({
      prisma,
      repoAccess: { hasWriteScope: () => true },
      branchProtection: bp.service,
    });

    const ws = await orchestrator.provisionWorkspace('org-1', {
      mode: 'create',
      name: '  agent-workspace  ',
    });

    const createArg = prisma.repository.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArg.data.ownerId).toBe('ceo-1');
    expect(createArg.data.name).toBe('agent-workspace'); // trimmed
    expect(createArg.data.defaultBranch).toBe('main');
    expect(ws.attached).toBe(false);
    expect(bp.createRule).toHaveBeenCalledTimes(1);
    const updateArg = prisma.agentOrg.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArg.data.status).toBe('PROVISIONING');
  });

  it('rejects CREATE with an empty name (400 REPO_NAME_REQUIRED) and creates no repo', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue({ ...ORG });
    const bp = fakeBranchProtection();
    const orchestrator = makeOrchestrator({
      prisma,
      repoAccess: { hasWriteScope: () => true },
      branchProtection: bp.service,
    });

    await expect(
      orchestrator.provisionWorkspace('org-1', { mode: 'create', name: '   ' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'REPO_NAME_REQUIRED' });
    expect(prisma.repository.create).not.toHaveBeenCalled();
  });

  it('throws 404 ORG_NOT_FOUND when the org is missing', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue(null);
    const orchestrator = makeOrchestrator({
      prisma,
      repoAccess: { hasWriteScope: () => true },
      branchProtection: fakeBranchProtection().service,
    });

    await expect(
      orchestrator.provisionWorkspace('missing', { mode: 'create', name: 'x' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ORG_NOT_FOUND' });
  });

  it('throws 404 REPO_NOT_FOUND when attaching a non-existent repo', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue({ ...ORG });
    prisma.repository.findUnique.mockResolvedValue(null);
    const orchestrator = makeOrchestrator({
      prisma,
      repoAccess: { hasWriteScope: () => true },
      branchProtection: fakeBranchProtection().service,
    });

    await expect(
      orchestrator.provisionWorkspace('org-1', { mode: 'attach', repoId: 'nope' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'REPO_NOT_FOUND' });
  });
});

// ===========================================================================
// spawnFleet
// ===========================================================================

/** Build an OrgPlan directly for spawnFleet tests. */
function planWith(roles: OrgPlan['roles']): OrgPlan {
  const totalBudget = roles.reduce((s, r) => s + r.budgetShare, 0);
  return { orgId: 'org-1', budgetCap: 1000, totalBudget, roles };
}

const PROVISIONED_ORG = { ...ORG, workspaceRepoId: 'repo-existing', status: 'PROVISIONING' };

describe('CompanyOrchestrator.spawnFleet', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('creates a worker count matching the approved plan, each tenant-scoped (Req 10.4)', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue({ ...PROVISIONED_ORG });
    const identity = spyIdentityProvisioner();
    const orchestrator = makeOrchestrator({ prisma, identityProvisioner: identity });

    const plan = planWith([
      { role: 'planner', count: 1, defaultModel: { id: 'gpt-4o' }, toolScope: ['bus_email'], budgetShare: 100 },
      { role: 'coder', count: 3, defaultModel: { id: 'claude-sonnet-4' }, toolScope: ['edit_file'], budgetShare: 300 },
    ]);

    const workers = await orchestrator.spawnFleet('org-1', plan);

    // 1 planner + 3 coders = 4 workers (matches the plan headcount).
    expect(workers).toHaveLength(4);
    expect(prisma.agentWorker.create).toHaveBeenCalledTimes(4);
    // Every worker is tenant-scoped and has a mailbox identity.
    for (const w of workers) {
      expect(w.tenantId).toBe('tenant-1');
      expect(w.orgId).toBe('org-1');
      expect(w.mailboxIdentityId).toMatch(/^ident\.org-1\./);
      expect(w.status).toBe('SPAWNING');
    }
    // Roles are persisted as the Prisma enum (uppercase).
    const roles = workers.map((w) => (w as { role: string }).role);
    expect(roles).toEqual(['PLANNER', 'CODER', 'CODER', 'CODER']);
    // Identities use stable per-role slots.
    expect(identity.calls).toEqual(['planner-1', 'coder-1', 'coder-2', 'coder-3']);
  });

  it('resolves the role default model when no override is given (Req 10.5)', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue({ ...PROVISIONED_ORG });
    const orchestrator = makeOrchestrator({ prisma });

    const plan = planWith([
      { role: 'coder', count: 1, defaultModel: { id: 'claude-sonnet-4' }, toolScope: ['edit_file'], budgetShare: 50 },
    ]);
    const [worker] = await orchestrator.spawnFleet('org-1', plan);

    // Coder's role default is claude-sonnet-4.
    expect(worker.modelRef).toBe('claude-sonnet-4');
  });

  it('applies a CEO per-role override, and a per-worker override wins over it (Req 10.5)', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue({ ...PROVISIONED_ORG });
    // Allow the override targets in addition to the defaults.
    const catalog = catalogAllowing([...DEFAULT_MODEL_IDS, 'gpt-4o-role', 'gpt-4o-worker']);
    const orchestrator = makeOrchestrator({ prisma, catalog });

    const plan = planWith([
      { role: 'coder', count: 2, defaultModel: { id: 'claude-sonnet-4' }, toolScope: ['edit_file'], budgetShare: 100 },
    ]);

    const workers = await orchestrator.spawnFleet('org-1', plan, {
      ceoOverrides: {
        byRole: { coder: 'gpt-4o-role' },
        byWorker: { 'coder-2': 'gpt-4o-worker' },
      },
    });

    // coder-1 takes the per-role override; coder-2 takes the per-worker override.
    expect(workers[0].modelRef).toBe('gpt-4o-role');
    expect(workers[1].modelRef).toBe('gpt-4o-worker');
  });

  it('fails closed with 422 MODEL_NOT_ROUTABLE when a worker model is not routable (Req 10.6)', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue({ ...PROVISIONED_ORG });
    // Routability rejects the coder default (claude-sonnet-4).
    const catalog = catalogAllowing(['gpt-4o', 'gpt-4o-mini']);
    const orchestrator = makeOrchestrator({ prisma, catalog });

    const plan = planWith([
      { role: 'coder', count: 1, defaultModel: { id: 'claude-sonnet-4' }, toolScope: ['edit_file'], budgetShare: 50 },
    ]);

    await expect(orchestrator.spawnFleet('org-1', plan)).rejects.toMatchObject({
      statusCode: 422,
      code: 'MODEL_NOT_ROUTABLE',
    });
  });

  it('splits a role budget share evenly across its workers (sum stays within the role share)', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue({ ...PROVISIONED_ORG });
    const orchestrator = makeOrchestrator({ prisma });

    // 100 / 3 workers => 33.33 each, summing to 99.99 (<= 100).
    const plan = planWith([
      { role: 'coder', count: 3, defaultModel: { id: 'claude-sonnet-4' }, toolScope: ['edit_file'], budgetShare: 100 },
    ]);
    const workers = await orchestrator.spawnFleet('org-1', plan);

    for (const w of workers) expect(w.budgetShare).toBeCloseTo(33.33, 5);
    const sum = workers.reduce((s, w) => s + w.budgetShare, 0);
    expect(sum).toBeLessThanOrEqual(100 + 1e-9);
  });

  it('rejects spawning before the workspace is provisioned (409 WORKSPACE_NOT_PROVISIONED)', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue({ ...ORG, workspaceRepoId: null });
    const orchestrator = makeOrchestrator({ prisma });

    const plan = planWith([
      { role: 'coder', count: 1, defaultModel: { id: 'claude-sonnet-4' }, toolScope: ['edit_file'], budgetShare: 50 },
    ]);

    await expect(orchestrator.spawnFleet('org-1', plan)).rejects.toMatchObject({
      statusCode: 409,
      code: 'WORKSPACE_NOT_PROVISIONED',
    });
    expect(prisma.agentWorker.create).not.toHaveBeenCalled();
  });

  it('throws 404 ORG_NOT_FOUND when the org is missing', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue(null);
    const orchestrator = makeOrchestrator({ prisma });
    const plan = planWith([
      { role: 'coder', count: 1, defaultModel: { id: 'claude-sonnet-4' }, toolScope: ['edit_file'], budgetShare: 50 },
    ]);

    await expect(orchestrator.spawnFleet('missing', plan)).rejects.toMatchObject({
      statusCode: 404,
      code: 'ORG_NOT_FOUND',
    });
  });
});
