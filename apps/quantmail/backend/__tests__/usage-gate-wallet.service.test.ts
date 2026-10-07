// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 27.1 — UsageGate wired to the real CreditWallet
// (Requirements 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7)
// ============================================================================
//
// Verifies the metered usage gate end-to-end against the authoritative
// ledger-backed wallet (via createWalletBalanceProvider):
//   * estimate is derived from the active PricingRule (Req 18.1).
//   * entitlements that forbid the driver reject with UPGRADE_REQUIRED (Req 18.2).
//   * an available balance < estimate rejects with OUT_OF_CREDITS, recording NO
//     reservation and NO debit — fail closed (Req 18.3/18.5).
//   * reservation is idempotent by actionKey: a replay records no second hold
//     (Req 18.4).
//   * settle requires a prior reservation: settling an unrecorded reservation is
//     rejected and debits nothing (Req 18.5).
//   * settle reconciles estimate vs actual, debiting the ACTUAL cost keyed by
//     the reservation actionKey, and a second settle is a no-op (Req 18.6).

import { describe, it, expect } from 'vitest';
import {
  CreditWallet,
  PricingEngine,
  UsageGate,
  InMemoryReservationStore,
  createWalletBalanceProvider,
  permitAllEntitlements,
  type EntitlementPort,
} from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

// ---------------------------------------------------------------------------
// In-memory ledger prisma double (append-only, enforces @unique actionKey).
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
        return rows
          .filter((r) => owner == null || r.ownerRef === owner)
          .map((r) => ({ ...r }));
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

function seqIds(prefix = 'id') {
  let i = 0;
  return () => `${prefix}-${++i}`;
}

const OWNER = { ownerId: 'alice', ownerType: 'user' as const };
const ALICE: OwnershipPrincipal = { principalId: 'alice' };

/** Build a UsageGate whose balance/settlement is backed by a real CreditWallet. */
function makeWalletGate(opts: { entitlements?: EntitlementPort } = {}) {
  const prisma = createLedgerPrisma();
  const wallet = new CreditWallet(prisma as never, { generateId: seqIds('w') });
  const reservations = new InMemoryReservationStore();
  let r = 0;
  const gate = new UsageGate({
    balances: createWalletBalanceProvider({ wallet }),
    reservations,
    pricing: new PricingEngine({ creditsPerUsd: 1000 }),
    entitlements: opts.entitlements ?? permitAllEntitlements,
    generateId: () => `res-${++r}`,
  });
  return { gate, wallet, prisma, reservations };
}

const debitRows = (prisma: ReturnType<typeof createLedgerPrisma>) =>
  prisma._rows.filter((row) => row.entryType === 'debit');

describe('UsageGate + CreditWallet — estimate from PricingRule (Req 18.1)', () => {
  it('estimates the rag_query cost from the active pricing rule', async () => {
    const { gate } = makeWalletGate();
    expect(gate.estimateCost({ actionKey: 'k', kind: 'rag_query' })).toBe(5);
  });
});

describe('UsageGate + CreditWallet — entitlements (Req 18.2)', () => {
  it('rejects with UPGRADE_REQUIRED when the plan forbids the driver (no reservation/debit)', async () => {
    const { gate, wallet, prisma } = makeWalletGate({
      entitlements: { permits: (_o, kind) => kind !== 'rag_query' },
    });
    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });

    await expect(
      gate.checkAndReserve('alice', { actionKey: 'k', kind: 'rag_query' }),
    ).rejects.toMatchObject({ statusCode: 402, code: 'UPGRADE_REQUIRED' });

    expect(await gate.getReservation('alice', 'k')).toBeUndefined();
    expect(debitRows(prisma)).toHaveLength(0);
  });
});

describe('UsageGate + CreditWallet — fail closed on insufficient balance (Req 18.3/18.5)', () => {
  it('rejects with OUT_OF_CREDITS and records NO reservation and NO debit', async () => {
    const { gate, prisma } = makeWalletGate(); // empty wallet

    await expect(
      gate.checkAndReserve('alice', { actionKey: 'k', kind: 'rag_query' }),
    ).rejects.toMatchObject({ statusCode: 402, code: 'OUT_OF_CREDITS' });

    expect(await gate.getReservation('alice', 'k')).toBeUndefined();
    expect(debitRows(prisma)).toHaveLength(0);
  });
});

