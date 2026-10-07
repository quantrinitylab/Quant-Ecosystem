// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 18.2 — Unit tests for CompanyOrchestrator
// intake authz + budget-sum constraint (Requirements 9.2, 9.4)
// ============================================================================
//
// Tests the REAL implementation from Task 18.1
// (`modules/company/services/company-orchestrator.service.ts`) against a mocked
// Prisma client and injected fakes for the `TenantOwnershipPort` and `OrgPlanner`
// ports, plus a real `RoleCatalog` driven by an injected (deterministic)
// `ModelRoutabilityPort` — no live `@quant/ai` engine, no network.
//
// COVERAGE
//   1. Intake authz (Req 9.2):
//      - a caller whose `resolveOwnedTenant` returns null is rejected with
//        403 NOT_TENANT_OWNER and `prisma.agentOrg.create` is NEVER called;
//      - an authenticated tenant owner gets an `AgentOrg` with status
//        'PLANNING' bound to the resolved tenantId;
//      - goal validation: an empty/whitespace goal → 400 GOAL_REQUIRED (and no
//        org created, no ownership probe).
//
//   2. Budget-sum constraint (Req 9.4):
//      - for a VARIETY of planner allocations (different roles/headcounts) and
//        budget caps, every `planOrg` result has `SUM(roles[].budgetShare)`
//        <= `budgetCap` (a property-ish fast-check loop + explicit cases);
//      - per-role fields are well-formed: `defaultModel` is routable, `toolScope`
//        is non-empty, `count >= 1`;
//      - a Planner is ALWAYS present in the plan;
//      - `RoleCatalog.resolveModel` fail-closed propagates: when routability
//        rejects a role's model, `planOrg` throws 422 MODEL_NOT_ROUTABLE.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  CompanyOrchestrator,
  type TenantOwnershipPort,
} from '../modules/company/services/company-orchestrator.service';
import {
  RoleCatalog,
  ALL_ROLE_KEYS,
  type AgentRoleKey,
  type ModelRoutabilityPort,
} from '../modules/company/services/role-catalog.service';
import type { OrgPlanner, RoleAllocation } from '../modules/company/services/org-planner';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** Mocked Prisma surface used by the orchestrator (only `agentOrg.*`). */
function createMockPrisma() {
  return {
    agentOrg: {
      // Echo the create payload back as the persisted row (id supplied here).
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'org-generated-id',
        ...data,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      })),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };
}

/** A tenant-ownership fake whose verdict the test controls. */
function ownershipReturning(tenantId: string | null): TenantOwnershipPort {
  return { resolveOwnedTenant: vi.fn(async () => tenantId) };
}

/** A planner fake that returns a fixed allocation list. */
function plannerReturning(allocations: RoleAllocation[]): OrgPlanner {
  return { plan: vi.fn(async () => allocations) };
}

// The three model ids the seven built-in roles default to. A routability port
// that accepts exactly these keeps every default-model role routable.
const DEFAULT_MODEL_IDS = ['gpt-4o', 'claude-sonnet-4', 'gpt-4o-mini'];

/** Routability that accepts a fixed allow-list of model ids. */
function routabilityAllowing(allowed: string[]): ModelRoutabilityPort {
  const set = new Set(allowed);
  return { isRoutable: (id: string) => set.has(id) };
}

/** A RoleCatalog wired to a deterministic routability port (no live engine). */
function catalogAllowing(allowed: string[] = DEFAULT_MODEL_IDS): RoleCatalog {
  return new RoleCatalog({ routability: routabilityAllowing(allowed) });
}

/** Build an orchestrator with injected fakes. */
function makeOrchestrator(opts: {
  prisma: ReturnType<typeof createMockPrisma>;
  tenantId?: string | null;
  allocations?: RoleAllocation[];
  catalog?: RoleCatalog;
}) {
  // NB: use `===  undefined` (not `??`) so an explicit `null` (non-owner) is preserved.
  const tenantOwnership = ownershipReturning(
    opts.tenantId === undefined ? 'tenant-1' : opts.tenantId,
  );
  const planner = plannerReturning(opts.allocations ?? [{ roleKey: 'coder', count: 2 }]);
  const roleCatalog = opts.catalog ?? catalogAllowing();
  const orchestrator = new CompanyOrchestrator(opts.prisma as never, {
    tenantOwnership,
    planner,
    roleCatalog,
  });
  return { orchestrator, tenantOwnership, planner, roleCatalog };
}

// ===========================================================================
// 1. Intake authz (Requirement 9.2)
// ===========================================================================

