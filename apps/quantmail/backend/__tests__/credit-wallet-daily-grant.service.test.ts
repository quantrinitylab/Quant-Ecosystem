// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 26.1 — CreditWallet.grantDaily (idempotent daily
// free allowance with non-rolling UTC reset)
// (Requirements 17.1, 17.2, 17.3)
// ============================================================================
//
// Verifies the daily-allowance behaviour:
//   * grantDaily appends EXACTLY ONE `daily_grant` entry sized to the resolved
//     daily allowance, in the DAILY bucket (Req 17.1).
//   * calling grantDaily twice for the same (owner, utcDay) is a NO-OP — still
//     exactly one daily_grant, and the same entry is returned (Req 17.2).
//   * a new utcDay grants again (Req 17.1).
//   * the previous day's UNUSED daily remainder does NOT roll over into the new
//     day's spendable daily balance (Req 17.3).
//   * the daily allowance comes from an injectable source / per-call override.
//   * total == SUM(ledger) is preserved (Req 16.1 invariant kept intact).

import { describe, it, expect } from 'vitest';
import { CreditWallet, DEFAULT_DAILY_ALLOWANCE } from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

// ---------------------------------------------------------------------------
// In-memory ledger prisma mock — create + findMany + findFirst. update/delete
// are intentionally absent so any mutation of an entry would be a hard failure
// (append-only by construction).
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

interface DailyWhere {
  ownerRef?: string;
  entryType?: string;
  utcDay?: string;
}

function matches(row: LedgerRow, where?: DailyWhere): boolean {
  if (where == null) return true;
  if (where.ownerRef != null && row.ownerRef !== where.ownerRef) return false;
  if (where.entryType != null && row.entryType !== where.entryType) return false;
  if (where.utcDay != null && row.utcDay !== where.utcDay) return false;
  return true;
}

function createLedgerPrisma() {
  const rows: LedgerRow[] = [];
  let n = 0;
  const prisma = {
    _rows: rows,
    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
        // Enforce the @unique(actionKey) constraint so idempotency races are
        // exercised the way the real DB would behave.
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
      async findMany({ where }: { where?: DailyWhere } = {}): Promise<LedgerRow[]> {
        return rows.filter((r) => matches(r, where)).map((r) => ({ ...r }));
      },
      async findFirst({ where }: { where?: DailyWhere } = {}): Promise<LedgerRow | null> {
        const hit = rows.find((r) => matches(r, where));
        return hit ? { ...hit } : null;
      },
    },
  };
  return prisma;
}

function seqIds() {
  let i = 0;
  return () => `id-${++i}`;
}

const OWNER = { ownerId: 'alice', ownerType: 'user' as const, tenantId: 'tenant-A' };
const ALICE: OwnershipPrincipal = { principalId: 'alice', tenantId: 'tenant-A' };

const DAY_1 = '2024-06-01';
const DAY_2 = '2024-06-02';

/** Sum the raw ledger amounts (the authoritative balance, Req 16.1). */
function ledgerSum(prisma: ReturnType<typeof createLedgerPrisma>): number {
  return prisma._rows.reduce((acc, r) => acc + r.amount, 0);
}

describe('CreditWallet.grantDaily — appends exactly one daily_grant of the allowance (Req 17.1)', () => {
  it('appends ONE daily_grant entry in the DAILY bucket sized to the allowance', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, {
      generateId: seqIds(),
      dailyAllowanceProvider: () => 50,
    });

    const entry = await wallet.grantDaily(OWNER, DAY_1);

    expect(entry.entryType).toBe('daily_grant');
    expect(entry.bucket).toBe('DAILY');
    expect(entry.amount).toBe(50);
    expect(entry.utcDay).toBe(DAY_1);

    // Exactly one daily_grant exists for the day.
    const grants = prisma._rows.filter((r) => r.entryType === 'daily_grant');
    expect(grants).toHaveLength(1);

    // It is reflected in the derived daily balance.
    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.daily).toBe(50);
    expect(balance.total).toBe(50);
  });

  it('uses DEFAULT_DAILY_ALLOWANCE when no provider/override is supplied', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });

    const entry = await wallet.grantDaily(OWNER, DAY_1);
    expect(entry.amount).toBe(DEFAULT_DAILY_ALLOWANCE);
  });

  it('honours a per-call dailyAllowance override over the provider', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, {
      generateId: seqIds(),
      dailyAllowanceProvider: () => 50,
    });

    const entry = await wallet.grantDaily(OWNER, DAY_1, { dailyAllowance: 7 });
    expect(entry.amount).toBe(7);
  });

  it('rejects an invalid utcDay with INVALID_UTC_DAY (no entry appended)', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    for (const bad of ['', '2024-6-1', '06/01/2024', 'today', '2024-06-01T00:00:00Z']) {
      await expect(wallet.grantDaily(OWNER, bad)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_UTC_DAY',
      });
    }
    expect(prisma._rows).toHaveLength(0);
  });

  it('rejects a fractional/negative resolved allowance with INVALID_DAILY_ALLOWANCE', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        wallet.grantDaily(OWNER, DAY_1, { dailyAllowance: bad as number }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_DAILY_ALLOWANCE' });
    }
    expect(prisma._rows.filter((r) => r.entryType === 'daily_grant')).toHaveLength(0);
  });
});

