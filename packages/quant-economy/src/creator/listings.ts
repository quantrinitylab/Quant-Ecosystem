import type { CreatorListing, ListingType } from '../types.js';

export class CreatorListingService {
  private listings = new Map<string, CreatorListing>();

  createListing(
    creatorId: string,
    title: string,
    description: string,
    type: ListingType,
    priceCoins: number,
  ): CreatorListing {
    const listing: CreatorListing = {
      id: crypto.randomUUID(),
      creatorId,
      title,
      description,
      type,
      priceCoins,
      active: true,
      createdAt: new Date(),
    };
    this.listings.set(listing.id, listing);
    return listing;
  }

  updateListing(
    id: string,
    updates: Partial<Pick<CreatorListing, 'title' | 'description' | 'priceCoins'>>,
  ): CreatorListing | null {
    const listing = this.listings.get(id);
    if (!listing) return null;

    if (updates.title !== undefined) listing.title = updates.title;
    if (updates.description !== undefined) listing.description = updates.description;
    if (updates.priceCoins !== undefined) listing.priceCoins = updates.priceCoins;

    return listing;
  }

  delistItem(id: string): boolean {
    const listing = this.listings.get(id);
    if (!listing) return false;
    listing.active = false;
    return true;
  }

  getCreatorListings(creatorId: string): CreatorListing[] {
    return [...this.listings.values()].filter((l) => l.creatorId === creatorId);
  }

  getMarketplaceListings(): CreatorListing[] {
    return [...this.listings.values()].filter((l) => l.active);
  }

  getListing(id: string): CreatorListing | undefined {
    return this.listings.get(id);
  }
}
