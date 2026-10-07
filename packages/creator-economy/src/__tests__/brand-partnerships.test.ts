import { describe, it, expect, beforeEach } from 'vitest';
import { BrandPartnershipService } from '../brand-partnerships/partnership-service.js';

describe('BrandPartnershipService', () => {
  let service: BrandPartnershipService;

  beforeEach(() => {
    service = new BrandPartnershipService();
  });

  describe('createListing', () => {
    it('creates a creator listing', () => {
      const listing = service.createListing('creator-1', 'Looking for tech brands');
      expect(listing.creatorId).toBe('creator-1');
      expect(listing.requirements).toBe('Looking for tech brands');
      expect(listing.id).toBeDefined();
    });
  });

  describe('matchCreators', () => {
    it('returns all listings when no criteria match', () => {
      service.createListing('creator-1', 'Tech content');
      service.createListing('creator-2', 'Gaming content');
      const matches = service.matchCreators('brand-1', {});
      expect(matches).toHaveLength(2);
    });

    it('filters by max budget', () => {
      service.createListing('creator-1', 'Expensive creator');
      service.createListing('creator-2', 'Affordable creator');
      // All listings default to minDealValue of 0, so all match maxBudget > 0
      const matches = service.matchCreators('brand-1', { maxBudget: 500 });
      expect(matches).toHaveLength(2);
    });
  });

  describe('proposeDeal', () => {
    it('creates a partnership with proposed status', () => {
      const deal = service.proposeDeal('brand-1', 'creator-1', '3 sponsored posts');
      expect(deal.brandId).toBe('brand-1');
      expect(deal.creatorId).toBe('creator-1');
      expect(deal.terms).toBe('3 sponsored posts');
      expect(deal.status).toBe('proposed');
    });

    it('generates unique partnership ids', () => {
      const d1 = service.proposeDeal('brand-1', 'creator-1', 'terms 1');
      const d2 = service.proposeDeal('brand-1', 'creator-2', 'terms 2');
      expect(d1.id).not.toBe(d2.id);
    });
  });

  describe('acceptDeal', () => {
    it('changes status to active', () => {
      const deal = service.proposeDeal('brand-1', 'creator-1', 'terms');
      const accepted = service.acceptDeal(deal.id);
      expect(accepted.status).toBe('active');
    });

    it('throws for unknown partnership', () => {
      expect(() => service.acceptDeal('unknown')).toThrow('Partnership not found');
    });
  });

  describe('getActiveDeals', () => {
    it('returns only active deals for a creator', () => {
      const d1 = service.proposeDeal('brand-1', 'creator-1', 'deal 1');
      service.proposeDeal('brand-2', 'creator-1', 'deal 2');
      service.acceptDeal(d1.id);

      const active = service.getActiveDeals('creator-1');
      expect(active).toHaveLength(1);
      expect(active[0]!.id).toBe(d1.id);
    });

    it('returns empty for creator with no active deals', () => {
      expect(service.getActiveDeals('creator-1')).toHaveLength(0);
    });
  });
});
