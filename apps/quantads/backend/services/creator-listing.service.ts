// ============================================================================
// QuantAds — durable creator-marketplace listings (Prisma-backed)
// ============================================================================
//
// Replaces the ephemeral in-memory @quant/quant-economy CreatorListingService
// for QuantAds: creator listings now persist in Postgres (creator_listings), so
// they survive restarts and can be the durable target of a real marketplace
// purchase (settled on the @quant/credits ledger in the purchase phase).
//
// Uses a narrow structural Prisma slice so it stays unit-testable with a fake;
// the real PrismaClient (CreatorListing model) satisfies it.

import { createAppError } from '@quant/server-core';

export type ListingType = 'virtual_good' | 'game_pass';

export interface CreatorListingRow {
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

/** The narrow Prisma slice this service needs (real PrismaClient satisfies it). */
export interface CreatorListingPrisma {
  creatorListing: {
    create(args: { data: Record<string, unknown> }): Promise<CreatorListingRow>;
    findMany(args: Record<string, unknown>): Promise<CreatorListingRow[]>;
    findUnique(args: { where: { id: string } }): Promise<CreatorListingRow | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<CreatorListingRow>;
  };
}

const LISTING_TYPES: readonly ListingType[] = ['virtual_good', 'game_pass'];

function isPositiveWhole(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

export class DurableCreatorListingService {
  constructor(private readonly prisma: CreatorListingPrisma) {}

  async createListing(
    creatorId: string,
    title: string,
    description: string,
    type: ListingType,
    priceCredits: number,
  ): Promise<CreatorListingRow> {
    if (!creatorId) throw createAppError('creatorId is required', 400, 'CREATOR_ID_REQUIRED');
    if (!LISTING_TYPES.includes(type)) {
      throw createAppError(`Invalid listing type '${String(type)}'`, 400, 'INVALID_LISTING_TYPE');
    }
    if (!isPositiveWhole(priceCredits)) {
      throw createAppError(
        'priceCredits must be a positive whole number of credits',
        400,
        'INVALID_PRICE',
      );
    }
    return this.prisma.creatorListing.create({
      data: { creatorId, title, description, type, priceCredits, status: 'active' },
    });
  }

  async getCreatorListings(creatorId: string): Promise<CreatorListingRow[]> {
    return this.prisma.creatorListing.findMany({
      where: { creatorId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMarketplaceListings(): Promise<CreatorListingRow[]> {
    return this.prisma.creatorListing.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getListing(id: string): Promise<CreatorListingRow | null> {
    return this.prisma.creatorListing.findUnique({ where: { id } });
  }

  async delistListing(id: string): Promise<CreatorListingRow | null> {
    const existing = await this.prisma.creatorListing.findUnique({ where: { id } });
    if (!existing) return null;
    return this.prisma.creatorListing.update({ where: { id }, data: { status: 'delisted' } });
  }
}
