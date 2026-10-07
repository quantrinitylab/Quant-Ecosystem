// @vitest-environment node
// ============================================================================
// quantmail-superhub · CreditWallet EARN kinds + earned-total accounting
// ============================================================================
//
// Verifies the economy "earn" path layered on the append-only ledger:
//   * credit() accepts the EARN kinds (creator_payout, boost_earning,
//     streak_reward, marketplace_sale, referral) and lands them in the
//     PURCHASED bucket so they spend like real-money credits (balance shape
//     unchanged: {daily, monthly, purchased, total}).
//   * each earn entry records its own `entryType` (not collapsed to "purchase")
//     so earnings stay identifiable for payout/withdrawal accounting.
//   * getEarnedTotal() sums ONLY the earn kinds (not purchases/grants), giving
//     the cash-out-eligible earned balance a future withdrawal flow draws on.

import { describe, it, expect } from 'vitest';
import { CreditWallet, EARN_CREDIT_KINDS, type CreditKind } from '../modules/billing';
import type { OwnershipPrincipal } from '../shared/ownership-authz';

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
}

function seqIds() {
  let i = 0;
  return () => `id-${++i}`;
}

const OWNER = { ownerId: 'creator-1', ownerType: 'user' as const, tenantId: 'tenant-A' };
const SELF: OwnershipPrincipal = { principalId: 'creator-1', tenantId: 'tenant-A' };

describe('CreditWallet — EARN kinds', () => {
  it('exposes the five earn kinds', () => {
    expect([...EARN_CREDIT_KINDS].sort()).toEqual(
      ['boost_earning', 'creator_payout', 'marketplace_sale', 'referral', 'streak_reward'].sort(),
    );
  });

  it('credits each earn kind into the PURCHASED bucket and records its entryType', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });

    for (const kind of EARN_CREDIT_KINDS as readonly CreditKind[]) {
      const entry = await wallet.credit(OWNER, { amount: 10, kind });
      expect(entry.bucket).toBe('PURCHASED');
      // The specific earn kind is preserved (not collapsed to "purchase").
      expect(entry.entryType).toBe(kind);
    }

    const balance = await wallet.getBalance(SELF, OWNER);
    // 5 earn kinds x 10 credits, all spendable via the PURCHASED bucket.
    expect(balance.purchased).toBe(50);
    expect(balance.monthly).toBe(0);
    expect(balance.daily).toBe(0);
    expect(balance.total).toBe(50);
  });

  it('getEarnedTotal sums only earn kinds, excluding purchases/grants/refunds', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });

    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' }); // bought, not earned
    await wallet.credit(OWNER, { amount: 40, kind: 'monthly_grant' }); // granted, not earned
    await wallet.credit(OWNER, { amount: 7, kind: 'refund' }); // correction, not earned
    await wallet.credit(OWNER, { amount: 25, kind: 'creator_payout' }); // earned
    await wallet.credit(OWNER, { amount: 15, kind: 'boost_earning' }); // earned
    await wallet.credit(OWNER, { amount: 5, kind: 'marketplace_sale' }); // earned

    const earned = await wallet.getEarnedTotal(SELF, OWNER);
    expect(earned).toBe(45); // 25 + 15 + 5

    // Earned credits are also part of the (spendable) purchased balance.
    const balance = await wallet.getBalance(SELF, OWNER);
    expect(balance.purchased).toBe(100 + 7 + 25 + 15 + 5);
    expect(balance.total).toBe(100 + 40 + 7 + 25 + 15 + 5);
  });

  it('getEarnedTotal is 0 for a wallet with no earnings', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });
    expect(await wallet.getEarnedTotal(SELF, OWNER)).toBe(0);
  });
});