describe('UsageGate + CreditWallet — reservation idempotent by actionKey (Req 18.4)', () => {
  it('replaying the same actionKey returns the same reservation, no second hold', async () => {
    const { gate, wallet } = makeWalletGate();
    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });

    const first = await gate.checkAndReserve('alice', { actionKey: 'dup', kind: 'rag_query' });
    const second = await gate.checkAndReserve('alice', { actionKey: 'dup', kind: 'rag_query' });

    expect(second.id).toBe(first.id);
    // Only ONE 5-credit hold against the 100 balance.
    expect(await gate.getAvailableBalance('alice')).toBe(95);
  });
});

describe('UsageGate + CreditWallet — no settlement without a reservation (Req 18.5)', () => {
  it('rejects settling an unrecorded reservation and debits nothing', async () => {
    const { gate, wallet, prisma } = makeWalletGate();
    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });

    const fabricated = {
      id: 'forged',
      ownerRef: 'alice',
      actionKey: 'never-reserved',
      kind: 'rag_query' as const,
      estimatedCost: 5,
      settled: false,
      createdAt: new Date(),
    };

    await expect(gate.settle(fabricated, 5)).rejects.toMatchObject({
      statusCode: 404,
      code: 'RESERVATION_NOT_FOUND',
    });
    expect(debitRows(prisma)).toHaveLength(0);
    expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(100);
  });
});

describe('UsageGate + CreditWallet — settle reconciles estimate vs actual (Req 18.6)', () => {
  it('debits the ACTUAL cost (delta refund) keyed by the reservation actionKey', async () => {
    const { gate, wallet, prisma } = makeWalletGate();
    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });

    const res = await gate.checkAndReserve('alice', { actionKey: 'k', kind: 'rag_query' }); // est 5
    const settled = await gate.settle(res, 3); // actual 3 < estimate 5 => refund delta

    expect(settled.settled).toBe(true);
    expect(settled.actualCost).toBe(3);
    expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(97);
    expect(await gate.getAvailableBalance('alice')).toBe(97);

    const debits = debitRows(prisma);
    expect(debits).toHaveLength(1);
    expect(debits[0].amount).toBe(-3);
    // The debit is keyed by the reservation actionKey (idempotency anchor).
    expect(debits[0].actionKey).toBe('debit:k#PURCHASED');
  });

  it('charges the delta when actual exceeds the estimate', async () => {
    const { gate, wallet } = makeWalletGate();
    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });

    const res = await gate.checkAndReserve('alice', { actionKey: 'k2', kind: 'rag_query' }); // est 5
    await gate.settle(res, 8); // actual 8 > estimate 5 => charge delta

    expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(92);
  });

  it('is idempotent: a second settle of the same reservation is a no-op (Req 18.6)', async () => {
    const { gate, wallet, prisma } = makeWalletGate();
    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });

    const res = await gate.checkAndReserve('alice', { actionKey: 'k', kind: 'rag_query' });
    await gate.settle(res, 3);
    const again = await gate.settle(res, 3);

    expect(again.actualCost).toBe(3);
    // Balance debited once (97), not twice (94); only one debit row exists.
    expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(97);
    expect(debitRows(prisma)).toHaveLength(1);
  });
});

describe('UsageGate + CreditWallet — consumption order on settle (Req 18.2/18.7)', () => {
  it('settlement debit draws DAILY first, then PURCHASED', async () => {
    const { gate, wallet } = makeWalletGate();
    await wallet.grantDaily(OWNER, '2024-06-01', { dailyAllowance: 2 });
    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });

    const res = await gate.checkAndReserve('alice', { actionKey: 'k', kind: 'rag_query' }); // est 5
    await gate.settle(res, 5); // 5 = 2 daily + 3 purchased

    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.daily).toBe(0);
    expect(balance.purchased).toBe(97);
    expect(balance.total).toBe(97);
  });
});
