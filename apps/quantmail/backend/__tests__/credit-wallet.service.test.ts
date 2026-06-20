// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 25.1 — CreditWallet over an append-only ledger
// (Requirements 16.1, 16.2, 16.3, 16.4, 16.5)
// ============================================================================
//
// Verifies the authoritative wallet behaviour:
//   * balance == SUM(ledger) and is broken down by bucket (Req 16.1).
//   * total is never negative (Req 16.2).
//   * the ledger is append-only — the service NEVER calls update/delete on a
//     ledger entry, and credit() appends EXACTLY ONE entry (Req 16.3/16.5).
//   * credit() increases the balance by exactly the granted amount (Req 16.5).
//   * getBalance() denies a non-owner/non-tenant-admin with 403 and allows the
//     owner + a same-tenant admin (Req 16.4).
//   * credit() rejects amount <= 0 / fractional and invalid kinds.

import { describe, it, expect, beforeEach } from 'vitest';
import { CreditWallet, type CreditKind } from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

// ---------------------------------------------------------------------------
// In-memory ledger prisma mock — records create() calls and FORBIDS mutation
// (update/delete are intentionally absent so an append-only violation would be
// a hard TypeError, proving the service never mutates the ledger).
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
  const prisma = {
    _rows: rows,
    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
        const row: LedgerRow = {
          id: (data.id as string) ?? `row-${++n}`,
          ownerRef: data.ownerRef as string,
          ownerType: (data.ownerType as string) ?? 'user',
          tenantId: (data.tenantId as string | null) ?? null,
          entryType: data.entryType as string,
          bucket: data.bucket as string,
          amount: data.amount as number,
          actionKey: (data.actionKey as string | null) ?? null,
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
    },
  };
  return prisma;
}

// A deterministic id generator for stable assertions.
function seqIds() {
  let i = 0;
  return () => `id-${++i}`;
}

const OWNER = { ownerId: 'alice', ownerType: 'user' as const, tenantId: 'tenant-A' };
const ALICE: OwnershipPrincipal = { principalId: 'alice', tenantId: 'tenant-A' };

describe('CreditWallet.getBalance — balance == sum(ledger), bucketed (Req 16.1)', () => {
  it('derives total and per-bucket balances from the ledger sum', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });

    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' }); // PURCHASED
    await wallet.credit(OWNER, { amount: 30, kind: 'monthly_grant' }); // MONTHLY
    await wallet.credit(OWNER, { amount: 20, kind: 'refund' }); // PURCHASED

    const balance = await wallet.getBalance(ALICE, OWNER);

    expect(balance.purchased).toBe(120);
    expect(balance.monthly).toBe(30);
    expect(balance.daily).toBe(0);
    expect(balance.total).toBe(150);
    // total ALWAYS equals the sum of the parts.
    expect(balance.total).toBe(balance.daily + balance.monthly + balance.purchased);
  });

  it('reports a zero balance for an owner with no ledger entries', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance).toEqual({ daily: 0, monthly: 0, purchased: 0, total: 0 });
  });

  it('scopes the balance to the requested owner only (no cross-owner sum)', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });

    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });
    // A different owner's entry must not affect alice's balance.
    await wallet.credit(
      { ownerId: 'bob', tenantId: 'tenant-B' },
      { amount: 999, kind: 'purchase' },
    );

    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.total).toBe(100);
  });
});

describe('CreditWallet — total is never negative (Req 16.2)', () => {
  it('keeps total >= 0 across grants', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await wallet.credit(OWNER, { amount: 5, kind: 'purchase' });
    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.total).toBeGreaterThanOrEqual(0);
  });

  it('throws BALANCE_INVARIANT_VIOLATED if the ledger ever summed below zero', async () => {
    const prisma = createLedgerPrisma();
    // Inject a rogue negative entry directly (bypassing credit()) to simulate a
    // corrupted ledger; getBalance must refuse to report a negative total.
    prisma._rows.push({
      id: 'rogue',
      ownerRef: 'alice',
      ownerType: 'user',
      tenantId: 'tenant-A',
      entryType: 'debit',
      bucket: 'PURCHASED',
      amount: -10,
      actionKey: null,
      sourceRef: null,
      utcDay: null,
      reason: 'corruption',
      createdAt: new Date(),
    });
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await expect(wallet.getBalance(ALICE, OWNER)).rejects.toMatchObject({
      statusCode: 500,
      code: 'BALANCE_INVARIANT_VIOLATED',
    });
  });
});

