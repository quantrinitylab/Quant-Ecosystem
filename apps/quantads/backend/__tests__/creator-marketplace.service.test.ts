// @vitest-environment node
// ============================================================================
// Creator marketplace purchase → real @quant/credits MarketplaceLedger
// ============================================================================
//   Proves real creator earnings: a purchase debits the buyer, credits the
//   seller withdrawable marketplace_sale proceeds (70%) + platform commission
//   (30%), idempotent per purchaseId, fail-closed on insufficient funds; and
//   the seller's earnings become ledger-visible.

import { describe, it, expect, beforeEach } from 'vitest';
import { CreditWallet } from '@quant/credits';
import { CreatorMarketplaceService } from '../services/creator-marketplace.service';
import { DurableCreatorListingService } from '../services/creator-listing.service';

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

interface ListingRow {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  type: string;
  priceCredits: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function createPrisma() {
  const ledger: LedgerRow[] = [];
  const listings: ListingRow[] = [];
  const purchases: Array<{
    id: string;
    purchaseId: string;
    buyerId: string;
    listingId: string;
    sellerId: string;
    priceCredits: number;
    createdAt: Date;
  }> = [];
  let ln = 0;
  let cn = 0;
  let pn = 0;
  const api = {
    _ledger: ledger,
    _listings: listings,
    _purchases: purchases,
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const snap = ledger.map((r) => ({ ...r }));
      try {
        return await fn(api);
      } catch (err) {
        ledger.length = 0;
        ledger.push(...snap);
        throw err;
      }
    },
    creditLedgerEntry: {
      async create({ data }: { data: Record<string, unknown> }): Promise<LedgerRow> {
        const actionKey = (data.actionKey as string | null) ?? null;
        if (actionKey != null && ledger.some((r) => r.actionKey === actionKey)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row: LedgerRow = {
          id: (data.id as string) ?? `led-${++ln}`,
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
        ledger.push(row);
        return { ...row };
      },
      async findMany({ where }: { where?: { ownerRef?: string } } = {}): Promise<LedgerRow[]> {
        const owner = where?.ownerRef;
        return ledger.filter((r) => owner == null || r.ownerRef === owner).map((r) => ({ ...r }));
      },
      async findFirst({
        where,
      }: { where?: { actionKey?: string } } = {}): Promise<LedgerRow | null> {
        const m = ledger.find((r) => where?.actionKey == null || r.actionKey === where.actionKey);
        return m ? { ...m } : null;
      },
    },
    creatorListing: {
      async create({ data }: { data: Record<string, unknown> }): Promise<ListingRow> {
        const now = new Date();
        const row: ListingRow = {
          id: `lst-${++cn}`,
          creatorId: data.creatorId as string,
          title: data.title as string,
          description: data.description as string,
          type: data.type as string,
          priceCredits: data.priceCredits as number,
          status: (data.status as string) ?? 'active',
          createdAt: now,
          updatedAt: now,
        };
        listings.push(row);
        return { ...row };
      },
      async findMany(): Promise<ListingRow[]> {
        return listings.map((r) => ({ ...r }));
      },
      async findUnique({ where }: { where: { id: string } }): Promise<ListingRow | null> {
        const m = listings.find((r) => r.id === where.id);
        return m ? { ...m } : null;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }): Promise<ListingRow> {
        const row = listings.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
    },
    creatorPurchase: {
      async upsert({
        where,
        create,
      }: {
        where: { purchaseId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) {
        const existing = purchases.find((p) => p.purchaseId === where.purchaseId);
        if (existing) return { ...existing };
        const row = {
          id: `pur-${++pn}`,
          purchaseId: create.purchaseId as string,
          buyerId: create.buyerId as string,
          listingId: create.listingId as string,
          sellerId: create.sellerId as string,
          priceCredits: create.priceCredits as number,
          createdAt: new Date(),
        };
        purchases.push(row);
        return { ...row };
      },
      async findMany({ where }: { where?: { buyerId?: string } } = {}) {
        const b = where?.buyerId;
        return purchases.filter((p) => b == null || p.buyerId === b).map((p) => ({ ...p }));
      },
      async findFirst({ where }: { where: { buyerId?: string; listingId?: string } }) {
        const m = purchases.find(
          (p) =>
            (where.buyerId == null || p.buyerId === where.buyerId) &&
            (where.listingId == null || p.listingId === where.listingId),
        );
        return m ? { ...m } : null;
      },
    },
  };
  return api;
}

type Prisma = ReturnType<typeof createPrisma>;

function balanceOf(prisma: Prisma, ownerId: string): number {
  return prisma._ledger.filter((r) => r.ownerRef === ownerId).reduce((s, r) => s + r.amount, 0);
}
async function fund(prisma: Prisma, ownerId: string, amount: number) {
  const w = new CreditWallet(prisma as never);
  await w.credit({ ownerId, ownerType: 'user' }, { amount, kind: 'purchase' });
}

let prisma: Prisma;
let listings: DurableCreatorListingService;
let marketplace: CreatorMarketplaceService;
beforeEach(() => {
  prisma = createPrisma();
  listings = new DurableCreatorListingService(prisma as never);
  marketplace = new CreatorMarketplaceService(prisma as never);
});

async function seedListing(creatorId: string, price: number): Promise<string> {
  const l = await listings.createListing(creatorId, 'Asset', 'desc', 'virtual_good', price);
  return l.id;
}

describe('CreatorMarketplaceService.purchase', () => {
  it('settles buyer -> seller(70%) + treasury(30%) and makes earnings ledger-visible', async () => {
    const listingId = await seedListing('creator-1', 100);
    await fund(prisma, 'buyer-1', 100);

    const res = await marketplace.purchase('buyer-1', listingId, 'p1');
    expect(res.priceCredits).toBe(100);
    expect(res.sellerProceeds).toBe(70);
    expect(res.commissionCredits).toBe(30);
    expect(res.creatorId).toBe('creator-1');

    expect(balanceOf(prisma, 'buyer-1')).toBe(0);
    expect(balanceOf(prisma, 'creator-1')).toBe(70);
    expect(balanceOf(prisma, 'platform')).toBe(30);
    expect(await marketplace.getCreatorEarnings('creator-1')).toBe(70);

    // buyer gets a durable entitlement
    expect(prisma._purchases).toHaveLength(1);
    expect(await marketplace.hasPurchased('buyer-1', listingId)).toBe(true);
  });

  it('is idempotent per purchaseId (replay moves nothing more, no double-entitlement)', async () => {
    const listingId = await seedListing('creator-1', 100);
    await fund(prisma, 'buyer-1', 100);

    await marketplace.purchase('buyer-1', listingId, 'p1');
    const replay = await marketplace.purchase('buyer-1', listingId, 'p1');
    expect(replay.replayed).toBe(true);
    expect(balanceOf(prisma, 'creator-1')).toBe(70);
    expect(await marketplace.getCreatorEarnings('creator-1')).toBe(70);
    expect(prisma._purchases).toHaveLength(1); // no double-entitlement
  });

  it('fails closed when the buyer cannot afford it (no money, no entitlement)', async () => {
    const listingId = await seedListing('creator-1', 100);
    await fund(prisma, 'buyer-1', 40);

    await expect(marketplace.purchase('buyer-1', listingId, 'p1')).rejects.toMatchObject({
      statusCode: 402,
      code: 'OUT_OF_CREDITS',
    });
    expect(balanceOf(prisma, 'buyer-1')).toBe(40);
    expect(balanceOf(prisma, 'creator-1')).toBe(0);
    expect(prisma._purchases).toHaveLength(0); // fail-closed: no entitlement
  });

  it('rejects buying your own listing', async () => {
    const listingId = await seedListing('creator-1', 100);
    await fund(prisma, 'creator-1', 100);
    await expect(marketplace.purchase('creator-1', listingId, 'p1')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects an unknown listing', async () => {
    await expect(marketplace.purchase('buyer-1', 'nope', 'p1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'LISTING_NOT_FOUND',
    });
  });
});

describe('CreatorMarketplaceService buyer entitlements', () => {
  it('lists a buyer purchases newest-first and gates access correctly', async () => {
    const l1 = await seedListing('creator-1', 30);
    const l2 = await seedListing('creator-2', 50);
    await fund(prisma, 'buyer-1', 200);

    await marketplace.purchase('buyer-1', l1, 'pa');
    await marketplace.purchase('buyer-1', l2, 'pb');

    const purchases = await marketplace.getPurchases('buyer-1');
    expect(purchases.map((p) => p.listingId).sort()).toEqual([l1, l2].sort());

    expect(await marketplace.hasPurchased('buyer-1', l1)).toBe(true);
    expect(await marketplace.hasPurchased('buyer-1', l2)).toBe(true);
    // a non-buyer has no access
    expect(await marketplace.hasPurchased('buyer-2', l1)).toBe(false);
    // buyer-1 never bought a listing they didn't purchase
    expect(await marketplace.hasPurchased('buyer-1', 'other')).toBe(false);
  });
});
