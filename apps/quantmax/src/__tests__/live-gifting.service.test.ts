import { describe, it, expect, beforeEach } from 'vitest';
import { LiveGiftingService } from '../services/live-gifting.service';

describe('LiveGiftingService', () => {
  let service: LiveGiftingService;

  beforeEach(() => {
    service = new LiveGiftingService();
  });

  describe('getAvailableGifts', () => {
    it('should return default gifts', () => {
      const gifts = service.getAvailableGifts();
      expect(gifts.length).toBeGreaterThan(0);
      expect(gifts[0]?.name).toBeDefined();
      expect(gifts[0]?.coinCost).toBeGreaterThan(0);
    });
  });

  describe('sendGift', () => {
    it('should send a gift when user has sufficient balance', () => {
      const gifts = service.getAvailableGifts();
      const gift = gifts[0]!;
      service.addCoins('user-1', 100);

      const txn = service.sendGift('stream-1', 'user-1', gift.id, 1);
      expect(txn).not.toBeNull();
      expect(txn?.streamId).toBe('stream-1');
      expect(txn?.senderId).toBe('user-1');
      expect(txn?.quantity).toBe(1);
    });

    it('should fail when user has insufficient balance', () => {
      const gifts = service.getAvailableGifts();
      const expensive = gifts.find((g) => g.coinCost >= 100)!;
      service.addCoins('user-1', 1); // Not enough

      const txn = service.sendGift('stream-1', 'user-1', expensive.id, 1);
      expect(txn).toBeNull();
    });

    it('should deduct coins on successful send', () => {
      const gifts = service.getAvailableGifts();
      const gift = gifts[0]!;
      service.addCoins('user-1', 50);

      service.sendGift('stream-1', 'user-1', gift.id, 1);
      expect(service.getUserBalance('user-1')).toBe(50 - gift.coinCost);
    });

    it('should return null for invalid gift id', () => {
      service.addCoins('user-1', 1000);
      const txn = service.sendGift('stream-1', 'user-1', 'fake-gift', 1);
      expect(txn).toBeNull();
    });

    it('should handle multiple quantity', () => {
      const gifts = service.getAvailableGifts();
      const gift = gifts[0]!;
      service.addCoins('user-1', gift.coinCost * 5);

      const txn = service.sendGift('stream-1', 'user-1', gift.id, 3);
      expect(txn?.totalCoins).toBe(gift.coinCost * 3);
    });
  });

  describe('getGiftHistory', () => {
    it('should return transactions for a stream', () => {
      const gifts = service.getAvailableGifts();
      const gift = gifts[0]!;
      service.addCoins('user-1', 1000);

      service.sendGift('stream-1', 'user-1', gift.id, 1);
      service.sendGift('stream-2', 'user-1', gift.id, 1);

      const history = service.getGiftHistory('stream-1');
      expect(history).toHaveLength(1);
    });
  });

  describe('calculateCreatorEarnings', () => {
    it('should calculate total earnings for a stream', () => {
      const gifts = service.getAvailableGifts();
      const gift = gifts[0]!;
      service.addCoins('user-1', 1000);
      service.addCoins('user-2', 1000);

      service.sendGift('stream-1', 'user-1', gift.id, 2);
      service.sendGift('stream-1', 'user-2', gift.id, 3);

      const earnings = service.calculateCreatorEarnings('stream-1');
      expect(earnings.totalGifts).toBe(2);
      expect(earnings.totalCoins).toBe(gift.coinCost * 5);
      expect(earnings.estimatedRevenue).toBeGreaterThan(0);
    });

    it('should identify top gifters', () => {
      const gifts = service.getAvailableGifts();
      const gift = gifts[0]!;
      service.addCoins('user-1', 1000);
      service.addCoins('user-2', 1000);

      service.sendGift('stream-1', 'user-1', gift.id, 1);
      service.sendGift('stream-1', 'user-2', gift.id, 5);

      const earnings = service.calculateCreatorEarnings('stream-1');
      expect(earnings.topGifters[0]?.userId).toBe('user-2');
    });
  });

  describe('getTopGifters', () => {
    it('should limit results', () => {
      const gifts = service.getAvailableGifts();
      const gift = gifts[0]!;
      service.addCoins('u1', 1000);
      service.addCoins('u2', 1000);
      service.addCoins('u3', 1000);

      service.sendGift('s1', 'u1', gift.id, 1);
      service.sendGift('s1', 'u2', gift.id, 1);
      service.sendGift('s1', 'u3', gift.id, 1);

      const top = service.getTopGifters('s1', 2);
      expect(top).toHaveLength(2);
    });
  });

  describe('getUserBalance', () => {
    it('should return 0 for new user', () => {
      expect(service.getUserBalance('new-user')).toBe(0);
    });

    it('should track added coins', () => {
      service.addCoins('user-1', 500);
      expect(service.getUserBalance('user-1')).toBe(500);
    });
  });

  describe('deductCoins', () => {
    it('should return false for insufficient balance', () => {
      service.addCoins('user-1', 10);
      expect(service.deductCoins('user-1', 20)).toBe(false);
    });

    it('should deduct and return true for sufficient balance', () => {
      service.addCoins('user-1', 100);
      expect(service.deductCoins('user-1', 50)).toBe(true);
      expect(service.getUserBalance('user-1')).toBe(50);
    });
  });
});
