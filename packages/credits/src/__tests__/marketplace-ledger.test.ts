// @vitest-environment node
// ============================================================================
// MarketplaceLedger — atomic in-credits purchase with commission split
// ============================================================================
//
// Verifies the design "Correctness Property 6":
//   * ATOMIC settlement: buyer debited, seller credited net, treasury credited
//     commission — all in one transaction.
//   * IDEMPOTENT: replaying the same purchaseId settles at most once (no
//     double-spend / double-delivery).
//   * FAIL CLOSED: an insufficient buyer balance rejects the WHOLE unit with
//     OUT_OF_CREDITS and moves nothing.
//   * COMMISSION split: seller proceeds + commission == price exactly.

import { describe, it, expect } from 'vitest';
import { MarketplaceLedger, CreditWallet, ownerOnlyAuthz } from '../index';

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

/**
 * An in-memory prisma double that records ledger rows, ENFORCES the unique
 * actionKey constraint (throwing a Prisma P2002 on a duplicate so the
 * idempotency paths exercise the real lost-race branch), and runs
 * `$transaction(fn)` by invoking fn with itself (single connection).
 */
function createPrisma() {
  const rows: LedgerRow[] = [];
  let n = 0;
  const api = {
    _rows: rows,
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      // Snapshot for naive rollback so a thrown leg leaves no partial rows.
      const snapshot = rows.map((r) => ({ ...r }));
      try {
        return await fn(api);
      } catch (err) {
        rows.length = 0;
        rows.push(...snapshot);
        throw err;
      }
    },
    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
        const actionKey = (data.actionKey as string | null) ?? null;
        if (actionKey != null && rows.some((r) => r.actionKey === actionKey)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
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
        where?: { actionKey?: string; ownerRef?: string; entryType?: string; utcDay?: string };
      } = {}): Promise<LedgerRow | null> {
        const match = rows.find((r) => {
          if (where?.actionKey != null && r.actionKey !== where.actionKey) return false;
          if (where?.ownerRef != null && r.ownerRef !== where.ownerRef) return false;
          if (where?.entryType != null && r.entryType !== where.entryType) return false;
          if (where?.utcDay != null && r.utcDay !== where.utcDay) return false;
          return true;
        });
        return match ? { ...match } : null;
      },
    },
  };
  return api;
}

let idSeq = 0;
const seqIds = () => () => `id-${++idSeq}`;

const BUYER = { ownerId: 'buyer', ownerType: 'user' as const, tenantId: 't' };
const SELLER = { ownerId: 'seller', ownerType: 'user' as const, tenantId: 't' };

async function fund(prisma: ReturnType<typeof createPrisma>, owner: typeof BUYER, amount: number) {
  const wallet = new CreditWallet(prisma as never, { generateId: seqIds() });
  await wallet.credit(owner, { amount, kind: 'purchase' });
}

function balanceOf(prisma: ReturnType<typeof createPrisma>, ownerId: string): number {
  return prisma._rows.filter((r) => r.ownerRef === ownerId).reduce((s, r) => s + r.amount, 0);
}

