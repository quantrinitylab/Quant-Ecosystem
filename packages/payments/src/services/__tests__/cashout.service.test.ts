// ============================================================================
// Payments - Cashout Service Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CashoutService } from '../cashout.service';

describe('CashoutService', () => {
  let service: CashoutService;
  let debitBalanceMock: ReturnType<typeof vi.fn<(creatorId: string, amount: number) => void>>;
  let mockBalanceProvider: {
    getAvailableBalance: (creatorId: string) => number;
    debitBalance: ReturnType<typeof vi.fn<(creatorId: string, amount: number) => void>>;
  };

  beforeEach(() => {
    debitBalanceMock = vi.fn<(creatorId: string, amount: number) => void>();
    mockBalanceProvider = {
      getAvailableBalance: (creatorId: string): number => {
        if (creatorId === 'creator_rich') return 1000;
        if (creatorId === 'creator_poor') return 5;
        return 0;
      },
      debitBalance: debitBalanceMock,
    };
    service = new CashoutService(mockBalanceProvider);
  });

  describe('requestCashout', () => {
    it('should create a cashout request with bank_transfer', () => {
      const cashout = service.requestCashout({
        creatorId: 'creator_rich',
        amount: 500,
        method: 'bank_transfer',
      });

      expect(cashout.creatorId).toBe('creator_rich');
      expect(cashout.amount).toBe(500);
      expect(cashout.method).toBe('bank_transfer');
      expect(cashout.status).toBe('pending');
      expect(cashout.requestedAt).toBeDefined();
    });

    it('should create a cashout request with instant method', () => {
      const cashout = service.requestCashout({
        creatorId: 'creator_rich',
        amount: 200,
        method: 'instant',
      });

      expect(cashout.method).toBe('instant');
    });

    it('should debit the balance after creating a cashout', () => {
      service.requestCashout({
        creatorId: 'creator_rich',
        amount: 500,
        method: 'bank_transfer',
      });

      expect(debitBalanceMock).toHaveBeenCalledWith('creator_rich', 500);
    });

    it('should not debit the balance when cashout is rejected', () => {
      expect(() =>
        service.requestCashout({
          creatorId: 'creator_poor',
          amount: 100,
          method: 'bank_transfer',
        }),
      ).toThrow('Insufficient available balance');

      expect(debitBalanceMock).not.toHaveBeenCalled();
    });

    it('should reject cashout exceeding available balance', () => {
      expect(() =>
        service.requestCashout({
          creatorId: 'creator_poor',
          amount: 100,
          method: 'bank_transfer',
        }),
      ).toThrow('Insufficient available balance');
    });

    it('should reject zero amount', () => {
      expect(() =>
        service.requestCashout({
          creatorId: 'creator_rich',
          amount: 0,
          method: 'bank_transfer',
        }),
      ).toThrow();
    });

    it('should reject negative amount', () => {
      expect(() =>
        service.requestCashout({
          creatorId: 'creator_rich',
          amount: -10,
          method: 'bank_transfer',
        }),
      ).toThrow();
    });

    it('should reject invalid method', () => {
      expect(() =>
        service.requestCashout({
          creatorId: 'creator_rich',
          amount: 100,
          method: 'crypto' as 'bank_transfer',
        }),
      ).toThrow();
    });

    it('should reject empty creatorId', () => {
      expect(() =>
        service.requestCashout({
          creatorId: '',
          amount: 100,
          method: 'bank_transfer',
        }),
      ).toThrow();
    });
  });

  describe('getCashoutHistory', () => {
    it('should return cashout history for a creator', () => {
      service.requestCashout({ creatorId: 'creator_rich', amount: 100, method: 'bank_transfer' });
      service.requestCashout({ creatorId: 'creator_rich', amount: 200, method: 'instant' });

      const history = service.getCashoutHistory('creator_rich');
      expect(history).toHaveLength(2);
    });

    it('should return empty array for no cashouts', () => {
      expect(service.getCashoutHistory('creator_rich')).toHaveLength(0);
    });

    it('should sort by requestedAt descending', () => {
      service.requestCashout({ creatorId: 'creator_rich', amount: 100, method: 'bank_transfer' });
      service.requestCashout({ creatorId: 'creator_rich', amount: 200, method: 'instant' });

      const history = service.getCashoutHistory('creator_rich');
      expect(history[0]!.requestedAt).toBeGreaterThanOrEqual(history[1]!.requestedAt);
    });
  });

  describe('getCashoutStatus', () => {
    it('should return cashout status', () => {
      const cashout = service.requestCashout({
        creatorId: 'creator_rich',
        amount: 100,
        method: 'bank_transfer',
      });

      const status = service.getCashoutStatus(cashout.id);
      expect(status.status).toBe('pending');
    });

    it('should throw for non-existent cashout', () => {
      expect(() => service.getCashoutStatus('fake_id')).toThrow('Cashout not found');
    });
  });

  describe('status transitions', () => {
    it('should transition pending -> processing -> completed', () => {
      const cashout = service.requestCashout({
        creatorId: 'creator_rich',
        amount: 100,
        method: 'bank_transfer',
      });

      expect(cashout.status).toBe('pending');

      const processing = service.markProcessing(cashout.id);
      expect(processing.status).toBe('processing');

      const completed = service.markCompleted(cashout.id);
      expect(completed.status).toBe('completed');
      expect(completed.processedAt).toBeDefined();
    });

    it('should transition pending -> processing -> failed', () => {
      const cashout = service.requestCashout({
        creatorId: 'creator_rich',
        amount: 100,
        method: 'bank_transfer',
      });

      service.markProcessing(cashout.id);
      const failed = service.markFailed(cashout.id);
      expect(failed.status).toBe('failed');
      expect(failed.processedAt).toBeDefined();
    });

    it('should reject invalid transition: pending -> completed', () => {
      const cashout = service.requestCashout({
        creatorId: 'creator_rich',
        amount: 100,
        method: 'bank_transfer',
      });

      expect(() => service.markCompleted(cashout.id)).toThrow('Cannot transition');
    });

    it('should reject invalid transition: pending -> failed', () => {
      const cashout = service.requestCashout({
        creatorId: 'creator_rich',
        amount: 100,
        method: 'bank_transfer',
      });

      expect(() => service.markFailed(cashout.id)).toThrow('Cannot transition');
    });

    it('should reject invalid transition: completed -> processing', () => {
      const cashout = service.requestCashout({
        creatorId: 'creator_rich',
        amount: 100,
        method: 'bank_transfer',
      });
      service.markProcessing(cashout.id);
      service.markCompleted(cashout.id);

      expect(() => service.markProcessing(cashout.id)).toThrow('Cannot transition');
    });
  });
});
