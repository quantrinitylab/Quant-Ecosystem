import type { BrandPartnership, PartnershipStatus } from '../types.js';

interface CreatorListing {
  id: string;
  creatorId: string;
  requirements: string;
  minDealValue: number;
  categories: string[];
  createdAt: Date;
}

interface MatchCriteria {
  categories?: string[];
  minFollowers?: number;
  maxBudget?: number;
}

export class BrandPartnershipService {
  private listings: CreatorListing[] = [];
  private partnerships: BrandPartnership[] = [];

  createListing(creatorId: string, requirements: string): CreatorListing {
    const listing: CreatorListing = {
      id: `listing-${crypto.randomUUID()}`,
      creatorId,
      requirements,
      minDealValue: 0,
      categories: [],
      createdAt: new Date(),
    };
    this.listings.push(listing);
    return listing;
  }

  matchCreators(_brandId: string, criteria: MatchCriteria): CreatorListing[] {
    let matched = this.listings;

    if (criteria.categories && criteria.categories.length > 0) {
      matched = matched.filter((l) => l.categories.some((c) => criteria.categories!.includes(c)));
    }

    if (criteria.maxBudget !== undefined) {
      matched = matched.filter((l) => l.minDealValue <= criteria.maxBudget!);
    }

    return matched;
  }

  proposeDeal(brandId: string, creatorId: string, terms: string): BrandPartnership {
    const partnership: BrandPartnership = {
      id: `partnership-${crypto.randomUUID()}`,
      creatorId,
      brandId,
      terms,
      status: 'proposed',
      dealValue: 0,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
    this.partnerships.push(partnership);
    return partnership;
  }

  acceptDeal(partnershipId: string): BrandPartnership {
    const partnership = this.partnerships.find((p) => p.id === partnershipId);
    if (!partnership) {
      throw new Error(`Partnership not found: ${partnershipId}`);
    }
    partnership.status = 'active' as PartnershipStatus;
    return partnership;
  }

  getActiveDeals(creatorId: string): BrandPartnership[] {
    return this.partnerships.filter((p) => p.creatorId === creatorId && p.status === 'active');
  }

  getAllDeals(creatorId: string): BrandPartnership[] {
    return this.partnerships.filter((p) => p.creatorId === creatorId);
  }
}
