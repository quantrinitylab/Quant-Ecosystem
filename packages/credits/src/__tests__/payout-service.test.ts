// @vitest-environment node
// ============================================================================
// PayoutService — withdrawals of earned credits (Requirements 3, 4)
// ============================================================================
//
// Verifies the payout rules over a real CreditWallet + an in-memory prisma
// double: no overdraw of earnings, purchased-only debit (free daily allowance
// is never burned), fail-closed when the rail is unconfigured, daily limit,
// compliance hold, and refund-on-failure.

import { describe, it, expect } from 'vitest';
import { CreditWallet, PayoutService, FakePayoutRail, type OwnershipPrincipal } from '../index';

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

interface PayoutRow {
  id: string;
  ownerRef: string;
  ownerType: string;
  tenantId: string | null;
  amountCredits: number;
  method: string;
  destination: string | null;
  status: string;
  providerRef: string | null;
  reason: string | null;
  requestedAt: Date;
  settledAt: Date | null;
}

function createPrisma() {
  const ledger: LedgerRow[] = [];
  const payouts: PayoutRow[] = [];
  let n = 0;
  return {
    _ledger: ledger,
    _payouts: payouts,
    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
        // enforce @unique(actionKey) the way the real schema does
        const key = (data.actionKey as string | null) ?? null;
        if (key != null && ledger.some((r) => r.actionKey === key)) {
          const e = new Error('Unique constraint failed') as Error & { code: string };
          e.code = 'P2002';
          throw e;
        }
        const row: LedgerRow = {
          id: (data.id as string) ?? `row-${++n}`,
          ownerRef: data.ownerRef as string,
          ownerType: (data.ownerType as string) ?? 'user',
          tenantId: (data.tenantId as string | null) ?? null,
          entryType: data.entryType as string,
          bucket: data.bucket as string,
          amount: data.amount as number,
          actionKey: key,
          sourceRef: (data.sourceRef as string | null) ?? null,
          utcDay: (data.utcDay as string | null) ?? null,
          reason: (data.reason as string | null) ?? null,
          createdAt: new Date(),
        };
        ledger.push(row);
        return { ...row };
      },
      async findMany({ where }: { where?: { ownerRef?: string } } = {}): Promise<LedgerRow[]> {
        const owner = where?.ownerRef;
        return ledger.filter((r) => owner == null || r.ownerRef === owner).map((r) => ({ ...r }));
      },
      async findFirst({
        where,
      }: {
        where?: { ownerRef?: string; entryType?: string; utcDay?: string };
      } = {}): Promise<LedgerRow | null> {
        const found = ledger.find(
          (r) =>
            (where?.ownerRef == null || r.ownerRef === where.ownerRef) &&
            (where?.entryType == null || r.entryType === where.entryType) &&
            (where?.utcDay == null || r.utcDay === where.utcDay),
        );
        return found ? { ...found } : null;
      },
    },
    payout: {
      async create({ data }: { data: Record<string, unknown> }): Promise<PayoutRow> {
        const row: PayoutRow = {
          id: data.id as string,
          ownerRef: data.ownerRef as string,
          ownerType: (data.ownerType as string) ?? 'user',
          tenantId: (data.tenantId as string | null) ?? null,
          amountCredits: data.amountCredits as number,
          method: data.method as string,
          destination: (data.destination as string | null) ?? null,
          status: data.status as string,
          providerRef: (data.providerRef as string | null) ?? null,
          reason: (data.reason as string | null) ?? null,
          requestedAt: (data.requestedAt as Date) ?? new Date(),
          settledAt: (data.settledAt as Date | null) ?? null,
        };
        payouts.push(row);
        return { ...row };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }): Promise<PayoutRow> {
        const row = payouts.find((p) => p.id === where.id);
        if (!row) throw new Error(`payout ${where.id} not found`);
        Object.assign(row, data);
        return { ...row };
      },
      async findMany({ where }: { where?: { ownerRef?: string } } = {}): Promise<PayoutRow[]> {
        const owner = where?.ownerRef;
        return payouts.filter((p) => owner == null || p.ownerRef === owner).map((p) => ({ ...p }));
      },
    },
  };
}

function seqIds(prefix: string) {
  let i = 0;
  return () => `${prefix}-${++i}`;
}

const OWNER = { ownerId: 'creator', ownerType: 'user' as const, tenantId: 'tenant-A' };
const CALLER: OwnershipPrincipal = { principalId: 'creator', tenantId: 'tenant-A' };
const fixedNow = () => new Date('2026-06-27T12:00:00.000Z');

async function seedEarned(wallet: CreditWallet, amount: number) {
  await wallet.credit(OWNER, { amount, kind: 'creator_payout', reason: 'seed earnings' });
}

