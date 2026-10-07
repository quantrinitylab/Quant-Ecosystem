// ============================================================================
// Payments - Unified Wallet Service
// Single wallet visible in AppShell user menu across all apps
// ============================================================================

import { z } from 'zod';
import type { AddMoneySource, SpendCategory, WalletTransaction, CurrencyCode } from '../types';
import { WalletService } from './wallet-service';

export const AddMoneySchema = z.object({
  userId: z.string().min(1),
  amount: z.number().positive(),
  source: z.enum(['stripe', 'razorpay', 'upi']),
  paymentRef: z.string().min(1),
});

export const SpendSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().positive(),
  category: z.enum(['tip', 'boost_ad', 'ai_usage', 'course_unlock', 'premium_content']),
  targetId: z.string().min(1),
});

export const GetWalletSummarySchema = z.object({
  userId: z.string().min(1),
});

interface CashoutRecord {
  id: string;
  userId: string;
  amount: number;
  method: 'stripe_connect' | 'razorpay_payout';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
}

interface WalletSummary {
  balance: number;
  currency: CurrencyCode;
  frozen: boolean;
  recentTransactions: WalletTransaction[];
  pendingCashouts: CashoutRecord[];
  totalAdded: number;
  totalSpent: number;
}

/**
 * UnifiedWalletService - Single wallet across all Quant apps
 *
 * Wraps WalletService and adds:
 * - Add money from multiple sources (Stripe, Razorpay, UPI)
 * - Spend across categories (tips, boosts, AI, courses, premium)
 * - Cashout via Stripe Connect or Razorpay Payouts
 * - Wallet summary for AppShell display
 */
export class UnifiedWalletService {
  private walletService: WalletService;
  private cashouts: Map<string, CashoutRecord[]>;
  private runningTotals: Map<string, { totalAdded: number; totalSpent: number }>;

  constructor(walletService?: WalletService) {
    this.walletService = walletService || new WalletService();
    this.cashouts = new Map();
    this.runningTotals = new Map();
  }

  /** Ensure a wallet exists for the user */
  async ensureWallet(userId: string, currency?: CurrencyCode): Promise<void> {
    try {
      await this.walletService.getBalance(userId);
    } catch {
      await this.walletService.createWallet(userId, currency);
    }
  }

  /** Add money to wallet from an external source */
  async addMoney(
    userId: string,
    amount: number,
    source: AddMoneySource,
    paymentRef: string,
  ): Promise<WalletTransaction> {
    AddMoneySchema.parse({ userId, amount, source, paymentRef });
    await this.ensureWallet(userId);

    const description = `Add money via ${source}`;
    const txn = await this.walletService.credit(userId, amount, description, paymentRef);

    // Update running totals
    const totals = this.runningTotals.get(userId) || { totalAdded: 0, totalSpent: 0 };
    totals.totalAdded += amount;
    this.runningTotals.set(userId, totals);

    return txn;
  }

  /** Spend from wallet for a specific category */
  async spend(
    userId: string,
    amount: number,
    category: SpendCategory,
    targetId: string,
  ): Promise<WalletTransaction> {
    SpendSchema.parse({ userId, amount, category, targetId });

    const description = `Spend: ${category} (${targetId})`;
    const txn = await this.walletService.debit(userId, amount, description, targetId);

    // Update running totals
    const totals = this.runningTotals.get(userId) || { totalAdded: 0, totalSpent: 0 };
    totals.totalSpent += amount;
    this.runningTotals.set(userId, totals);

    return txn;
  }

  /** Get wallet summary for AppShell display */
  async getWalletSummary(userId: string): Promise<WalletSummary> {
    GetWalletSummarySchema.parse({ userId });

    const balance = await this.walletService.getBalance(userId);
    const { transactions } = await this.walletService.getTransactionHistory(userId, { limit: 10 });
    const pendingCashouts = (this.cashouts.get(userId) || []).filter(
      (c) => c.status === 'pending' || c.status === 'processing',
    );

    const totals = this.runningTotals.get(userId) || { totalAdded: 0, totalSpent: 0 };

    return {
      balance: balance.balance,
      currency: balance.currency,
      frozen: balance.frozen,
      recentTransactions: transactions,
      pendingCashouts,
      totalAdded: totals.totalAdded,
      totalSpent: totals.totalSpent,
    };
  }

  /** Request a cashout via Stripe Connect */
  async cashoutStripeConnect(userId: string, amount: number): Promise<CashoutRecord> {
    await this.walletService.debit(userId, amount, 'Cashout via Stripe Connect');

    // Update running totals for the debit
    const totals = this.runningTotals.get(userId) || { totalAdded: 0, totalSpent: 0 };
    totals.totalSpent += amount;
    this.runningTotals.set(userId, totals);

    const record: CashoutRecord = {
      id: `cashout_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      userId,
      amount,
      method: 'stripe_connect',
      status: 'processing',
      createdAt: Date.now(),
    };

    const userCashouts = this.cashouts.get(userId) || [];
    userCashouts.push(record);
    this.cashouts.set(userId, userCashouts);
    return record;
  }

  /** Request a cashout via Razorpay Payout */
  async cashoutRazorpay(userId: string, amount: number): Promise<CashoutRecord> {
    await this.walletService.debit(userId, amount, 'Cashout via Razorpay Payout');

    // Update running totals for the debit
    const totals = this.runningTotals.get(userId) || { totalAdded: 0, totalSpent: 0 };
    totals.totalSpent += amount;
    this.runningTotals.set(userId, totals);

    const record: CashoutRecord = {
      id: `cashout_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      userId,
      amount,
      method: 'razorpay_payout',
      status: 'processing',
      createdAt: Date.now(),
    };

    const userCashouts = this.cashouts.get(userId) || [];
    userCashouts.push(record);
    this.cashouts.set(userId, userCashouts);
    return record;
  }

  /** Get underlying wallet service (for direct operations) */
  getWalletService(): WalletService {
    return this.walletService;
  }
}