describe('CreditWallet.grantDaily — idempotent per (owner, UTC day) (Req 17.2)', () => {
  it('a second grant for the same (owner, utcDay) is a NO-OP and returns the same entry', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, {
      generateId: seqIds(),
      dailyAllowanceProvider: () => 50,
    });

    const first = await wallet.grantDaily(OWNER, DAY_1);
    const second = await wallet.grantDaily(OWNER, DAY_1);
    const third = await wallet.grantDaily(OWNER, DAY_1, { dailyAllowance: 999 });

    // Still exactly ONE daily_grant for that day; the same entry is returned.
    const grants = prisma._rows.filter((r) => r.entryType === 'daily_grant');
    expect(grants).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(third.amount).toBe(50); // the override on a repeat call is ignored

    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.daily).toBe(50);
  });

  it('grants again for a NEW utcDay (Req 17.1)', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, {
      generateId: seqIds(),
      dailyAllowanceProvider: () => 50,
    });

    const d1 = await wallet.grantDaily(OWNER, DAY_1);
    const d2 = await wallet.grantDaily(OWNER, DAY_2);

    expect(d2.id).not.toBe(d1.id);
    const grants = prisma._rows.filter((r) => r.entryType === 'daily_grant');
    expect(grants.map((g) => g.utcDay).sort()).toEqual([DAY_1, DAY_2]);
  });

  it('scopes idempotency to the owner — a different owner grants independently', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, {
      generateId: seqIds(),
      dailyAllowanceProvider: () => 50,
    });

    await wallet.grantDaily(OWNER, DAY_1);
    await wallet.grantDaily({ ownerId: 'bob', tenantId: 'tenant-B' }, DAY_1);

    const grants = prisma._rows.filter((r) => r.entryType === 'daily_grant');
    expect(grants).toHaveLength(2);
  });
});

describe('CreditWallet.grantDaily — non-rollover of unused daily remainder (Req 17.3)', () => {
  it('does NOT carry the previous day’s unused daily credits into the new day', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, {
      generateId: seqIds(),
      dailyAllowanceProvider: () => 50,
    });

    // Day 1: grant 50. Simulate spending 20 of it (a daily debit), leaving 30
    // unused in the DAILY bucket.
    await wallet.grantDaily(OWNER, DAY_1);
    prisma._rows.push({
      id: 'debit-1',
      ownerRef: 'alice',
      ownerType: 'user',
      tenantId: 'tenant-A',
      entryType: 'debit',
      bucket: 'DAILY',
      amount: -20,
      actionKey: 'spend-1',
      sourceRef: null,
      utcDay: DAY_1,
      reason: 'spent',
      createdAt: new Date(),
    });

    const day1Balance = await wallet.getBalance(ALICE, OWNER);
    expect(day1Balance.daily).toBe(30); // 50 granted - 20 spent

    // Day 2: grant again. The 30 unused from day 1 must NOT roll over — the new
    // day's spendable daily balance reflects only the new 50-credit grant.
    await wallet.grantDaily(OWNER, DAY_2);

    const day2Balance = await wallet.getBalance(ALICE, OWNER);
    expect(day2Balance.daily).toBe(50);

    // The authoritative invariant still holds: total == SUM(ledger).
    expect(day2Balance.total).toBe(ledgerSum(prisma));
  });

  it('appends exactly one reconciling daily_expiry entry that zeroes the prior remainder', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, {
      generateId: seqIds(),
      dailyAllowanceProvider: () => 50,
    });

    await wallet.grantDaily(OWNER, DAY_1); // daily bucket = 50 unused
    await wallet.grantDaily(OWNER, DAY_2); // should expire the 50, then grant 50

    const expiries = prisma._rows.filter((r) => r.entryType === 'daily_expiry');
    expect(expiries).toHaveLength(1);
    expect(expiries[0].amount).toBe(-50);
    expect(expiries[0].bucket).toBe('DAILY');

    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.daily).toBe(50);
  });

  it('does NOT append an expiry entry when there is no prior daily remainder', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, {
      generateId: seqIds(),
      dailyAllowanceProvider: () => 50,
    });

    // First-ever grant: nothing to expire.
    await wallet.grantDaily(OWNER, DAY_1);
    expect(prisma._rows.filter((r) => r.entryType === 'daily_expiry')).toHaveLength(0);

    // Fully spend day 1's allowance, then grant day 2: remainder is 0, so no
    // expiry entry is appended.
    prisma._rows.push({
      id: 'debit-full',
      ownerRef: 'alice',
      ownerType: 'user',
      tenantId: 'tenant-A',
      entryType: 'debit',
      bucket: 'DAILY',
      amount: -50,
      actionKey: 'spend-full',
      sourceRef: null,
      utcDay: DAY_1,
      reason: 'spent all',
      createdAt: new Date(),
    });
    await wallet.grantDaily(OWNER, DAY_2);
    expect(prisma._rows.filter((r) => r.entryType === 'daily_expiry')).toHaveLength(0);

    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.daily).toBe(50);
  });
});
