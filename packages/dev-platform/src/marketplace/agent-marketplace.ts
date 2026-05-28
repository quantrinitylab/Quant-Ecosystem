import { AgentListing, MarketplaceListing } from '../types.js';
export class AgentMarketplace {
  private listings = new Map<string, AgentListing>();
  private statuses = new Map<string, MarketplaceListing>();
  // prettier-ignore
  publish(listing: AgentListing): MarketplaceListing { this.listings.set(listing.id, listing); const s: MarketplaceListing = { agentId: listing.id, status: 'pending', reviewedAt: null }; this.statuses.set(listing.id, s); return s; }
  // prettier-ignore
  approve(id: string) { const s = this.statuses.get(id); if (s) { s.status = 'approved'; s.reviewedAt = Date.now(); } }
  // prettier-ignore
  reject(id: string) { const s = this.statuses.get(id); if (s) { s.status = 'rejected'; s.reviewedAt = Date.now(); } }
  // prettier-ignore
  list(filter?: { minRating?: number }): AgentListing[] { return [...this.listings.values()].filter((l) => { const s = this.statuses.get(l.id); return s?.status === 'approved' && (!filter?.minRating || l.rating >= filter.minRating); }); }
  // prettier-ignore
  calculateRevenue(id: string, gross: number) { const l = this.listings.get(id); if (!l) return null; const dev = Math.round((gross * l.revenueSharePct) / 100); return { developer: dev, platform: gross - dev }; }
  // prettier-ignore
  getReviewQueue() { return [...this.statuses.values()].filter((s) => s.status === 'pending'); }
}
