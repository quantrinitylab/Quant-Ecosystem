// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 30.1 — Company OS budgets denominated in credits
// backed by the CEO wallet (Requirements 21.1, 21.2, 21.3)
// ============================================================================
//
// Verifies the credit-backed org-budget reservation end-to-end:
//   * the real CreditWallet-backed reservation adapter reserves `budgetCap`
//     credits from the CEO wallet, FAILS CLOSED when the CEO's reservable
//     balance is below the cap (Req 21.1), and is idempotent by org id (a
//     re-run never double-reserves);
//   * CompanyOrchestrator.provisionWorkspace rejects provisioning (provisioning
//     NOTHING) when the reservation fails closed, and reserves credits on the
//     success path;
//   * spawnFleet enforces SUM(worker budgetShare) <= budgetCap (Req 21.3);
//   * supervise keeps org costSpent <= budgetCap (Req 21.2).
//
// The wallet is the REAL ledger-backed CreditWallet over an in-memory Prisma
// double (append-only, enforcing the @unique actionKey) — no mocks of the
// reservation logic itself.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CompanyOrchestrator,
  createCreditWalletOrgBudgetReservation,
  orgBudgetActionKey,
  type OrgPlan,
  type TenantOwnershipPort,
} from '../modules/company';
import { CreditWallet } from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

// ---------------------------------------------------------------------------
// In-memory append-only ledger prisma double (mirrors the wallet's contract).
// ---------------------------------------------------------------------------

interface LedgerRow {
  id: string;
  ownerRef: string;
  ownerType: string;
  tenantId: string | null;
  entryType: string;
  bucket: string;
  amount: number;
  actionKey: string | null;
  sourceRef: string | null;
  utcDay: string | null;
  reason: string | null;
  createdAt: Date;
}

function createLedgerPrisma() {
  const rows: LedgerRow[] = [];
  let n = 0;
  return {
    _rows: rows,
    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
        const actionKey = (data.actionKey as string | null) ?? null;
        if (actionKey != null && rows.some((r) => r.actionKey === actionKey)) {
          throw Object.assign(new Error('Unique constraint failed: actionKey'), {
            code: 'P2002',
          });
        }
        const row: LedgerRow = {
          id: (data.id as string) ?? `row-${++n}`,
          ownerRef: data.ownerRef as string,
          ownerType: (data.ownerType as string) ?? 'user',
          tenantId: (data.tenantId as string | null) ?? null,
          entryType: data.entryType as string,
          bucket: data.bucket as string,
          amount: data.amount as number,
          actionKey,
          sourceRef: (data.sourceRef as string | null) ?? null,
          utcDay: (data.utcDay as string | null) ?? null,
          reason: (data.reason as string | null) ?? null,
          createdAt: new Date(),
        };
        rows.push(row);
        return { ...row };
      },
      async findMany({ where }: { where?: { ownerRef?: string } } = {}): Promise<LedgerRow[]> {
        const owner = where?.ownerRef;
        return rows.filter((r) => owner == null || r.ownerRef === owner).map((r) => ({ ...r }));
      },
      async findFirst({
        where,
      }: {
        where?: { ownerRef?: string; entryType?: string; utcDay?: string };
      } = {}): Promise<LedgerRow | null> {
        const hit = rows.find(
          (r) =>
            (where?.ownerRef == null || r.ownerRef === where.ownerRef) &&
            (where?.entryType == null || r.entryType === where.entryType) &&
            (where?.utcDay == null || r.utcDay === where.utcDay),
        );
        return hit ? { ...hit } : null;
      },
    },
  };
}

function seqIds(prefix = 'w') {
  let i = 0;
  return () => `${prefix}-${++i}`;
}

const CEO_OWNER = { ownerId: 'ceo-1', ownerType: 'user' as const, tenantId: 'tenant-1' };
const CEO_PRINCIPAL: OwnershipPrincipal = { principalId: 'ceo-1' };

const debitRows = (prisma: ReturnType<typeof createLedgerPrisma>) =>
  prisma._rows.filter((row) => row.entryType === 'debit');

