// ============================================================================
// Payments - Ledger Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { LedgerService } from '../ledger.service';

describe('LedgerService', () => {
  let service: LedgerService;

  beforeEach(() => {
    service = new LedgerService();
  });

  describe('record', () => {
    it('should create a credit entry and update balance', () => {
      const entry = service.record({
        accountId: 'acc_1',
        type: 'credit',
        amount: 100,
        description: 'Earnings deposit',
      });

      expect(entry.accountId).toBe('acc_1');
      expect(entry.type).toBe('credit');
      expect(entry.amount).toBe(100);
      expect(entry.balanceAfter).toBe(100);
      expect(entry.description).toBe('Earnings deposit');
    });

    it('should create a debit entry and update balance', () => {
      service.record({ accountId: 'acc_1', type: 'credit', amount: 100, description: 'Credit' });
      const entry = service.record({
        accountId: 'acc_1',
        type: 'debit',
        amount: 30,
        description: 'Withdrawal',
      });

      expect(entry.balanceAfter).toBe(70);
    });

    it('should handle revenue type as credit', () => {
      const entry = service.record({
        accountId: 'acc_1',
        type: 'revenue',
        amount: 50,
        description: 'Ad revenue',
      });

      expect(entry.balanceAfter).toBe(50);
    });

    it('should handle payout type as debit', () => {
      service.record({ accountId: 'acc_1', type: 'credit', amount: 200, description: 'Credit' });
      const entry = service.record({
        accountId: 'acc_1',
        type: 'payout',
        amount: 80,
        description: 'Payout to bank',
      });

      expect(entry.balanceAfter).toBe(120);
    });

    it('should handle fee type as debit', () => {
      service.record({ accountId: 'acc_1', type: 'credit', amount: 100, description: 'Credit' });
      const entry = service.record({
        accountId: 'acc_1',
        type: 'fee',
        amount: 5,
        description: 'Platform fee',
      });

      expect(entry.balanceAfter).toBe(95);
    });

    it('should store referenceId and metadata', () => {
      const entry = service.record({
        accountId: 'acc_1',
        type: 'credit',
        amount: 50,
        description: 'Tip received',
        referenceId: 'tip_123',
        metadata: { source: 'tip' },
      });

      expect(entry.referenceId).toBe('tip_123');
      expect(entry.metadata).toEqual({ source: 'tip' });
    });

    it('should reject zero amount', () => {
      expect(() =>
        service.record({ accountId: 'acc_1', type: 'credit', amount: 0, description: 'Bad' }),
      ).toThrow();
    });

    it('should reject negative amount', () => {
      expect(() =>
        service.record({ accountId: 'acc_1', type: 'credit', amount: -10, description: 'Bad' }),
      ).toThrow();
    });

    it('should reject empty description', () => {
      expect(() =>
        service.record({ accountId: 'acc_1', type: 'credit', amount: 100, description: '' }),
      ).toThrow();
    });

    it('should reject empty accountId', () => {
      expect(() =>
        service.record({ accountId: '', type: 'credit', amount: 100, description: 'Test' }),
      ).toThrow();
    });
  });

  describe('getEntries', () => {
    it('should return all entries', () => {
      service.record({ accountId: 'acc_1', type: 'credit', amount: 100, description: 'A' });
      service.record({ accountId: 'acc_2', type: 'credit', amount: 50, description: 'B' });

      const entries = service.getEntries();
      expect(entries).toHaveLength(2);
    });

    it('should filter by accountId', () => {
      service.record({ accountId: 'acc_1', type: 'credit', amount: 100, description: 'A' });
      service.record({ accountId: 'acc_2', type: 'credit', amount: 50, description: 'B' });

      const entries = service.getEntries({ accountId: 'acc_1' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.accountId).toBe('acc_1');
    });

    it('should filter by type', () => {
      service.record({ accountId: 'acc_1', type: 'credit', amount: 100, description: 'A' });
      service.record({ accountId: 'acc_1', type: 'debit', amount: 30, description: 'B' });

      const entries = service.getEntries({ type: 'debit' });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.type).toBe('debit');
    });

    it('should return empty array when no entries match', () => {
      const entries = service.getEntries({ accountId: 'unknown' });
      expect(entries).toHaveLength(0);
    });
  });

  describe('getBalance', () => {
    it('should return current balance for account', () => {
      service.record({ accountId: 'acc_1', type: 'credit', amount: 100, description: 'A' });
      service.record({ accountId: 'acc_1', type: 'debit', amount: 25, description: 'B' });

      expect(service.getBalance('acc_1')).toBe(75);
    });

    it('should return 0 for unknown account', () => {
      expect(service.getBalance('unknown')).toBe(0);
    });

    it('should track multiple accounts independently', () => {
      service.record({ accountId: 'acc_1', type: 'credit', amount: 100, description: 'A' });
      service.record({ accountId: 'acc_2', type: 'credit', amount: 200, description: 'B' });

      expect(service.getBalance('acc_1')).toBe(100);
      expect(service.getBalance('acc_2')).toBe(200);
    });
  });

  describe('verify', () => {
    it('should pass for consistent ledger', () => {
      service.record({ accountId: 'acc_1', type: 'credit', amount: 100, description: 'A' });
      service.record({ accountId: 'acc_1', type: 'debit', amount: 30, description: 'B' });
      service.record({ accountId: 'acc_2', type: 'revenue', amount: 50, description: 'C' });

      const result = service.verify();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass for empty ledger', () => {
      const result = service.verify();
      expect(result.valid).toBe(true);
    });

    it('should pass after many operations', () => {
      for (let i = 0; i < 100; i++) {
        service.record({
          accountId: `acc_${i % 5}`,
          type: i % 3 === 0 ? 'credit' : i % 3 === 1 ? 'revenue' : 'debit',
          amount: 10,
          description: `Operation ${i}`,
        });
      }

      const result = service.verify();
      expect(result.valid).toBe(true);
    });
  });

  describe('immutability', () => {
    it('should not allow modification of entries', () => {
      const entry = service.record({
        accountId: 'acc_1',
        type: 'credit',
        amount: 100,
        description: 'Test',
      });

      expect(() => {
        (entry as { amount: number }).amount = 999;
      }).toThrow();
    });

    it('should not expose update or delete methods', () => {
      expect((service as unknown as Record<string, unknown>)['update']).toBeUndefined();
      expect((service as unknown as Record<string, unknown>)['delete']).toBeUndefined();
      expect((service as unknown as Record<string, unknown>)['remove']).toBeUndefined();
      expect((service as unknown as Record<string, unknown>)['modify']).toBeUndefined();
    });
  });
});