describe('MarketplaceLedger.purchase — atomic settlement + commission', () => {
  it('debits buyer, credits seller net, credits treasury commission (10%)', async () => {
    const prisma = createPrisma();
    await fund(prisma, BUYER, 100);
    const mkt = new MarketplaceLedger(prisma as never, {
      defaultCommissionRate: 0.1,
      walletOptions: { generateId: seqIds(), authz: ownerOnlyAuthz },
    });

    const res = await mkt.purchase({
      purchaseId: 'p1',
      buyer: BUYER,
      seller: SELLER,
      listingId: 'skin-42',
      priceCredits: 100,
    });

    expect(res.priceCredits).toBe(100);
    expect(res.sellerProceeds).toBe(90);
    expect(res.commissionCredits).toBe(10);
    expect(res.replayed).toBe(false);
    // Buyer balance 100 -> 0; seller 0 -> 90; treasury 0 -> 10.
    expect(balanceOf(prisma, 'buyer')).toBe(0);
    expect(balanceOf(prisma, 'seller')).toBe(90);
    expect(balanceOf(prisma, 'platform')).toBe(10);
    // Seller proceeds + commission == price exactly.
    expect(res.sellerProceeds + res.commissionCredits).toBe(res.priceCredits);
  });

  it('is idempotent: replaying the same purchaseId settles at most once', async () => {
    const prisma = createPrisma();
    await fund(prisma, BUYER, 100);
    const mkt = new MarketplaceLedger(prisma as never, {
      defaultCommissionRate: 0.1,
      walletOptions: { generateId: seqIds() },
    });

    await mkt.purchase({
      purchaseId: 'p1',
      buyer: BUYER,
      seller: SELLER,
      listingId: 'x',
      priceCredits: 50,
    });
    const second = await mkt.purchase({
      purchaseId: 'p1',
      buyer: BUYER,
      seller: SELLER,
      listingId: 'x',
      priceCredits: 50,
    });

    expect(second.replayed).toBe(true);
    // Only ONE settlement happened: buyer 100-50=50, seller 45, treasury 5.
    expect(balanceOf(prisma, 'buyer')).toBe(50);
    expect(balanceOf(prisma, 'seller')).toBe(45);
    expect(balanceOf(prisma, 'platform')).toBe(5);
  });

  it('fails closed with OUT_OF_CREDITS when the buyer cannot fund the price (nothing moves)', async () => {
    const prisma = createPrisma();
    await fund(prisma, BUYER, 30);
    const mkt = new MarketplaceLedger(prisma as never, {
      defaultCommissionRate: 0.1,
      walletOptions: { generateId: seqIds() },
    });

    await expect(
      mkt.purchase({
        purchaseId: 'p1',
        buyer: BUYER,
        seller: SELLER,
        listingId: 'x',
        priceCredits: 100,
      }),
    ).rejects.toMatchObject({ statusCode: 402, code: 'OUT_OF_CREDITS' });

    // Nothing moved: buyer still 30, seller 0, treasury 0.
    expect(balanceOf(prisma, 'buyer')).toBe(30);
    expect(balanceOf(prisma, 'seller')).toBe(0);
    expect(balanceOf(prisma, 'platform')).toBe(0);
  });

  it('rejects a commission rate outside [0,1) and an invalid price', async () => {
    const prisma = createPrisma();
    await fund(prisma, BUYER, 100);
    const mkt = new MarketplaceLedger(prisma as never, { walletOptions: { generateId: seqIds() } });

    await expect(
      mkt.purchase({
        purchaseId: 'p1',
        buyer: BUYER,
        seller: SELLER,
        listingId: 'x',
        priceCredits: 100,
        commissionRate: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_COMMISSION_RATE' });

    await expect(
      mkt.purchase({
        purchaseId: 'p2',
        buyer: BUYER,
        seller: SELLER,
        listingId: 'x',
        priceCredits: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AMOUNT' });
  });

  it('rejects buyer == seller', async () => {
    const prisma = createPrisma();
    const mkt = new MarketplaceLedger(prisma as never, { walletOptions: { generateId: seqIds() } });
    await expect(
      mkt.purchase({
        purchaseId: 'p1',
        buyer: BUYER,
        seller: BUYER,
        listingId: 'x',
        priceCredits: 10,
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PARTIES' });
  });

  it('supports zero commission (no treasury entry)', async () => {
    const prisma = createPrisma();
    await fund(prisma, BUYER, 100);
    const mkt = new MarketplaceLedger(prisma as never, { walletOptions: { generateId: seqIds() } });
    const res = await mkt.purchase({
      purchaseId: 'p1',
      buyer: BUYER,
      seller: SELLER,
      listingId: 'x',
      priceCredits: 40,
    });
    expect(res.commissionCredits).toBe(0);
    expect(res.sellerProceeds).toBe(40);
    expect(balanceOf(prisma, 'platform')).toBe(0);
    expect(balanceOf(prisma, 'seller')).toBe(40);
  });
});
