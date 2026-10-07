// @vitest-environment node
// ============================================================================
// @quant/credits — barrel smoke test
// ============================================================================
//
// Proves the extracted package resolves through its public barrel and that the
// core money primitives behave: the canonical ownership filter (fail closed),
// and the append-only CreditWallet (balance == sum(ledger), exactly one entry
// per credit, owner-only reads). This is the package's own independent coverage;
// quantmail's full property/regression suite continues to exercise the same
// code paths through the compat shim.

import { describe, it, expect } from 'vitest';
import { CreditWallet, ownerOnlyAuthz, assertOwnership, type OwnershipPrincipal } from '../index';

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

const OWNER = { ownerId: 'alice', ownerType: 'user' as const, tenantId: 'tenant-A' };
const ALICE: OwnershipPrincipal = { principalId: 'alice', tenantId: 'tenant-A' };

describe('@quant/credits — ownerOnlyAuthz (fail closed)', () => {
  it('allows the owner and denies a stranger', () => {
    expect(ownerOnlyAuthz.isAuthorized(ALICE, { ownerId: 'alice' })).toBe(true);
    expect(ownerOnlyAuthz.isAuthorized({ principalId: 'mallory' }, { ownerId: 'alice' })).toBe(
      false,
    );
  });

  it('assertOwnership throws 403 FORBIDDEN for a non-owner', () => {
    expect(() =>
      assertOwnership(ownerOnlyAuthz, { principalId: 'mallory' }, { ownerId: 'alice' }),
    ).toThrowError(/Not authorized/);
  });
});

describe('@quant/credits — CreditWallet append-only ledger', () => {
  it('derives the balance as the sum of the ledger and appends one entry per credit', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });

    await wallet.credit(OWNER, { amount: 100, kind: 'purchase' });
    await wallet.credit(OWNER, { amount: 30, kind: 'monthly_grant' });

    const balance = await wallet.getBalance(ALICE, OWNER);
    expect(balance.purchased).toBe(100);
    expect(balance.monthly).toBe(30);
    expect(balance.total).toBe(130);
    expect(prisma._rows.length).toBe(2);
  });

  it('denies a non-owner reading the wallet with 403', async () => {
    const prisma = createLedgerPrisma();
    const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
    await wallet.credit(OWNER, { amount: 10, kind: 'purchase' });
    await expect(
      wallet.getBalance({ principalId: 'mallory', tenantId: 'tenant-B' }, OWNER),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });
});