/** Build a fresh CEO wallet (optionally pre-funded) + its reservation port. */
function makeReservation(fund?: number) {
  const prisma = createLedgerPrisma();
  const wallet = new CreditWallet(prisma as never, { generateId: seqIds('w') });
  const reservation = createCreditWalletOrgBudgetReservation({ wallet });
  return { prisma, wallet, reservation };
}

async function fund(wallet: CreditWallet, amount: number) {
  await wallet.credit(CEO_OWNER, { amount, kind: 'purchase' });
}

// ===========================================================================
// 1. The credit-backed reservation adapter (Req 21.1)
// ===========================================================================

describe('createCreditWalletOrgBudgetReservation — reserve budgetCap (Req 21.1)', () => {
  it('debits the CEO wallet by budgetCap on a successful reservation', async () => {
    const { wallet, reservation, prisma } = makeReservation();
    await fund(wallet, 1000);

    const result = await reservation.reserve({
      orgId: 'org-1',
      budgetCap: 1000,
      ceoUserId: 'ceo-1',
      tenantId: 'tenant-1',
    });

    expect(result.reserved).toBe(1000);
    expect(result.replayed).toBe(false);
    expect(result.ledgerEntryIds.length).toBeGreaterThan(0);
    // The CEO wallet is drawn down by exactly the reserved cap.
    expect((await wallet.getBalance(CEO_PRINCIPAL, CEO_OWNER)).total).toBe(0);
    // The reservation debit is keyed idempotently by the org id.
    const reservationDebit = debitRows(prisma).find((r) =>
      (r.actionKey ?? '').startsWith(`debit:${orgBudgetActionKey('org-1')}#`),
    );
    expect(reservationDebit).toBeDefined();
  });

  it('FAILS CLOSED when the CEO reservable balance < requested cap (nothing reserved)', async () => {
    const { wallet, reservation, prisma } = makeReservation();
    await fund(wallet, 500); // less than the 1000 cap

    await expect(
      reservation.reserve({ orgId: 'org-1', budgetCap: 1000, ceoUserId: 'ceo-1', tenantId: 'tenant-1' }),
    ).rejects.toMatchObject({ statusCode: 402, code: 'INSUFFICIENT_ORG_BUDGET' });

    // Nothing was debited; the CEO balance is untouched.
    expect(debitRows(prisma)).toHaveLength(0);
    expect((await wallet.getBalance(CEO_PRINCIPAL, CEO_OWNER)).total).toBe(500);
  });

  it('is idempotent by org id: re-running does not double-reserve', async () => {
    const { wallet, reservation } = makeReservation();
    await fund(wallet, 1000);

    const first = await reservation.reserve({ orgId: 'org-1', budgetCap: 1000, ceoUserId: 'ceo-1', tenantId: 'tenant-1' });
    const second = await reservation.reserve({ orgId: 'org-1', budgetCap: 1000, ceoUserId: 'ceo-1', tenantId: 'tenant-1' });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.reserved).toBe(1000);
    // Only ONE reservation's worth of credits left the wallet.
    expect((await wallet.getBalance(CEO_PRINCIPAL, CEO_OWNER)).total).toBe(0);
  });

  it('rounds a fractional cap UP so the funded budget always covers the cap', async () => {
    const { wallet, reservation } = makeReservation();
    await fund(wallet, 1000);

    const result = await reservation.reserve({ orgId: 'org-2', budgetCap: 10.25, ceoUserId: 'ceo-1', tenantId: 'tenant-1' });
    expect(result.reserved).toBe(11); // ceil(10.25)
    expect((await wallet.getBalance(CEO_PRINCIPAL, CEO_OWNER)).total).toBe(989);
  });

  it('reserves nothing for a zero cap', async () => {
    const { wallet, reservation, prisma } = makeReservation();
    await fund(wallet, 1000);
    const result = await reservation.reserve({ orgId: 'org-3', budgetCap: 0, ceoUserId: 'ceo-1', tenantId: 'tenant-1' });
    expect(result.reserved).toBe(0);
    expect(debitRows(prisma)).toHaveLength(0);
  });
});

// ===========================================================================
// 2. CompanyOrchestrator.provisionWorkspace wired with the reservation seam
// ===========================================================================

