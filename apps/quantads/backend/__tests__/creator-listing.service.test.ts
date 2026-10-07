// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DurableCreatorListingService,
  type CreatorListingRow,
} from '../services/creator-listing.service';

function createPrisma() {
  const rows: CreatorListingRow[] = [];
  let n = 0;
  return {
    _rows: rows,
    creatorListing: {
      async create({ data }: { data: Record<string, unknown> }): Promise<CreatorListingRow> {
        const now = new Date();
        const row: CreatorListingRow = {
          id: `l-${++n}`,
          creatorId: data.creatorId as string,
          title: data.title as string,
          description: data.description as string,
          type: data.type as string,
          priceCredits: data.priceCredits as number,
          status: (data.status as string) ?? 'active',
          createdAt: now,
          updatedAt: now,
        };
        rows.push(row);
        return { ...row };
      },
      async findMany({
        where,
      }: {
        where?: { creatorId?: string; status?: string };
      } = {}): Promise<CreatorListingRow[]> {
        return rows
          .filter((r) => {
            if (where?.creatorId != null && r.creatorId !== where.creatorId) return false;
            if (where?.status != null && r.status !== where.status) return false;
            return true;
          })
          .map((r) => ({ ...r }));
      },
      async findUnique({ where }: { where: { id: string } }): Promise<CreatorListingRow | null> {
        const m = rows.find((r) => r.id === where.id);
        return m ? { ...m } : null;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }): Promise<CreatorListingRow> {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
    },
  };
}

let prisma: ReturnType<typeof createPrisma>;
let svc: DurableCreatorListingService;
beforeEach(() => {
  prisma = createPrisma();
  svc = new DurableCreatorListingService(prisma as never);
});

describe('DurableCreatorListingService', () => {
  it('creates an active listing persisted with whole-credit price', async () => {
    const listing = await svc.createListing('creator-1', 'Skin Pack', 'cool', 'virtual_good', 100);
    expect(listing.status).toBe('active');
    expect(listing.priceCredits).toBe(100);
    expect(prisma._rows).toHaveLength(1);
  });

  it('rejects a non-whole or non-positive price', async () => {
    await expect(svc.createListing('c', 't', 'd', 'virtual_good', 10.5)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(svc.createListing('c', 't', 'd', 'virtual_good', 0)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('lists a creator listings and only active in the marketplace', async () => {
    const a = await svc.createListing('creator-1', 'A', 'd', 'virtual_good', 10);
    await svc.createListing('creator-1', 'B', 'd', 'game_pass', 20);
    await svc.createListing('creator-2', 'C', 'd', 'virtual_good', 30);
    await svc.delistListing(a.id);

    expect(await svc.getCreatorListings('creator-1')).toHaveLength(2);
    const market = await svc.getMarketplaceListings();
    expect(market.map((l) => l.title).sort()).toEqual(['B', 'C']);
  });

  it('fetches a listing by id (the durable purchase target)', async () => {
    const created = await svc.createListing('creator-1', 'A', 'd', 'virtual_good', 10);
    const found = await svc.getListing(created.id);
    expect(found?.id).toBe(created.id);
    expect(await svc.getListing('missing')).toBeNull();
  });
});
