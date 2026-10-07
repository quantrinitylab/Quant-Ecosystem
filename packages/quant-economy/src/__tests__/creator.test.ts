import { describe, it, expect, beforeEach } from 'vitest';
import { CreatorListingService } from '../creator/listings.js';
import { RevenueSplitEngine } from '../creator/revenue-split.js';
import { CreatorPayoutService } from '../creator/payouts.js';

describe('Creator Economy', () => {
  describe('CreatorListingService', () => {
    let listings: CreatorListingService;

    beforeEach(() => {
      listings = new CreatorListingService();
    });

    it('should create a listing', () => {
      const listing = listings.createListing(
        'creator-1',
        'Cool Skin',
        'A custom skin',
        'virtual_good',
        200,
      );
      expect(listing.id).toBeDefined();
      expect(listing.creatorId).toBe('creator-1');
      expect(listing.type).toBe('virtual_good');
      expect(listing.active).toBe(true);
    });

    it('should create a game pass listing', () => {
      const listing = listings.createListing(
        'creator-1',
        'VIP Pass',
        'Access all levels',
        'game_pass',
        500,
      );
      expect(listing.type).toBe('game_pass');
      expect(listing.priceCoins).toBe(500);
    });

    it('should delist an item', () => {
      const listing = listings.createListing('creator-1', 'Item', 'desc', 'virtual_good', 100);
      listings.delistItem(listing.id);
      const marketplace = listings.getMarketplaceListings();
      expect(marketplace).toHaveLength(0);
    });
  });

  describe('RevenueSplitEngine', () => {
    let engine: RevenueSplitEngine;

    beforeEach(() => {
      engine = new RevenueSplitEngine(0.7);
    });

    it('should calculate 70/30 split correctly', () => {
      const split = engine.calculateSplit(1000);
      expect(split.creatorAmount).toBe(700);
      expect(split.platformAmount).toBe(300);
    });

    it('should calculate split for decimal amounts', () => {
      const split = engine.calculateSplit(333);
      expect(split.creatorAmount).toBe(233.1);
      expect(split.platformAmount).toBe(99.9);
    });

    it('should record sales and accumulate earnings', () => {
      engine.recordSale('creator-1', 1000);
      engine.recordSale('creator-1', 500);
      const earnings = engine.getCreatorEarnings('creator-1');
      expect(earnings).toBe(1050); // 700 + 350
    });
  });

  describe('CreatorPayoutService', () => {
    let revEngine: RevenueSplitEngine;
    let payoutService: CreatorPayoutService;

    beforeEach(() => {
      revEngine = new RevenueSplitEngine(0.7);
      payoutService = new CreatorPayoutService(revEngine, 100);
    });

    it('should request a cash-out when earnings available', () => {
      revEngine.recordSale('creator-1', 1000); // earns 700
      const result = payoutService.requestCashOut('creator-1', 500, 'bank_transfer');
      expect(result.success).toBe(true);
      expect(result.payout?.status).toBe('pending');
    });

    it('should reject cash-out below minimum', () => {
      revEngine.recordSale('creator-1', 1000);
      const result = payoutService.requestCashOut('creator-1', 50, 'bank_transfer');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Minimum payout');
    });

    it('should reject cash-out exceeding available earnings', () => {
      revEngine.recordSale('creator-1', 200); // earns 140
      const result = payoutService.requestCashOut('creator-1', 200, 'bank_transfer');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient earnings');
    });

    it('should process payout status transitions', () => {
      revEngine.recordSale('creator-1', 1000);
      const result = payoutService.requestCashOut('creator-1', 500, 'bank_transfer');
      const processed = payoutService.processPayout(result.payout!.id, 'completed');
      expect(processed?.status).toBe('completed');
      expect(processed?.processedAt).toBeInstanceOf(Date);
    });
  });
});
