// ============================================================================
// Payments - Creator Wallet Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { CreatorWalletService } from '../creator-wallet.service';

describe('CreatorWalletService', () => {
  let service: CreatorWalletService;

  beforeEach(() => {
    service = new CreatorWalletService({ holdPeriodDays: 7 });
  });

  describe('createCreatorWallet', () => {
    it('should create a new wallet', () => {
      const wallet = service.createCreatorWallet('creator_1');
      expect(wallet.creatorId).toBe('creator_1');
      expect(wallet.currency).toBe('USD');
    });

    it('should reject duplicate wallet creation', () => {
      service.createCreatorWallet('creator_1');
      expect(() => service.createCreatorWallet('creator_1')).toThrow('Wallet already exists');
    });
  });

  describe('creditEarnings', () => {
    it('should credit earnings to wallet', () => {
      service.createCreatorWallet('creator_1');
      const txn = service.creditEarnings({
        creatorId: 'creator_1',
        amount: 100,
        source: 'ad_revenue',
        referenceId: 'rev_1',
      });

      expect(txn.type).toBe('credit');
      expect(txn.amount).toBe(100);
      expect(txn.source).toBe('ad_revenue');
    });

    it('should reject negative amount', () => {
      service.createCreatorWallet('creator_1');
      expect(() =>
        service.creditEarnings({
          creatorId: 'creator_1',
          amount: -10,
          source: 'tip',
          referenceId: 'ref_1',
        }),
      ).toThrow();
    });

    it('should reject zero amount', () => {
      service.createCreatorWallet('creator_1');
      expect(() =>
        service.creditEarnings({
          creatorId: 'creator_1',
          amount: 0,
          source: 'tip',
          referenceId: 'ref_1',
        }),
      ).toThrow();
    });

    it('should throw for non-existent wallet', () => {
      expect(() =>
        service.creditEarnings({
          creatorId: 'unknown',
          amount: 100,
          source: 'tip',
          referenceId: 'ref_1',
        }),
      ).toThrow('Wallet not found');
    });
  });

  describe('debitForCashout', () => {
    it('should debit from available balance', () => {
      // Use 0 hold period so credits are immediately available
      const svc = new CreatorWalletService({ holdPeriodDays: 0 });
      svc.createCreatorWallet('creator_1');
      svc.creditEarnings({
        creatorId: 'creator_1',
        amount: 100,
        source: 'ad_revenue',
        referenceId: 'rev_1',
      });

      const txn = svc.debitForCashout({
        creatorId: 'creator_1',
        amount: 50,
        cashoutId: 'cashout_1',
      });

      expect(txn.type).toBe('debit');
      expect(txn.amount).toBe(50);
    });

    it('should reject debit exceeding available balance', () => {
      service.createCreatorWallet('creator_1');
      // With hold period, nothing is available yet
      service.creditEarnings({
        creatorId: 'creator_1',
        amount: 100,
        source: 'tip',
        referenceId: 'ref_1',
      });

      expect(() =>
        service.debitForCashout({
          creatorId: 'creator_1',
          amount: 50,
          cashoutId: 'cashout_1',
        }),
      ).toThrow('Insufficient available balance');
    });
  });

  describe('getBalanceBreakdown', () => {
    it('should show all earnings in pending when within hold period', () => {
      service.createCreatorWallet('creator_1');
      service.creditEarnings({
        creatorId: 'creator_1',
        amount: 100,
        source: 'ad_revenue',
        referenceId: 'rev_1',
      });

      const balance = service.getBalanceBreakdown('creator_1');
      expect(balance.earnings).toBe(100);
      expect(balance.pending).toBe(100);
      expect(balance.available).toBe(0);
      expect(balance.currency).toBe('USD');
    });

    it('should show available balance when hold period is 0', () => {
      const svc = new CreatorWalletService({ holdPeriodDays: 0 });
      svc.createCreatorWallet('creator_1');
      svc.creditEarnings({
        creatorId: 'creator_1',
        amount: 100,
        source: 'ad_revenue',
        referenceId: 'rev_1',
      });

      const balance = svc.getBalanceBreakdown('creator_1');
      expect(balance.earnings).toBe(100);
      expect(balance.pending).toBe(0);
      expect(balance.available).toBe(100);
    });

    it('should correctly account for debits', () => {
      const svc = new CreatorWalletService({ holdPeriodDays: 0 });
      svc.createCreatorWallet('creator_1');
      svc.creditEarnings({
        creatorId: 'creator_1',
        amount: 100,
        source: 'ad_revenue',
        referenceId: 'rev_1',
      });
      svc.debitForCashout({
        creatorId: 'creator_1',
        amount: 30,
        cashoutId: 'cashout_1',
      });

      const balance = svc.getBalanceBreakdown('creator_1');
      expect(balance.earnings).toBe(70);
      expect(balance.available).toBe(70);
    });
  });

  describe('getTransactions', () => {
    it('should return all transactions sorted by date descending', () => {
      service.createCreatorWallet('creator_1');
      service.creditEarnings({
        creatorId: 'creator_1',
        amount: 50,
        source: 'tip',
        referenceId: 'ref_1',
      });
      service.creditEarnings({
        creatorId: 'creator_1',
        amount: 75,
        source: 'ad',
        referenceId: 'ref_2',
      });

      const txns = service.getTransactions('creator_1');
      expect(txns).toHaveLength(2);
      expect(txns[0]!.createdAt).toBeGreaterThanOrEqual(txns[1]!.createdAt);
    });

    it('should filter by type', () => {
      const svc = new CreatorWalletService({ holdPeriodDays: 0 });
      svc.createCreatorWallet('creator_1');
      svc.creditEarnings({
        creatorId: 'creator_1',
        amount: 100,
        source: 'ad',
        referenceId: 'ref_1',
      });
      svc.debitForCashout({ creatorId: 'creator_1', amount: 20, cashoutId: 'co_1' });

      const credits = svc.getTransactions('creator_1', { type: 'credit' });
      expect(credits).toHaveLength(1);
      expect(credits[0]!.type).toBe('credit');
    });

    it('should throw for non-existent wallet', () => {
      expect(() => service.getTransactions('unknown')).toThrow('Wallet not found');
    });
  });
});
