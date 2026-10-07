// ============================================================================
// Payments - Creator Wallet Service
// Custodial wallet with hold period and balance breakdown
// ============================================================================

import { z } from 'zod';
import type { CreatorWalletBalance, CurrencyCode } from '../types';

export const CreditEarningsSchema = z.object({
  creatorId: z.string().min(1),
  amount: z.number().positive(),
  source: z.string().min(1),
  referenceId: z.string().min(1),
});

export const DebitForCashoutSchema = z.object({
  creatorId: z.string().min(1),
  amount: z.number().positive(),
  cashoutId: z.string().min(1),
});

interface WalletTransaction {
  id: string;
  creatorId: string;
  type: 'credit' | 'debit';
  amount: number;
  source: string;
  referenceId: string;
  createdAt: number;
}

interface CreatorWallet {
  creatorId: string;
  currency: CurrencyCode;
  transactions: WalletTransaction[];
  createdAt: number;
}

export interface CreatorWalletConfig {
  holdPeriodDays: number;
  defaultCurrency: CurrencyCode;
}

const DEFAULT_CONFIG: CreatorWalletConfig = {
  holdPeriodDays: 7,
  defaultCurrency: 'USD',
};

/**
 * CreatorWalletService - Custodial wallet per creator
 *
 * Manages creator earnings with a hold period concept.
 * Credited earnings enter "pending" state and become "available"
 * after the configured hold period expires.
 */
export class CreatorWalletService {
  private readonly config: CreatorWalletConfig;
  private readonly wallets: Map<string, CreatorWallet> = new Map();

  constructor(config: Partial<CreatorWalletConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new creator wallet
   */
  createCreatorWallet(creatorId: string): CreatorWallet {
    if (this.wallets.has(creatorId)) {
      throw new Error(`Wallet already exists for creator: ${creatorId}`);
    }

    const wallet: CreatorWallet = {
      creatorId,
      currency: this.config.defaultCurrency,
      transactions: [],
      createdAt: Date.now(),
    };

    this.wallets.set(creatorId, wallet);
    return wallet;
  }

  /**
   * Credit earnings to creator wallet
   */
  creditEarnings(params: {
    creatorId: string;
    amount: number;
    source: string;
    referenceId: string;
  }): WalletTransaction {
    const validated = CreditEarningsSchema.parse(params);
    const wallet = this.getWalletOrThrow(validated.creatorId);

    const txn: WalletTransaction = {
      id: `wtxn_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      creatorId: validated.creatorId,
      type: 'credit',
      amount: validated.amount,
      source: validated.source,
      referenceId: validated.referenceId,
      createdAt: Date.now(),
    };

    wallet.transactions.push(txn);
    return txn;
  }

  /**
   * Debit from creator wallet for cashout
   */
  debitForCashout(params: {
    creatorId: string;
    amount: number;
    cashoutId: string;
  }): WalletTransaction {
    const validated = DebitForCashoutSchema.parse(params);
    const wallet = this.getWalletOrThrow(validated.creatorId);

    const balance = this.getBalanceBreakdown(validated.creatorId);
    if (validated.amount > balance.available) {
      throw new Error('Insufficient available balance');
    }

    const txn: WalletTransaction = {
      id: `wtxn_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      creatorId: validated.creatorId,
      type: 'debit',
      amount: validated.amount,
      source: 'cashout',
      referenceId: validated.cashoutId,
      createdAt: Date.now(),
    };

    wallet.transactions.push(txn);
    return txn;
  }

  /**
   * Get balance breakdown: earnings, pending, available
   */
  getBalanceBreakdown(creatorId: string): CreatorWalletBalance {
    const wallet = this.getWalletOrThrow(creatorId);
    const now = Date.now();
    const holdPeriodMs = this.config.holdPeriodDays * 24 * 60 * 60 * 1000;

    let totalCredits = 0;
    let totalDebits = 0;
    let pendingCredits = 0;

    for (const txn of wallet.transactions) {
      if (txn.type === 'credit') {
        totalCredits += txn.amount;
        if (now - txn.createdAt < holdPeriodMs) {
          pendingCredits += txn.amount;
        }
      } else {
        totalDebits += txn.amount;
      }
    }

    const earnings = totalCredits - totalDebits;
    const available = Math.max(0, earnings - pendingCredits);

    return {
      earnings,
      pending: pendingCredits,
      available,
      currency: wallet.currency,
    };
  }

  /**
   * Get transaction history for a creator
   */
  getTransactions(
    creatorId: string,
    filters?: {
      type?: 'credit' | 'debit';
      startDate?: number;
      endDate?: number;
    },
  ): WalletTransaction[] {
    const wallet = this.getWalletOrThrow(creatorId);
    let results = [...wallet.transactions];

    if (filters?.type) {
      results = results.filter((t) => t.type === filters.type);
    }
    if (filters?.startDate) {
      results = results.filter((t) => t.createdAt >= filters.startDate!);
    }
    if (filters?.endDate) {
      results = results.filter((t) => t.createdAt <= filters.endDate!);
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  // --- Private Helpers ---

  private getWalletOrThrow(creatorId: string): CreatorWallet {
    const wallet = this.wallets.get(creatorId);
    if (!wallet) throw new Error(`Wallet not found for creator: ${creatorId}`);
    return wallet;
  }
}
