import { describe, it, expect, beforeEach } from 'vitest';
import { PayoutService } from '../payouts/payout-service.js';

describe('PayoutService', () => {
  let service: PayoutService;

  beforeEach(() => {
    service = new PayoutService();
  });

  describe('requestPayout', () => {
    it('creates a payout request with pending status', () => {
      service.addBalance('creator-1', 100);
      const payout = service.requestPayout('creator-1', 50, 'bank_transfer');
      expect(payout.creatorId).toBe('creator-1');
      expect(payout.amount).toBe(50);
      expect(payout.method).toBe('bank_transfer');
      expect(payout.status).toBe('pending');
    });

    it('throws on insufficient balance', () => {
      service.addBalance('creator-1', 20);
      expect(() => service.requestPayout('creator-1', 50, 'paypal')).toThrow(
        'Insufficient balance',
      );
    });

    it('deducts balance after payout request', () => {
      service.addBalance('creator-1', 100);
      service.requestPayout('creator-1', 60, 'bank_transfer');
      expect(service.calculateAvailableBalance('creator-1')).toBe(40);
    });
  });

  describe('processPayout', () => {
    it('updates status to processing', () => {
      service.addBalance('creator-1', 100);
      const payout = service.requestPayout('creator-1', 50, 'bank_transfer');
      const processed = service.processPayout(payout.id);
      expect(processed.status).toBe('processing');
    });

    it('throws for unknown payout id', () => {
      expect(() => service.processPayout('unknown')).toThrow('Payout not found');
    });
  });

  describe('calculateAvailableBalance', () => {
    it('returns 0 for unknown creator', () => {
      expect(service.calculateAvailableBalance('unknown')).toBe(0);
    });

    it('returns correct balance after additions', () => {
      service.addBalance('creator-1', 50);
      service.addBalance('creator-1', 30);
      expect(service.calculateAvailableBalance('creator-1')).toBe(80);
    });
  });

  describe('getPayoutHistory', () => {
    it('returns all payouts for a creator', () => {
      service.addBalance('creator-1', 200);
      service.requestPayout('creator-1', 50, 'bank_transfer');
      service.requestPayout('creator-1', 30, 'paypal');
      const history = service.getPayoutHistory('creator-1');
      expect(history).toHaveLength(2);
    });

    it('returns empty array for creator with no payouts', () => {
      expect(service.getPayoutHistory('creator-1')).toHaveLength(0);
    });
  });

  describe('getPayoutStatus', () => {
    it('returns current status of a payout', () => {
      service.addBalance('creator-1', 100);
      const payout = service.requestPayout('creator-1', 50, 'crypto');
      expect(service.getPayoutStatus(payout.id)).toBe('pending');
    });
  });
});
