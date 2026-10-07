// ============================================================================
// Payments - Pay-Per-View Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { PayPerViewService } from '../pay-per-view.service';

describe('PayPerViewService', () => {
  let service: PayPerViewService;

  beforeEach(() => {
    service = new PayPerViewService();
  });

  describe('createPaywall', () => {
    it('should create a paywall for content', () => {
      const paywall = service.createPaywall({
        creatorId: 'creator_1',
        contentId: 'content_1',
        price: 5,
        title: 'Exclusive Video',
      });

      expect(paywall.creatorId).toBe('creator_1');
      expect(paywall.contentId).toBe('content_1');
      expect(paywall.price).toBe(5);
      expect(paywall.title).toBe('Exclusive Video');
      expect(paywall.currency).toBe('USD');
      expect(paywall.accessCount).toBe(0);
      expect(paywall.revenue).toBe(0);
    });

    it('should reject duplicate paywall for same content', () => {
      service.createPaywall({
        creatorId: 'creator_1',
        contentId: 'content_1',
        price: 5,
        title: 'Video 1',
      });

      expect(() =>
        service.createPaywall({
          creatorId: 'creator_1',
          contentId: 'content_1',
          price: 10,
          title: 'Video 1 v2',
        }),
      ).toThrow('Paywall already exists');
    });

    it('should reject invalid price', () => {
      expect(() =>
        service.createPaywall({
          creatorId: 'creator_1',
          contentId: 'content_1',
          price: 0,
          title: 'Free',
        }),
      ).toThrow();
    });

    it('should reject empty title', () => {
      expect(() =>
        service.createPaywall({
          creatorId: 'creator_1',
          contentId: 'content_1',
          price: 5,
          title: '',
        }),
      ).toThrow();
    });
  });

  describe('purchaseAccess', () => {
    it('should grant access and apply 85/15 split', () => {
      service.createPaywall({
        creatorId: 'creator_1',
        contentId: 'content_1',
        price: 10,
        title: 'Premium Video',
      });

      const access = service.purchaseAccess({
        userId: 'user_1',
        contentId: 'content_1',
      });

      expect(access.userId).toBe('user_1');
      expect(access.contentId).toBe('content_1');
      expect(access.paidAmount).toBe(10);

      // Verify 85/15 split in revenue
      const revenue = service.getRevenue('creator_1');
      expect(revenue.total).toBe(8.5); // 85% of 10
    });

    it('should prevent duplicate purchase', () => {
      service.createPaywall({
        creatorId: 'creator_1',
        contentId: 'content_1',
        price: 5,
        title: 'Video',
      });

      service.purchaseAccess({ userId: 'user_1', contentId: 'content_1' });

      expect(() => service.purchaseAccess({ userId: 'user_1', contentId: 'content_1' })).toThrow(
        'Access already purchased',
      );
    });

    it('should throw when no paywall exists', () => {
      expect(() => service.purchaseAccess({ userId: 'user_1', contentId: 'nonexistent' })).toThrow(
        'No paywall found',
      );
    });

    it('should track access count', () => {
      service.createPaywall({
        creatorId: 'creator_1',
        contentId: 'content_1',
        price: 5,
        title: 'Video',
      });

      service.purchaseAccess({ userId: 'user_1', contentId: 'content_1' });
      service.purchaseAccess({ userId: 'user_2', contentId: 'content_1' });
      service.purchaseAccess({ userId: 'user_3', contentId: 'content_1' });

      const revenue = service.getRevenue('creator_1');
      // 5 * 0.85 = 4.25 per purchase, 3 purchases = 12.75 (exact with integer-cent math)
      expect(revenue.total).toBe(12.75);
    });

    it('should not drift with many purchases (integer-cent arithmetic)', () => {
      service.createPaywall({
        creatorId: 'creator_1',
        contentId: 'content_1',
        price: 5.07,
        title: 'Video',
      });

      for (let i = 0; i < 100; i++) {
        service.purchaseAccess({ userId: `user_${i}`, contentId: 'content_1' });
      }

      const revenue = service.getRevenue('creator_1');
      // 507 cents * 0.85 = 430.95 => Math.round = 431 cents per purchase
      // 100 * 431 = 43100 cents = $431.00
      expect(revenue.total).toBe(431.0);
      // Verify it's an exact number without floating-point imprecision
      expect(revenue.total.toString()).not.toContain('000000');
    });
  });

  describe('checkAccess', () => {
    it('should return true for purchased content', () => {
      service.createPaywall({
        creatorId: 'creator_1',
        contentId: 'content_1',
        price: 5,
        title: 'Video',
      });

      service.purchaseAccess({ userId: 'user_1', contentId: 'content_1' });

      expect(service.checkAccess('user_1', 'content_1')).toBe(true);
    });

    it('should return false for unpurchased content', () => {
      service.createPaywall({
        creatorId: 'creator_1',
        contentId: 'content_1',
        price: 5,
        title: 'Video',
      });

      expect(service.checkAccess('user_1', 'content_1')).toBe(false);
    });

    it('should return false for non-existent user', () => {
      expect(service.checkAccess('nonexistent', 'content_1')).toBe(false);
    });
  });

  describe('getRevenue', () => {
    it('should return revenue breakdown by content', () => {
      service.createPaywall({
        creatorId: 'creator_1',
        contentId: 'content_1',
        price: 10,
        title: 'Video 1',
      });
      service.createPaywall({
        creatorId: 'creator_1',
        contentId: 'content_2',
        price: 20,
        title: 'Video 2',
      });

      service.purchaseAccess({ userId: 'user_1', contentId: 'content_1' });
      service.purchaseAccess({ userId: 'user_2', contentId: 'content_2' });

      const revenue = service.getRevenue('creator_1');
      expect(revenue.total).toBe(25.5); // 8.5 + 17
      expect(revenue.byContent.get('content_1')).toBe(8.5);
      expect(revenue.byContent.get('content_2')).toBe(17);
    });

    it('should return zero for creator with no paywalls', () => {
      const revenue = service.getRevenue('creator_new');
      expect(revenue.total).toBe(0);
      expect(revenue.byContent.size).toBe(0);
    });
  });
});
