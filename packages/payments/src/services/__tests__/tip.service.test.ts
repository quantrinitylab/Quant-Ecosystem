// ============================================================================
// Payments - Tip Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { TipService, PRESET_TIP_AMOUNTS } from '../tip.service';

describe('TipService', () => {
  let service: TipService;

  beforeEach(() => {
    service = new TipService();
  });

  describe('sendTip', () => {
    it('should send a tip with 95/5 split', () => {
      const tip = service.sendTip({
        fromUserId: 'user_1',
        toCreatorId: 'creator_1',
        amount: 10,
        message: 'Great video!',
      });

      expect(tip.fromUserId).toBe('user_1');
      expect(tip.toCreatorId).toBe('creator_1');
      expect(tip.amount).toBe(10);
      expect(tip.creatorShare).toBe(9.5);
      expect(tip.platformShare).toBe(0.5);
      expect(tip.message).toBe('Great video!');
    });

    it('should handle $1 preset amount correctly', () => {
      const tip = service.sendTip({
        fromUserId: 'user_1',
        toCreatorId: 'creator_1',
        amount: 1,
      });

      expect(tip.creatorShare).toBe(0.95);
      expect(tip.platformShare).toBe(0.05);
    });

    it('should handle $50 preset amount correctly', () => {
      const tip = service.sendTip({
        fromUserId: 'user_1',
        toCreatorId: 'creator_1',
        amount: 50,
      });

      expect(tip.creatorShare).toBe(47.5);
      expect(tip.platformShare).toBe(2.5);
    });

    it('should accept custom amounts > 0', () => {
      const tip = service.sendTip({
        fromUserId: 'user_1',
        toCreatorId: 'creator_1',
        amount: 7.5,
      });

      expect(tip.amount).toBe(7.5);
      expect(tip.creatorShare).toBe(7.13); // 7.5 * 0.95 = 7.125 -> 7.13
      expect(tip.platformShare).toBe(0.37); // 7.5 - 7.13 = 0.37
    });

    it('should reject zero amount', () => {
      expect(() =>
        service.sendTip({ fromUserId: 'user_1', toCreatorId: 'creator_1', amount: 0 }),
      ).toThrow();
    });

    it('should reject negative amount', () => {
      expect(() =>
        service.sendTip({ fromUserId: 'user_1', toCreatorId: 'creator_1', amount: -5 }),
      ).toThrow();
    });

    it('should reject tipping yourself', () => {
      expect(() =>
        service.sendTip({ fromUserId: 'user_1', toCreatorId: 'user_1', amount: 5 }),
      ).toThrow('Cannot tip yourself');
    });

    it('should reject empty fromUserId', () => {
      expect(() =>
        service.sendTip({ fromUserId: '', toCreatorId: 'creator_1', amount: 5 }),
      ).toThrow();
    });

    it('should reject empty toCreatorId', () => {
      expect(() => service.sendTip({ fromUserId: 'user_1', toCreatorId: '', amount: 5 })).toThrow();
    });

    it('should allow tip without message', () => {
      const tip = service.sendTip({
        fromUserId: 'user_1',
        toCreatorId: 'creator_1',
        amount: 5,
      });

      expect(tip.message).toBeUndefined();
    });
  });

  describe('PRESET_TIP_AMOUNTS', () => {
    it('should have correct preset values', () => {
      expect(PRESET_TIP_AMOUNTS).toEqual([1, 2, 5, 10, 20, 50]);
    });
  });

  describe('getTipsReceived', () => {
    it('should return tips for a creator', () => {
      service.sendTip({ fromUserId: 'user_1', toCreatorId: 'creator_1', amount: 5 });
      service.sendTip({ fromUserId: 'user_2', toCreatorId: 'creator_1', amount: 10 });
      service.sendTip({ fromUserId: 'user_1', toCreatorId: 'creator_2', amount: 2 });

      const tips = service.getTipsReceived('creator_1');
      expect(tips).toHaveLength(2);
    });

    it('should return empty array for no tips', () => {
      expect(service.getTipsReceived('creator_1')).toHaveLength(0);
    });

    it('should respect limit option', () => {
      service.sendTip({ fromUserId: 'user_1', toCreatorId: 'creator_1', amount: 5 });
      service.sendTip({ fromUserId: 'user_2', toCreatorId: 'creator_1', amount: 10 });
      service.sendTip({ fromUserId: 'user_3', toCreatorId: 'creator_1', amount: 20 });

      const tips = service.getTipsReceived('creator_1', { limit: 2 });
      expect(tips).toHaveLength(2);
    });
  });

  describe('getTipsSent', () => {
    it('should return tips sent by a user', () => {
      service.sendTip({ fromUserId: 'user_1', toCreatorId: 'creator_1', amount: 5 });
      service.sendTip({ fromUserId: 'user_1', toCreatorId: 'creator_2', amount: 10 });
      service.sendTip({ fromUserId: 'user_2', toCreatorId: 'creator_1', amount: 2 });

      const tips = service.getTipsSent('user_1');
      expect(tips).toHaveLength(2);
    });

    it('should return empty array for no tips sent', () => {
      expect(service.getTipsSent('user_1')).toHaveLength(0);
    });
  });
});
