import { describe, it, expect, beforeEach } from 'vitest';
import { QuantCreditsService } from '../credits/quant-credits.js';

describe('QuantCreditsService', () => {
  let service: QuantCreditsService;

  beforeEach(() => {
    service = new QuantCreditsService();
  });

  describe('earnCredits', () => {
    it('adds credits to user balance', () => {
      service.earnCredits('user-1', 100, 'signup_bonus');
      expect(service.getBalance('user-1')).toBe(100);
    });

    it('accumulates credits from multiple earnings', () => {
      service.earnCredits('user-1', 50, 'referral');
      service.earnCredits('user-1', 30, 'daily_login');
      expect(service.getBalance('user-1')).toBe(80);
    });

    it('returns a transaction record', () => {
      const tx = service.earnCredits('user-1', 100, 'signup_bonus');
      expect(tx.type).toBe('earn');
      expect(tx.amount).toBe(100);
      expect(tx.source).toBe('signup_bonus');
    });

    it('throws for non-positive amount', () => {
      expect(() => service.earnCredits('user-1', 0, 'test')).toThrow('Amount must be positive');
      expect(() => service.earnCredits('user-1', -5, 'test')).toThrow('Amount must be positive');
    });
  });

  describe('spendCredits', () => {
    it('deducts credits from user balance', () => {
      service.earnCredits('user-1', 100, 'bonus');
      service.spendCredits('user-1', 40, 'purchase');
      expect(service.getBalance('user-1')).toBe(60);
    });

    it('throws on insufficient balance', () => {
      service.earnCredits('user-1', 20, 'bonus');
      expect(() => service.spendCredits('user-1', 50, 'purchase')).toThrow('Insufficient credits');
    });

    it('returns a transaction record', () => {
      service.earnCredits('user-1', 100, 'bonus');
      const tx = service.spendCredits('user-1', 30, 'premium_content');
      expect(tx.type).toBe('spend');
      expect(tx.source).toBe('premium_content');
    });

    it('throws for non-positive amount', () => {
      expect(() => service.spendCredits('user-1', 0, 'test')).toThrow('Amount must be positive');
    });
  });

  describe('transferCredits', () => {
    it('moves credits between users', () => {
      service.earnCredits('user-1', 100, 'bonus');
      service.transferCredits('user-1', 'user-2', 40);
      expect(service.getBalance('user-1')).toBe(60);
      expect(service.getBalance('user-2')).toBe(40);
    });

    it('throws on insufficient balance', () => {
      service.earnCredits('user-1', 20, 'bonus');
      expect(() => service.transferCredits('user-1', 'user-2', 50)).toThrow('Insufficient credits');
    });

    it('returns two transaction records', () => {
      service.earnCredits('user-1', 100, 'bonus');
      const txs = service.transferCredits('user-1', 'user-2', 25);
      expect(txs).toHaveLength(2);
      expect(txs[0]!.type).toBe('transfer_out');
      expect(txs[1]!.type).toBe('transfer_in');
    });

    it('throws for non-positive amount', () => {
      expect(() => service.transferCredits('user-1', 'user-2', 0)).toThrow(
        'Amount must be positive',
      );
    });
  });

  describe('getBalance', () => {
    it('returns 0 for unknown user', () => {
      expect(service.getBalance('unknown')).toBe(0);
    });
  });

  describe('getTransactionHistory', () => {
    it('returns all transactions for a user', () => {
      service.earnCredits('user-1', 100, 'bonus');
      service.spendCredits('user-1', 30, 'purchase');
      const history = service.getTransactionHistory('user-1');
      expect(history).toHaveLength(2);
    });

    it('returns empty array for user with no transactions', () => {
      expect(service.getTransactionHistory('unknown')).toHaveLength(0);
    });
  });
});
