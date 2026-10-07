// ============================================================================
// Payments - Unified Wallet Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedWalletService } from '../unified-wallet.service';

describe('UnifiedWalletService', () => {
  let service: UnifiedWalletService;

  beforeEach(() => {
    service = new UnifiedWalletService();
  });

  describe('addMoney', () => {
    it('should add money via stripe', async () => {
      await service.ensureWallet('user_1');
      const txn = await service.addMoney('user_1', 100, 'stripe', 'pi_123');

      expect(txn.type).toBe('credit');
      expect(txn.amount).toBe(100);
      expect(txn.description).toContain('stripe');
    });

    it('should add money via razorpay', async () => {
      await service.ensureWallet('user_1');
      const txn = await service.addMoney('user_1', 500, 'razorpay', 'pay_456');

      expect(txn.type).toBe('credit');
      expect(txn.amount).toBe(500);
      expect(txn.description).toContain('razorpay');
    });

    it('should add money via upi', async () => {
      await service.ensureWallet('user_1');
      const txn = await service.addMoney('user_1', 200, 'upi', 'upi_789');

      expect(txn.type).toBe('credit');
      expect(txn.amount).toBe(200);
      expect(txn.description).toContain('upi');
    });

    it('should auto-create wallet if not exists', async () => {
      const txn = await service.addMoney('new_user', 50, 'stripe', 'pi_new');

      expect(txn.amount).toBe(50);
    });

    it('should reject zero amount', async () => {
      await expect(service.addMoney('user_1', 0, 'stripe', 'pi_x')).rejects.toThrow();
    });

    it('should reject negative amount', async () => {
      await expect(service.addMoney('user_1', -10, 'stripe', 'pi_x')).rejects.toThrow();
    });

    it('should reject empty payment ref', async () => {
      await expect(service.addMoney('user_1', 100, 'stripe', '')).rejects.toThrow();
    });
  });

  describe('spend', () => {
    it('should spend for tip category', async () => {
      await service.addMoney('user_1', 100, 'stripe', 'pi_1');
      const txn = await service.spend('user_1', 10, 'tip', 'creator_1');

      expect(txn.type).toBe('debit');
      expect(txn.amount).toBe(10);
      expect(txn.description).toContain('tip');
    });

    it('should spend for boost_ad category', async () => {
      await service.addMoney('user_1', 100, 'stripe', 'pi_1');
      const txn = await service.spend('user_1', 25, 'boost_ad', 'post_1');

      expect(txn.description).toContain('boost_ad');
    });

    it('should spend for ai_usage category', async () => {
      await service.addMoney('user_1', 100, 'stripe', 'pi_1');
      const txn = await service.spend('user_1', 5, 'ai_usage', 'session_1');

      expect(txn.description).toContain('ai_usage');
    });

    it('should spend for course_unlock category', async () => {
      await service.addMoney('user_1', 100, 'stripe', 'pi_1');
      const txn = await service.spend('user_1', 49, 'course_unlock', 'course_1');

      expect(txn.description).toContain('course_unlock');
    });

    it('should spend for premium_content category', async () => {
      await service.addMoney('user_1', 100, 'stripe', 'pi_1');
      const txn = await service.spend('user_1', 3, 'premium_content', 'article_1');

      expect(txn.description).toContain('premium_content');
    });

    it('should reject spend with insufficient balance', async () => {
      await service.ensureWallet('user_1');
      await expect(service.spend('user_1', 100, 'tip', 'creator_1')).rejects.toThrow(
        'Insufficient balance',
      );
    });

    it('should reject zero amount spend', async () => {
      await service.addMoney('user_1', 100, 'stripe', 'pi_1');
      await expect(service.spend('user_1', 0, 'tip', 'creator_1')).rejects.toThrow();
    });
  });

  describe('getWalletSummary', () => {
    it('should return wallet summary with balance and transactions', async () => {
      await service.addMoney('user_1', 200, 'stripe', 'pi_1');
      await service.spend('user_1', 50, 'tip', 'creator_1');

      const summary = await service.getWalletSummary('user_1');

      expect(summary.balance).toBe(150);
      expect(summary.currency).toBe('USD');
      expect(summary.frozen).toBe(false);
      expect(summary.recentTransactions).toHaveLength(2);
      expect(summary.totalAdded).toBe(200);
      expect(summary.totalSpent).toBe(50);
    });

    it('should show pending cashouts', async () => {
      await service.addMoney('user_1', 1000, 'stripe', 'pi_1');
      await service.cashoutStripeConnect('user_1', 200);

      const summary = await service.getWalletSummary('user_1');

      expect(summary.pendingCashouts).toHaveLength(1);
      expect(summary.pendingCashouts[0]!.amount).toBe(200);
      expect(summary.pendingCashouts[0]!.method).toBe('stripe_connect');
    });
  });

  describe('cashout', () => {
    it('should cashout via Stripe Connect', async () => {
      await service.addMoney('user_1', 500, 'stripe', 'pi_1');
      const cashout = await service.cashoutStripeConnect('user_1', 200);

      expect(cashout.id).toMatch(/^cashout_/);
      expect(cashout.amount).toBe(200);
      expect(cashout.method).toBe('stripe_connect');
      expect(cashout.status).toBe('processing');
    });

    it('should cashout via Razorpay Payout', async () => {
      await service.addMoney('user_1', 500, 'razorpay', 'pay_1');
      const cashout = await service.cashoutRazorpay('user_1', 300);

      expect(cashout.id).toMatch(/^cashout_/);
      expect(cashout.amount).toBe(300);
      expect(cashout.method).toBe('razorpay_payout');
      expect(cashout.status).toBe('processing');
    });

    it('should reject cashout with insufficient balance', async () => {
      await service.ensureWallet('user_1');
      await expect(service.cashoutStripeConnect('user_1', 100)).rejects.toThrow(
        'Insufficient balance',
      );
    });

    it('should debit wallet on cashout', async () => {
      await service.addMoney('user_1', 500, 'stripe', 'pi_1');
      await service.cashoutStripeConnect('user_1', 200);

      const summary = await service.getWalletSummary('user_1');
      expect(summary.balance).toBe(300);
    });
  });
});
