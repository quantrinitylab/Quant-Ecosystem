// ============================================================================
// Payments - Creator Subscription Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { CreatorSubscriptionService } from '../creator-subscription.service';

describe('CreatorSubscriptionService', () => {
  let service: CreatorSubscriptionService;

  beforeEach(() => {
    service = new CreatorSubscriptionService();
  });

  describe('createTier', () => {
    it('should create a subscription tier', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Early access', 'Exclusive content'],
      });

      expect(tier.creatorId).toBe('creator_1');
      expect(tier.name).toBe('Gold');
      expect(tier.priceMonthly).toBe(9.99);
      expect(tier.benefits).toEqual(['Early access', 'Exclusive content']);
      expect(tier.subscriberCount).toBe(0);
      expect(tier.active).toBe(true);
    });

    it('should reject empty name', () => {
      expect(() =>
        service.createTier({
          creatorId: 'creator_1',
          name: '',
          priceMonthly: 9.99,
          benefits: ['Benefit 1'],
        }),
      ).toThrow();
    });

    it('should reject zero price', () => {
      expect(() =>
        service.createTier({
          creatorId: 'creator_1',
          name: 'Gold',
          priceMonthly: 0,
          benefits: ['Benefit 1'],
        }),
      ).toThrow();
    });

    it('should reject empty benefits array', () => {
      expect(() =>
        service.createTier({
          creatorId: 'creator_1',
          name: 'Gold',
          priceMonthly: 9.99,
          benefits: [],
        }),
      ).toThrow();
    });
  });

  describe('updateTier', () => {
    it('should update tier name', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });

      const updated = service.updateTier({ tierId: tier.id, name: 'Platinum' });
      expect(updated.name).toBe('Platinum');
      expect(updated.priceMonthly).toBe(9.99);
    });

    it('should update tier price', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });

      const updated = service.updateTier({ tierId: tier.id, priceMonthly: 14.99 });
      expect(updated.priceMonthly).toBe(14.99);
    });

    it('should throw for non-existent tier', () => {
      expect(() => service.updateTier({ tierId: 'fake_id', name: 'New' })).toThrow(
        'Tier not found',
      );
    });
  });

  describe('deleteTier', () => {
    it('should deactivate a tier', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });

      service.deleteTier(tier.id);

      // Cannot subscribe to deleted tier
      expect(() =>
        service.subscribe({ fanId: 'fan_1', creatorId: 'creator_1', tierId: tier.id }),
      ).toThrow('Tier is not active');
    });

    it('should throw for non-existent tier', () => {
      expect(() => service.deleteTier('fake_id')).toThrow('Tier not found');
    });
  });

  describe('subscribe', () => {
    it('should create a subscription', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });

      const sub = service.subscribe({
        fanId: 'fan_1',
        creatorId: 'creator_1',
        tierId: tier.id,
      });

      expect(sub.fanId).toBe('fan_1');
      expect(sub.creatorId).toBe('creator_1');
      expect(sub.tierId).toBe(tier.id);
      expect(sub.status).toBe('active');
    });

    it('should increment subscriber count', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });

      service.subscribe({ fanId: 'fan_1', creatorId: 'creator_1', tierId: tier.id });
      service.subscribe({ fanId: 'fan_2', creatorId: 'creator_1', tierId: tier.id });

      const subscribers = service.getSubscribers('creator_1');
      expect(subscribers).toHaveLength(2);
    });

    it('should reject duplicate subscription', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });

      service.subscribe({ fanId: 'fan_1', creatorId: 'creator_1', tierId: tier.id });

      expect(() =>
        service.subscribe({ fanId: 'fan_1', creatorId: 'creator_1', tierId: tier.id }),
      ).toThrow('Already subscribed');
    });

    it('should reject subscription to wrong creator tier', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });

      expect(() =>
        service.subscribe({ fanId: 'fan_1', creatorId: 'creator_2', tierId: tier.id }),
      ).toThrow('Tier does not belong to this creator');
    });

    it('should reject empty fanId', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });

      expect(() =>
        service.subscribe({ fanId: '', creatorId: 'creator_1', tierId: tier.id }),
      ).toThrow();
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel an active subscription', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });
      const sub = service.subscribe({ fanId: 'fan_1', creatorId: 'creator_1', tierId: tier.id });

      const cancelled = service.cancelSubscription(sub.id);

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledAt).toBeDefined();
    });

    it('should decrement subscriber count', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });
      const sub = service.subscribe({ fanId: 'fan_1', creatorId: 'creator_1', tierId: tier.id });
      service.cancelSubscription(sub.id);

      const subscribers = service.getSubscribers('creator_1');
      expect(subscribers).toHaveLength(0);
    });

    it('should throw for already cancelled subscription', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });
      const sub = service.subscribe({ fanId: 'fan_1', creatorId: 'creator_1', tierId: tier.id });
      service.cancelSubscription(sub.id);

      expect(() => service.cancelSubscription(sub.id)).toThrow('already cancelled');
    });

    it('should throw for non-existent subscription', () => {
      expect(() => service.cancelSubscription('fake_id')).toThrow('Subscription not found');
    });
  });

  describe('getSubscribers', () => {
    it('should return only active subscriptions for a creator', () => {
      const tier = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });

      const sub1 = service.subscribe({ fanId: 'fan_1', creatorId: 'creator_1', tierId: tier.id });
      service.subscribe({ fanId: 'fan_2', creatorId: 'creator_1', tierId: tier.id });
      service.cancelSubscription(sub1.id);

      const subscribers = service.getSubscribers('creator_1');
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]!.fanId).toBe('fan_2');
    });
  });

  describe('getSubscriptions', () => {
    it('should return all subscriptions for a fan', () => {
      const tier1 = service.createTier({
        creatorId: 'creator_1',
        name: 'Gold',
        priceMonthly: 9.99,
        benefits: ['Benefit'],
      });
      const tier2 = service.createTier({
        creatorId: 'creator_2',
        name: 'Silver',
        priceMonthly: 4.99,
        benefits: ['Basic access'],
      });

      service.subscribe({ fanId: 'fan_1', creatorId: 'creator_1', tierId: tier1.id });
      service.subscribe({ fanId: 'fan_1', creatorId: 'creator_2', tierId: tier2.id });

      const subs = service.getSubscriptions('fan_1');
      expect(subs).toHaveLength(2);
    });
  });
});