describe('CreditWallet.credit — append-only, exactly one entry of exact amount (Req 16.3/16.5)', () => {
  it('appends EXACTLY ONE ledger entry per credit, increasing balance by exactly the amount', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });

    const before = (await wallet.getBalance(ALICE, OWNER)).total;
    const entry = await wallet.credit(OWNER, { amount: 42, kind: 'purchase' });
    const after = (await wallet.getBalance(ALICE, OWNER)).total;

    // Exactly one row was appended.
    expect(prisma._rows.length).toBe(1);
    expect(entry.amount).toBe(42);
    expect(entry.entryType).toBe('purchase');
    expect(entry.bucket).toBe('PURCHASED');
    // Balance increased by EXACTLY the granted amount.
    expect(after - before).toBe(42);
  });

  it('never exposes update/delete on the ledger (append-only by construction)', () => {
    const prisma = createLedgerPrisma();
    // The mock deliberately omits update/delete; assert they are absent so any
    // attempt to mutate an entry would be a hard failure.
    expect((prisma.creditLedgerEntry as Record<string, unknown>).update).toBeUndefined();
    expect((prisma.creditLedgerEntry as Record<string, unknown>).delete).toBeUndefined();
  });

  it('routes each credit kind to the correct bucket', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    const expected: Record<CreditKind, string> = {
      purchase: 'PURCHASED',
      monthly_grant: 'MONTHLY',
      refund: 'PURCHASED',
      adjustment: 'PURCHASED',
      creator_payout: 'PURCHASED',
      boost_earning: 'PURCHASED',
      streak_reward: 'PURCHASED',
      marketplace_sale: 'PURCHASED',
      referral: 'PURCHASED',
    };
    for (const kind of Object.keys(expected) as CreditKind[]) {
      const entry = await wallet.credit(OWNER, { amount: 1, kind });
      expect(entry.bucket).toBe(expected[kind]);
    }
  });

  it('rejects a non-positive or fractional amount with INVALID_AMOUNT (no entry appended)', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    for (const bad of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        wallet.credit(OWNER, { amount: bad as number, kind: 'purchase' }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AMOUNT' });
    }
    expect(prisma._rows.length).toBe(0);
  });

  it('rejects an invalid kind with INVALID_KIND (no entry appended)', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await expect(
      wallet.credit(OWNER, { amount: 10, kind: 'debit' as unknown as CreditKind }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_KIND' });
    await expect(
      wallet.credit(OWNER, { amount: 10, kind: 'daily_grant' as unknown as CreditKind }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_KIND' });
    expect(prisma._rows.length).toBe(0);
  });
});

describe('CreditWallet.getBalance — ownership authz (Req 16.4)', () => {
  let prisma: ReturnType<typeof createLedgerPrisma>;
  let wallet: CreditWallet;

  beforeEach(async () => {
    prisma = createLedgerPrisma();
    wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });
  });

  it('ALLOWS the owner to read their own wallet', async () => {
    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.total).toBe(100);
  });

  it('ALLOWS a same-tenant admin to read the wallet (Req 16.4)', async () => {
    const tenantAdmin: OwnershipPrincipal = {
      principalId: 'admin-1',
      tenantId: 'tenant-A',
      isTenantAdmin: true,
    };
    const balance = await wallet.getBalance(tenantAdmin, OWNER);
    expect(balance.total).toBe(100);
  });

  it('DENIES a non-owner, non-admin with 403 (fail closed)', async () => {
    const stranger: OwnershipPrincipal = { principalId: 'mallory', tenantId: 'tenant-B' };
    await expect(wallet.getBalance(stranger, OWNER)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('DENIES a tenant admin of a DIFFERENT tenant with 403', async () => {
    const otherTenantAdmin: OwnershipPrincipal = {
      principalId: 'admin-2',
      tenantId: 'tenant-B',
      isTenantAdmin: true,
    };
    await expect(wallet.getBalance(otherTenantAdmin, OWNER)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
});
