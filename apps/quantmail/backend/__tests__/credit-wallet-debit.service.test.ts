// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 27.1 — CreditWallet.debit (fixed consumption order,
// fail-closed, idempotent by actionKey)
// (Requirements 18.2, 18.3, 18.4, 18.7; supports 16.2)
// ============================================================================
//
// Verifies the real ledger-backed debit primitive the UsageGate settles through:
//   * debit consumes buckets in the FIXED order DAILY -> MONTHLY -> PURCHASED,
//     appending one negative entry per consumed bucket summing to exactly the
//     requested amount (Req 18.2/18.7).
//   * debit FAILS CLOSED when total < amount: nothing is appended and the
//     balance never goes negative (Req 18.3 / 16.2).
//   * debit is IDEMPOTENT by actionKey: a replay appends nothing and returns the
//     prior result (Req 18.4); a concurrent race that hits the @unique actionKey
//     constraint returns the winning debit's entries.

import { describe, it, expect } from 'vitest';
import { CreditWallet } from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

// ---------------------------------------------------------------------------
// In-memory ledger prisma double — enforces the @unique(actionKey) constraint
// (throws P2002 on a duplicate) and is append-only (no update/delete).
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

function seqIds() {
  let i = 0;
  return () => `id-${++i}`;
}

const OWNER = { ownerId: 'alice', ownerType: 'user' as const, tenantId: 'tenant-A' };
const ALICE: OwnershipPrincipal = { principalId: 'alice', tenantId: 'tenant-A' };

/** Seed a wallet with explicit per-bucket balances via credit()/grantDaily(). */
async function seed(
  wallet: CreditWallet,
  { daily = 0, monthly = 0, purchased = 0 }: { daily?: number; monthly?: number; purchased?: number },
) {
  if (daily > 0) await wallet.grantDaily(OWNER, '2024-06-01', { dailyAllowance: daily });
  if (monthly > 0) await wallet.credit(OWNER, { amount: monthly, kind: 'monthly_grant' });
  if (purchased > 0) await wallet.credit(OWNER, { amount: purchased, kind: 'purchase' });
}

describe('CreditWallet.debit — fixed consumption order DAILY -> MONTHLY -> PURCHASED (Req 18.2/18.7)', () => {
  it('draws entirely from DAILY when it covers the debit', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await seed(wallet, { daily: 100, monthly: 50, purchased: 50 });

    const result = await wallet.debit(OWNER, 40, 'act-1');

    expect(result.total).toBe(40);
    expect(result.byBucket).toEqual({ daily: 40, monthly: 0, purchased: 0 });
    expect((await wallet.getBalance(ALICE, OWNER))).toMatchObject({
      daily: 60,
      monthly: 50,
      purchased: 50,
      total: 160,
    });
  });

  it('spills DAILY -> MONTHLY -> PURCHASED in order, summing to exactly the amount', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await seed(wallet, { daily: 30, monthly: 40, purchased: 100 });

    // 90 = 30 daily + 40 monthly + 20 purchased.
    const result = await wallet.debit(OWNER, 90, 'act-spill');

    expect(result.byBucket).toEqual({ daily: 30, monthly: 40, purchased: 20 });
    // Entries are appended in consumption order.
    expect(result.entries.map((e) => e.bucket)).toEqual(['DAILY', 'MONTHLY', 'PURCHASED']);
    // The magnitudes sum to exactly the requested amount.
    const summed = result.entries.reduce((s, e) => s + Math.abs(e.amount), 0);
    expect(summed).toBe(90);

    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance).toMatchObject({ daily: 0, monthly: 0, purchased: 80, total: 80 });
  });

  it('appends NEGATIVE debit entries so balance == sum(ledger)', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await seed(wallet, { monthly: 100 });

    await wallet.debit(OWNER, 25, 'act-neg');

    const debitRows = prisma._rows.filter((r) => r.entryType === 'debit');
    expect(debitRows).toHaveLength(1);
    expect(debitRows[0].amount).toBe(-25);
    expect(debitRows[0].bucket).toBe('MONTHLY');
  });
});

describe('CreditWallet.debit — fails closed, total never negative (Req 18.3 / 16.2)', () => {
  it('rejects with OUT_OF_CREDITS when total < amount and appends NOTHING', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await seed(wallet, { daily: 10, monthly: 5 }); // total 15

    await expect(wallet.debit(OWNER, 20, 'act-oc')).rejects.toMatchObject({
      statusCode: 402,
      code: 'OUT_OF_CREDITS',
    });

    // No debit entry was appended; balance is unchanged and non-negative.
    expect(prisma._rows.some((r) => r.entryType === 'debit')).toBe(false);
    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.total).toBe(15);
    expect(balance.total).toBeGreaterThanOrEqual(0);
  });

  it('debiting the EXACT total succeeds and lands the balance at zero (never below)', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await seed(wallet, { daily: 10, monthly: 5, purchased: 5 }); // total 20

    await wallet.debit(OWNER, 20, 'act-exact');

    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.total).toBe(0);
    expect(balance.total).toBeGreaterThanOrEqual(0);
  });

  it('rejects a non-positive / fractional amount with INVALID_AMOUNT (no entry)', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await seed(wallet, { purchased: 100 });
    for (const bad of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(wallet.debit(OWNER, bad as number, `bad-${bad}`)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_AMOUNT',
      });
    }
    expect(prisma._rows.some((r) => r.entryType === 'debit')).toBe(false);
  });

  it('rejects an empty actionKey with ACTION_KEY_REQUIRED', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await seed(wallet, { purchased: 100 });
    await expect(wallet.debit(OWNER, 10, '')).rejects.toMatchObject({
      statusCode: 400,
      code: 'ACTION_KEY_REQUIRED',
    });
  });
});

describe('CreditWallet.debit — idempotent by actionKey (Req 18.4)', () => {
  it('replaying the same actionKey appends nothing and returns the prior result', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await seed(wallet, { monthly: 100 });

    const first = await wallet.debit(OWNER, 30, 'dup');
    const rowsAfterFirst = prisma._rows.length;
    const second = await wallet.debit(OWNER, 30, 'dup');

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.total).toBe(first.total);
    expect(second.byBucket).toEqual(first.byBucket);
    // No new rows appended on replay.
    expect(prisma._rows.length).toBe(rowsAfterFirst);
    // Balance reflects a single 30-credit debit, not 60.
    expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(70);
  });

  it('distinct actionKeys debit independently', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await seed(wallet, { monthly: 100 });

    await wallet.debit(OWNER, 30, 'a');
    await wallet.debit(OWNER, 20, 'b');

    expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(50);
  });

  it('a concurrent replay that loses the @unique race returns the winning debit', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await seed(wallet, { monthly: 100 });

    const [r1, r2] = await Promise.all([
      wallet.debit(OWNER, 25, 'race'),
      wallet.debit(OWNER, 25, 'race'),
    ]);

    expect(r1.total).toBe(25);
    expect(r2.total).toBe(25);
    // Exactly one logical debit landed.
    expect((await wallet.getBalance(ALICE, OWNER)).total).toBe(75);
    expect(prisma._rows.filter((r) => r.entryType === 'debit')).toHaveLength(1);
  });
});