function ownership(tenantId: string | null): TenantOwnershipPort {
  return { resolveOwnedTenant: vi.fn(async () => tenantId) };
}

function fakeBranchProtection() {
  const getMatchingRule = vi.fn(async () => null);
  const createRule = vi.fn(async () => ({ id: 'protection-rule-id' }));
  return { service: { getMatchingRule, createRule }, getMatchingRule, createRule };
}

function createOrchestratorPrisma() {
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
        defaultBranch: (data.defaultBranch as string) ?? 'main',
        ...data,
      })),
    },
    agentWorker: {
      findMany: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
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

describe('CompanyOrchestrator.provisionWorkspace — credit-backed reservation (Req 21.1)', () => {
  let orchestratorPrisma: ReturnType<typeof createOrchestratorPrisma>;

  beforeEach(() => {
    orchestratorPrisma = createOrchestratorPrisma();
  });

  it('rejects provisioning when the CEO reservable balance < cap and provisions NOTHING', async () => {
    orchestratorPrisma.agentOrg.findUnique.mockResolvedValue({ ...ORG });
    const { wallet, reservation } = makeReservation();
    await fund(wallet, 500); // < 1000 cap

    const bp = fakeBranchProtection();
    const orchestrator = new CompanyOrchestrator(orchestratorPrisma as never, {
      tenantOwnership: ownership('tenant-1'),
      repoAccess: { hasWriteScope: () => true } as never,
      branchProtection: bp.service as never,
      orgBudgetReservation: reservation,
    });

    await expect(
      orchestrator.provisionWorkspace('org-1', { mode: 'create', name: 'workspace' }),
    ).rejects.toMatchObject({ statusCode: 402, code: 'INSUFFICIENT_ORG_BUDGET' });

    // NOTHING provisioned: no repo created, no branch protection, no org update.
    expect(orchestratorPrisma.repository.create).not.toHaveBeenCalled();
    expect(bp.createRule).not.toHaveBeenCalled();
    expect(orchestratorPrisma.agentOrg.update).not.toHaveBeenCalled();
  });

  it('provisions and reserves the budget when the CEO can fund the cap', async () => {
    orchestratorPrisma.agentOrg.findUnique.mockResolvedValue({ ...ORG });
    const { wallet, reservation } = makeReservation();
    await fund(wallet, 1000);

    const bp = fakeBranchProtection();
    const orchestrator = new CompanyOrchestrator(orchestratorPrisma as never, {
      tenantOwnership: ownership('tenant-1'),
      repoAccess: { hasWriteScope: () => true } as never,
      branchProtection: bp.service as never,
      orgBudgetReservation: reservation,
    });

    const ws = await orchestrator.provisionWorkspace('org-1', { mode: 'create', name: 'workspace' });

    expect(ws.attached).toBe(false);
    expect(orchestratorPrisma.repository.create).toHaveBeenCalledTimes(1);
    expect(orchestratorPrisma.agentOrg.update).toHaveBeenCalledTimes(1);
    // The CEO wallet was drawn down by the reserved cap.
    expect((await wallet.getBalance(CEO_PRINCIPAL, CEO_OWNER)).total).toBe(0);
  });

  it('without a reservation seam, provisioning behaves as before (no credit backing)', async () => {
    orchestratorPrisma.agentOrg.findUnique.mockResolvedValue({ ...ORG });
    const bp = fakeBranchProtection();
    const orchestrator = new CompanyOrchestrator(orchestratorPrisma as never, {
      tenantOwnership: ownership('tenant-1'),
      repoAccess: { hasWriteScope: () => true } as never,
      branchProtection: bp.service as never,
      // no orgBudgetReservation
    });

    const ws = await orchestrator.provisionWorkspace('org-1', { mode: 'create', name: 'workspace' });
    expect(ws.attached).toBe(false);
    expect(orchestratorPrisma.agentOrg.update).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 3. spawnFleet enforces SUM(worker budgetShare) <= budgetCap (Req 21.3)
// ===========================================================================

function planWith(roles: OrgPlan['roles'], budgetCap = 1000): OrgPlan {
  const totalBudget = roles.reduce((s, r) => s + r.budgetShare, 0);
  return { orgId: 'org-1', budgetCap, totalBudget, roles };
}

const PROVISIONED_ORG = { ...ORG, workspaceRepoId: 'repo-existing', status: 'PROVISIONING' };

describe('CompanyOrchestrator.spawnFleet — SUM(worker budgetShare) <= budgetCap (Req 21.3)', () => {
  let orchestratorPrisma: ReturnType<typeof createOrchestratorPrisma>;

  beforeEach(() => {
    orchestratorPrisma = createOrchestratorPrisma();
    orchestratorPrisma.agentWorker.create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `worker-${Math.random().toString(36).slice(2)}`,
      ...data,
    }));
  });

  function orchestrator() {
    return new CompanyOrchestrator(orchestratorPrisma as never, {
      tenantOwnership: ownership('tenant-1'),
      identityProvisioner: {
        provision: ({ orgId, workerSlot }) => ({
          mailboxIdentityId: `ident.${orgId}.${workerSlot}`,
          address: `${workerSlot}@agents.local`,
        }),
      },
    });
  }

  it('rejects a plan whose worker budget shares would exceed the cap', async () => {
    orchestratorPrisma.agentOrg.findUnique.mockResolvedValue({ ...PROVISIONED_ORG, budgetCap: 1000 });
    const plan = planWith([
      { role: 'planner', count: 1, defaultModel: { id: 'gpt-4o' }, toolScope: [], budgetShare: 800 },
      { role: 'coder', count: 1, defaultModel: { id: 'gpt-4o' }, toolScope: [], budgetShare: 800 },
    ]);

    await expect(orchestrator().spawnFleet('org-1', plan)).rejects.toMatchObject({
      statusCode: 400,
      code: 'BUDGET_SUM_EXCEEDED',
    });
    expect(orchestratorPrisma.agentWorker.create).not.toHaveBeenCalled();
  });

  it('spawns a fleet whose summed worker shares stay within the cap', async () => {
    orchestratorPrisma.agentOrg.findUnique.mockResolvedValue({ ...PROVISIONED_ORG, budgetCap: 1000 });
    const plan = planWith([
      { role: 'planner', count: 1, defaultModel: { id: 'gpt-4o' }, toolScope: [], budgetShare: 400 },
      { role: 'coder', count: 2, defaultModel: { id: 'gpt-4o' }, toolScope: [], budgetShare: 400 },
    ]);

    const workers = await orchestrator().spawnFleet('org-1', plan);
    const sum = workers.reduce((s, w) => s + (w as { budgetShare: number }).budgetShare, 0);
    expect(sum).toBeLessThanOrEqual(1000 + 1e-9);
    expect(workers).toHaveLength(3);
  });
});

// ===========================================================================
// 4. supervise keeps org costSpent <= budgetCap (Req 21.2)
// ===========================================================================

describe('CompanyOrchestrator.supervise — costSpent clamped to budgetCap (Req 21.2)', () => {
  it('clamps reconciled org costSpent to the credit-backed budget cap', async () => {
    const orchestratorPrisma = createOrchestratorPrisma();
    orchestratorPrisma.agentOrg.findUnique.mockResolvedValue({
      ...PROVISIONED_ORG,
      budgetCap: 1000,
      costSpent: 0,
    });
    // Workers whose aggregate spend OVERRUNS the cap.
    orchestratorPrisma.agentWorker.findMany = vi.fn(async () => [
      { id: 'w1', status: 'ACTIVE', budgetShare: 600, costSpent: 700, mailboxIdentityId: null },
      { id: 'w2', status: 'ACTIVE', budgetShare: 600, costSpent: 700, mailboxIdentityId: null },
    ]) as never;
    orchestratorPrisma.agentWorker.update = vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: where.id,
      ...data,
    })) as never;

    const orchestrator = new CompanyOrchestrator(orchestratorPrisma as never, {
      tenantOwnership: ownership('tenant-1'),
      emailBus: { observe: async () => [] } as never,
    });

    const tick = await orchestrator.supervise('org-1');

    expect(tick.budgetCap).toBe(1000);
    expect(tick.costSpent).toBeLessThanOrEqual(1000);
    expect(tick.budgetCapReached).toBe(true);
  });
});