describe('PayoutService.requestWithdrawal — happy path', () => {
  it('debits earned credits, dispatches to the rail, and completes', async () => {
    const prisma = createPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds('led') });
    await seedEarned(wallet, 100);
    const rail = new FakePayoutRail({ generateRef: seqIds('ref') });
    const svc = new PayoutService(prisma as never, wallet, rail, {
      generateId: seqIds('po'),
      now: fixedNow,
    });

    const payout = await svc.requestWithdrawal(CALLER, OWNER, { amountCredits: 40, method: 'upi' });

    expect(payout.status).toBe('completed');
    expect(payout.providerRef).toBe('ref-1');
    expect(rail.dispatched).toHaveLength(1);
    // earned balance reduced by exactly the withdrawal.
    const balance = await wallet.getBalance(CALLER, OWNER);
    expect(balance.purchased).toBe(60);
    expect(await svc.getWithdrawable(CALLER, OWNER)).toBe(60);
  });

  it('draws ONLY against earned/purchased credits, never the free daily allowance', async () => {
    const prisma = createPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds('led') });
    await wallet.grantDaily(OWNER, '2026-06-27'); // DEFAULT_DAILY_ALLOWANCE in DAILY bucket
    await seedEarned(wallet, 50);
    const before = await wallet.getBalance(CALLER, OWNER);

    const rail = new FakePayoutRail({ generateRef: seqIds('ref') });
    const svc = new PayoutService(prisma as never, wallet, rail, {
      generateId: seqIds('po'),
      now: fixedNow,
    });
    await svc.requestWithdrawal(CALLER, OWNER, { amountCredits: 50, method: 'crypto' });

    const after = await wallet.getBalance(CALLER, OWNER);
    expect(after.daily).toBe(before.daily); // daily allowance untouched
    expect(after.purchased).toBe(0); // earned credits fully withdrawn
  });
});

describe('PayoutService.requestWithdrawal — guards (fail closed)', () => {
  it('rejects an overdraw of earnings with WITHDRAWAL_EXCEEDS_EARNED', async () => {
    const prisma = createPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds('led') });
    await seedEarned(wallet, 30);
    const svc = new PayoutService(prisma as never, wallet, new FakePayoutRail(), {
      generateId: seqIds('po'),
      now: fixedNow,
    });
    await expect(
      svc.requestWithdrawal(CALLER, OWNER, { amountCredits: 31, method: 'upi' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'WITHDRAWAL_EXCEEDS_EARNED' });
    expect(prisma._payouts).toHaveLength(0);
  });

  it('rejects when the rail is not configured (no debit, no payout row)', async () => {
    const prisma = createPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds('led') });
    await seedEarned(wallet, 100);
    const svc = new PayoutService(
      prisma as never,
      wallet,
      new FakePayoutRail({ configured: false }),
      { generateId: seqIds('po'), now: fixedNow },
    );
    await expect(
      svc.requestWithdrawal(CALLER, OWNER, { amountCredits: 10, method: 'upi' }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'PROVIDER_NOT_CONFIGURED' });
    expect((await wallet.getBalance(CALLER, OWNER)).purchased).toBe(100);
    expect(prisma._payouts).toHaveLength(0);
  });

  it('enforces the daily withdrawal limit', async () => {
    const prisma = createPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds('led') });
    await seedEarned(wallet, 500);
    const svc = new PayoutService(
      prisma as never,
      wallet,
      new FakePayoutRail({ generateRef: seqIds('ref') }),
      {
        generateId: seqIds('po'),
        now: fixedNow,
        dailyLimitCredits: 100,
      },
    );
    await svc.requestWithdrawal(CALLER, OWNER, { amountCredits: 80, method: 'upi' });
    await expect(
      svc.requestWithdrawal(CALLER, OWNER, { amountCredits: 30, method: 'upi' }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'WITHDRAWAL_LIMIT_EXCEEDED' });
  });

  it('denies a non-owner with 403', async () => {
    const prisma = createPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds('led') });
    await seedEarned(wallet, 100);
    const svc = new PayoutService(prisma as never, wallet, new FakePayoutRail(), {
      generateId: seqIds('po'),
      now: fixedNow,
    });
    await expect(
      svc.requestWithdrawal({ principalId: 'mallory', tenantId: 'tenant-B' }, OWNER, {
        amountCredits: 10,
        method: 'upi',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });
});

describe('PayoutService.requestWithdrawal — compliance hold and refund', () => {
  it('holds a large request for review without dispatching (funds reserved)', async () => {
    const prisma = createPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds('led') });
    await seedEarned(wallet, 1000);
    const rail = new FakePayoutRail({ generateRef: seqIds('ref') });
    const svc = new PayoutService(prisma as never, wallet, rail, {
      generateId: seqIds('po'),
      now: fixedNow,
      dailyLimitCredits: 100000,
      complianceHoldThreshold: 500,
    });
    const payout = await svc.requestWithdrawal(CALLER, OWNER, {
      amountCredits: 500,
      method: 'bank',
    });
    expect(payout.status).toBe('pending_review');
    expect(rail.dispatched).toHaveLength(0);
    // funds reserved (debited) so they cannot be double-spent while held.
    expect((await wallet.getBalance(CALLER, OWNER)).purchased).toBe(500);
  });

  it('refunds the balance and marks the payout failed on a terminal rail failure', async () => {
    const prisma = createPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds('led') });
    await seedEarned(wallet, 100);
    const rail = new FakePayoutRail({ failWith: new Error('rail down') });
    const svc = new PayoutService(prisma as never, wallet, rail, {
      generateId: seqIds('po'),
      now: fixedNow,
    });
    const payout = await svc.requestWithdrawal(CALLER, OWNER, { amountCredits: 40, method: 'upi' });
    expect(payout.status).toBe('failed');
    expect(payout.reason).toContain('rail down');
    // compensating credit restored the balance.
    expect((await wallet.getBalance(CALLER, OWNER)).purchased).toBe(100);
    // a failed payout does not count against future withdrawable.
    expect(await svc.getWithdrawable(CALLER, OWNER)).toBe(100);
  });
});