describe('CompanyOrchestrator.intakeGoal — authz (Requirement 9.2)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('rejects a non-owner with 403 NOT_TENANT_OWNER and creates NO AgentOrg', async () => {
    const { orchestrator, tenantOwnership } = makeOrchestrator({ prisma, tenantId: null });

    await expect(
      orchestrator.intakeGoal('not-an-owner', 'Ship the billing revamp'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_TENANT_OWNER' });

    expect(tenantOwnership.resolveOwnedTenant).toHaveBeenCalledWith('not-an-owner');
    // The authz gate runs BEFORE any write — no org is ever created.
    expect(prisma.agentOrg.create).not.toHaveBeenCalled();
  });

  it('creates a PLANNING AgentOrg bound to the resolved tenant for an authenticated owner', async () => {
    const { orchestrator } = makeOrchestrator({ prisma, tenantId: 'tenant-42' });

    const org = await orchestrator.intakeGoal('ceo-1', '  Build the analytics dashboard  ');

    expect(prisma.agentOrg.create).toHaveBeenCalledTimes(1);
    const createArg = prisma.agentOrg.create.mock.calls[0][0] as { data: Record<string, unknown> };
    // Bound to the tenant the ownership port resolved, in PLANNING status.
    expect(createArg.data.tenantId).toBe('tenant-42');
    expect(createArg.data.ceoUserId).toBe('ceo-1');
    expect(createArg.data.status).toBe('PLANNING');
    // Goal is trimmed before persistence.
    expect(createArg.data.goalText).toBe('Build the analytics dashboard');
    // Counters initialized to zero, no workspace yet.
    expect(createArg.data.costSpent).toBe(0);
    expect(createArg.data.totalIterations).toBe(0);
    expect(createArg.data.workspaceRepoId).toBeNull();

    // The returned row reflects the persisted org.
    expect(org.status).toBe('PLANNING');
    expect(org.tenantId).toBe('tenant-42');
  });

  it('honors explicit budgetCap / maxIterations options on a valid intake', async () => {
    const { orchestrator } = makeOrchestrator({ prisma, tenantId: 'tenant-1' });

    await orchestrator.intakeGoal('ceo-1', 'do work', { budgetCap: 250, maxIterations: 33 });

    const createArg = prisma.agentOrg.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArg.data.budgetCap).toBe(250);
    expect(createArg.data.maxIterations).toBe(33);
  });

  it('rejects an empty / whitespace goal with 400 GOAL_REQUIRED and never probes ownership or writes', async () => {
    const { orchestrator, tenantOwnership } = makeOrchestrator({ prisma, tenantId: 'tenant-1' });

    for (const badGoal of ['', '   ', '\n\t']) {
      await expect(
        orchestrator.intakeGoal('ceo-1', badGoal),
      ).rejects.toMatchObject({ statusCode: 400, code: 'GOAL_REQUIRED' });
    }

    // Goal validation precedes the authz probe and any write.
    expect(tenantOwnership.resolveOwnedTenant).not.toHaveBeenCalled();
    expect(prisma.agentOrg.create).not.toHaveBeenCalled();
  });

  it('rejects a negative budgetCap with 400 INVALID_BUDGET_CAP and creates no org', async () => {
    const { orchestrator } = makeOrchestrator({ prisma, tenantId: 'tenant-1' });

    await expect(
      orchestrator.intakeGoal('ceo-1', 'do work', { budgetCap: -1 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_BUDGET_CAP' });

    expect(prisma.agentOrg.create).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. Budget-sum constraint (Requirement 9.4)
// ===========================================================================

/** Set `findUnique` to return an org with the given cap + goal. */
function stubOrg(
  prisma: ReturnType<typeof createMockPrisma>,
  org: { id?: string; budgetCap: number; goalText?: string },
) {
  prisma.agentOrg.findUnique.mockResolvedValue({
    id: org.id ?? 'org-1',
    ceoUserId: 'ceo-1',
    tenantId: 'tenant-1',
    goalText: org.goalText ?? 'some goal',
    status: 'PLANNING',
    workspaceRepoId: null,
    budgetCap: org.budgetCap,
    costSpent: 0,
    maxIterations: 100,
    totalIterations: 0,
  });
}

describe('CompanyOrchestrator.planOrg — budget-sum constraint (Requirement 9.4)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('SUM(roles[].budgetShare) <= budgetCap for ANY allocation set and cap (property-ish)', async () => {
    const roleKeyArb = fc.constantFrom<AgentRoleKey>(...ALL_ROLE_KEYS);
    const allocationArb = fc.record({
      roleKey: roleKeyArb,
      count: fc.integer({ min: 1, max: 12 }),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(allocationArb, { minLength: 1, maxLength: 10 }),
        // A mix of integer and fractional caps, including 0.
        fc.oneof(
          fc.integer({ min: 0, max: 100_000 }),
          fc.double({ min: 0, max: 100_000, noNaN: true }),
        ),
        async (allocations, budgetCap) => {
          const localPrisma = createMockPrisma();
          stubOrg(localPrisma, { budgetCap });
          const { orchestrator } = makeOrchestrator({
            prisma: localPrisma,
            allocations,
          });

          const plan = await orchestrator.planOrg('org-1');

          const sum = plan.roles.reduce((s, r) => s + r.budgetShare, 0);
          // The core invariant (Req 9.4): role shares never exceed the cap.
          expect(sum).toBeLessThanOrEqual(budgetCap + 1e-9);
          expect(plan.totalBudget).toBeLessThanOrEqual(budgetCap + 1e-9);
          expect(plan.budgetCap).toBe(budgetCap);

          // Per-role fields are well-formed.
          for (const role of plan.roles) {
            expect(role.count).toBeGreaterThanOrEqual(1);
            expect(role.toolScope.length).toBeGreaterThan(0);
            expect(DEFAULT_MODEL_IDS).toContain(role.defaultModel.id);
            expect(role.budgetShare).toBeGreaterThanOrEqual(0);
          }

          // A Planner is always present (coordination backbone).
          expect(plan.roles.some((r) => r.role === 'planner')).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('handles several explicit allocation/cap cases with sum <= cap', async () => {
    const cases: Array<{ allocations: RoleAllocation[]; cap: number }> = [
      { allocations: [{ roleKey: 'coder', count: 1 }], cap: 1000 },
      {
        allocations: [
          { roleKey: 'coder', count: 3 },
          { roleKey: 'reviewer', count: 1 },
          { roleKey: 'tester', count: 2 },
        ],
        cap: 999.99,
      },
      {
        allocations: [
          { roleKey: 'planner', count: 1 },
          { roleKey: 'coder', count: 7 },
          { roleKey: 'devops', count: 1 },
        ],
        cap: 333.33,
      },
      // Three coders evenly splitting a cap that does not divide cleanly:
      // flooring each share to the cent must keep the sum <= cap.
      { allocations: [{ roleKey: 'coder', count: 3 }], cap: 100 },
    ];

    for (const { allocations, cap } of cases) {
      const localPrisma = createMockPrisma();
      stubOrg(localPrisma, { budgetCap: cap });
      const { orchestrator } = makeOrchestrator({ prisma: localPrisma, allocations });

      const plan = await orchestrator.planOrg('org-1');
      const sum = plan.roles.reduce((s, r) => s + r.budgetShare, 0);

      expect(sum).toBeLessThanOrEqual(cap + 1e-9);
      expect(plan.roles.some((r) => r.role === 'planner')).toBe(true);
      for (const role of plan.roles) {
        expect(role.count).toBeGreaterThanOrEqual(1);
        expect(role.toolScope.length).toBeGreaterThan(0);
      }
    }
  });

  it('injects a Planner when the planner omits one', async () => {
    stubOrg(prisma, { budgetCap: 500 });
    const { orchestrator } = makeOrchestrator({
      prisma,
      // Planner deliberately absent from the allocation.
      allocations: [{ roleKey: 'coder', count: 2 }],
    });

    const plan = await orchestrator.planOrg('org-1');

    expect(plan.roles.some((r) => r.role === 'planner')).toBe(true);
  });

  it('throws 404 ORG_NOT_FOUND when the org does not exist', async () => {
    prisma.agentOrg.findUnique.mockResolvedValue(null);
    const { orchestrator } = makeOrchestrator({ prisma });

    await expect(orchestrator.planOrg('missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'ORG_NOT_FOUND',
    });
  });

  it('propagates fail-closed routability as 422 MODEL_NOT_ROUTABLE (Req 9.4 / 10.6)', async () => {
    stubOrg(prisma, { budgetCap: 500 });
    // Routability rejects the planner's default model (gpt-4o); since a Planner
    // is always present, planOrg must fail closed rather than plan around it.
    const catalog = catalogAllowing(['claude-sonnet-4', 'gpt-4o-mini']);
    const { orchestrator } = makeOrchestrator({
      prisma,
      allocations: [{ roleKey: 'planner', count: 1 }, { roleKey: 'coder', count: 1 }],
      catalog,
    });

    await expect(orchestrator.planOrg('org-1')).rejects.toMatchObject({
      statusCode: 422,
      code: 'MODEL_NOT_ROUTABLE',
    });
  });

  it('applies CEO per-role model overrides when routable', async () => {
    stubOrg(prisma, { budgetCap: 500 });
    // Allow the override target in addition to the defaults.
    const catalog = catalogAllowing([...DEFAULT_MODEL_IDS, 'gpt-4o-special']);
    const { orchestrator } = makeOrchestrator({
      prisma,
      allocations: [{ roleKey: 'coder', count: 1 }],
      catalog,
    });

    const plan = await orchestrator.planOrg('org-1', {
      ceoOverrides: { byRole: { coder: 'gpt-4o-special' } },
    });

    const coder = plan.roles.find((r) => r.role === 'coder');
    expect(coder?.defaultModel.id).toBe('gpt-4o-special');
  });
});
