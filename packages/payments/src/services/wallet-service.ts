// ============================================================================
// Payments - Wallet Service
// Digital wallet with transaction limits, freezing, and audit trail
// ============================================================================

import type { Wallet, WalletTransaction, WalletTransactionType, CurrencyCode } from '../types';

interface WalletServiceConfig {
  defaultDailyLimit: number;
  defaultMonthlyLimit: number;
  defaultTransactionLimit: number;
  defaultCurrency: CurrencyCode;
  minTransferAmount: number;
}

const DEFAULT_CONFIG: WalletServiceConfig = {
  defaultDailyLimit: 10000,
  defaultMonthlyLimit: 50000,
  defaultTransactionLimit: 5000,
  defaultCurrency: 'USD',
  minTransferAmount: 1,
};

/**
 * WalletService - Digital wallet management
 *
 * Handles balance operations, transfers, transaction history,
 * limit enforcement, freezing, and comprehensive audit trails.
 */
export class WalletService {
  private config: WalletServiceConfig;
  private wallets: Map<string, Wallet>;
  private transactions: Map<string, WalletTransaction[]>;
  private dailyUsage: Map<string, { date: string; amount: number }>;
  private monthlyUsage: Map<string, { month: string; amount: number }>;

  constructor(config: Partial<WalletServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.wallets = new Map();
    this.transactions = new Map();
    this.dailyUsage = new Map();
    this.monthlyUsage = new Map();
  }

  /** Create a new wallet for a user */
  async createWallet(userId: string, currency?: CurrencyCode): Promise<Wallet> {
    if (this.wallets.has(userId)) {
      throw new Error(`Wallet already exists for user: ${userId}`);
    }

    const wallet: Wallet = {
      id: `wal_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      userId,
      balance: 0,
      currency: currency || this.config.defaultCurrency,
      frozen: false,
      dailyLimit: this.config.defaultDailyLimit,
      monthlyLimit: this.config.defaultMonthlyLimit,
      transactionLimit: this.config.defaultTransactionLimit,
      totalCredits: 0,
      totalDebits: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.wallets.set(userId, wallet);
    this.transactions.set(wallet.id, []);
    return wallet;
  }

  /** Get wallet balance */
  async getBalance(
    userId: string,
  ): Promise<{ balance: number; currency: CurrencyCode; frozen: boolean; available: number }> {
    const wallet = this.getWalletOrThrow(userId);
    const dailyRemaining = this.getDailyRemaining(wallet);

    return {
      balance: wallet.balance,
      currency: wallet.currency,
      frozen: wallet.frozen,
      available: wallet.frozen ? 0 : Math.min(wallet.balance, dailyRemaining),
    };
  }

  /** Credit funds to wallet */
  async credit(
    userId: string,
    amount: number,
    description: string,
    referenceId?: string,
  ): Promise<WalletTransaction> {
    if (amount <= 0) throw new Error('Credit amount must be positive');

    const wallet = this.getWalletOrThrow(userId);
    const balanceBefore = wallet.balance;

    wallet.balance += amount;
    wallet.totalCredits += amount;
    wallet.updatedAt = Date.now();

    const txn = this.createTransaction(
      wallet,
      'credit',
      amount,
      balanceBefore,
      description,
      referenceId,
    );
    return txn;
  }

  /** Debit funds from wallet */
  async debit(
    userId: string,
    amount: number,
    description: string,
    referenceId?: string,
  ): Promise<WalletTransaction> {
    if (amount <= 0) throw new Error('Debit amount must be positive');

    const wallet = this.getWalletOrThrow(userId);
    this.validateDebit(wallet, amount);

    const balanceBefore = wallet.balance;
    wallet.balance -= amount;
    wallet.totalDebits += amount;
    wallet.updatedAt = Date.now();

    this.updateUsage(wallet, amount);
    const txn = this.createTransaction(
      wallet,
      'debit',
      amount,
      balanceBefore,
      description,
      referenceId,
    );
    return txn;
  }

  /** Transfer funds between wallets */
  async transfer(
    fromUserId: string,
    toUserId: string,
    amount: number,
    description?: string,
  ): Promise<{ fromTxn: WalletTransaction; toTxn: WalletTransaction }> {
    if (amount < this.config.minTransferAmount) {
      throw new Error(`Minimum transfer amount is ${this.config.minTransferAmount}`);
    }
    if (fromUserId === toUserId) {
      throw new Error('Cannot transfer to same wallet');
    }

    const fromWallet = this.getWalletOrThrow(fromUserId);
    const toWallet = this.getWalletOrThrow(toUserId);

    this.validateDebit(fromWallet, amount);

    const desc = description || `Transfer to ${toUserId}`;
    const fromBalanceBefore = fromWallet.balance;
    const toBalanceBefore = toWallet.balance;

    fromWallet.balance -= amount;
    fromWallet.totalDebits += amount;
    fromWallet.updatedAt = Date.now();

    toWallet.balance += amount;
    toWallet.totalCredits += amount;
    toWallet.updatedAt = Date.now();

    this.updateUsage(fromWallet, amount);

    const fromTxn = this.createTransaction(
      fromWallet,
      'transfer_out',
      amount,
      fromBalanceBefore,
      desc,
    );
    fromTxn.counterpartyWalletId = toWallet.id;

    const toTxn = this.createTransaction(
      toWallet,
      'transfer_in',
      amount,
      toBalanceBefore,
      `Transfer from ${fromUserId}`,
    );
    toTxn.counterpartyWalletId = fromWallet.id;

    return { fromTxn, toTxn };
  }

  /** Get transaction history for a wallet */
  async getTransactionHistory(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      type?: WalletTransactionType;
      startDate?: number;
      endDate?: number;
    },
  ): Promise<{ transactions: WalletTransaction[]; total: number }> {
    const wallet = this.getWalletOrThrow(userId);
    let txns = this.transactions.get(wallet.id) || [];

    if (options?.type) {
      txns = txns.filter((t) => t.type === options.type);
    }
    if (options?.startDate) {
      txns = txns.filter((t) => t.createdAt >= options.startDate!);
    }
    if (options?.endDate) {
      txns = txns.filter((t) => t.createdAt <= options.endDate!);
    }

    const total = txns.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    txns = txns.sort((a, b) => b.createdAt - a.createdAt).slice(offset, offset + limit);

    return { transactions: txns, total };
  }

  /** Freeze a wallet (block all debits) */
  async freeze(userId: string, reason: string): Promise<Wallet> {
    const wallet = this.getWalletOrThrow(userId);
    if (wallet.frozen) {
      throw new Error('Wallet is already frozen');
    }
    wallet.frozen = true;
    wallet.frozenAt = Date.now();
    wallet.frozenReason = reason;
    wallet.updatedAt = Date.now();
    return wallet;
  }

  /** Unfreeze a wallet */
  async unfreeze(userId: string): Promise<Wallet> {
    const wallet = this.getWalletOrThrow(userId);
    if (!wallet.frozen) {
      throw new Error('Wallet is not frozen');
    }
    wallet.frozen = false;
    wallet.frozenAt = undefined;
    wallet.frozenReason = undefined;
    wallet.updatedAt = Date.now();
    return wallet;
  }

  /** Set wallet limits */
  async setLimits(
    userId: string,
    limits: { daily?: number; monthly?: number; transaction?: number },
  ): Promise<Wallet> {
    const wallet = this.getWalletOrThrow(userId);
    if (limits.daily !== undefined) wallet.dailyLimit = limits.daily;
    if (limits.monthly !== undefined) wallet.monthlyLimit = limits.monthly;
    if (limits.transaction !== undefined) wallet.transactionLimit = limits.transaction;
    wallet.updatedAt = Date.now();
    return wallet;
  }

  /** Check if a debit amount would exceed limits */
  async checkLimit(
    userId: string,
    amount: number,
  ): Promise<{
    allowed: boolean;
    reason?: string;
    dailyRemaining: number;
    monthlyRemaining: number;
  }> {
    const wallet = this.getWalletOrThrow(userId);
    const dailyRemaining = this.getDailyRemaining(wallet);
    const monthlyRemaining = this.getMonthlyRemaining(wallet);

    if (wallet.frozen)
      return { allowed: false, reason: 'Wallet is frozen', dailyRemaining, monthlyRemaining };
    if (amount > wallet.balance)
      return { allowed: false, reason: 'Insufficient balance', dailyRemaining, monthlyRemaining };
    if (amount > wallet.transactionLimit)
      return {
        allowed: false,
        reason: 'Exceeds transaction limit',
        dailyRemaining,
        monthlyRemaining,
      };
    if (amount > dailyRemaining)
      return { allowed: false, reason: 'Exceeds daily limit', dailyRemaining, monthlyRemaining };
    if (amount > monthlyRemaining)
      return { allowed: false, reason: 'Exceeds monthly limit', dailyRemaining, monthlyRemaining };

    return { allowed: true, dailyRemaining, monthlyRemaining };
  }

  /** Get monthly statement */
  async getStatement(
    userId: string,
    month: number,
    year: number,
  ): Promise<{
    openingBalance: number;
    closingBalance: number;
    totalCredits: number;
    totalDebits: number;
    transactionCount: number;
    transactions: WalletTransaction[];
  }> {
    const wallet = this.getWalletOrThrow(userId);
    const txns = this.transactions.get(wallet.id) || [];

    const startOfMonth = new Date(year, month - 1, 1).getTime();
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999).getTime();

    const monthTxns = txns
      .filter((t) => t.createdAt >= startOfMonth && t.createdAt <= endOfMonth)
      .sort((a, b) => a.createdAt - b.createdAt);

    let totalCredits = 0;
    let totalDebits = 0;
    for (const txn of monthTxns) {
      if (['credit', 'transfer_in', 'refund', 'reward'].includes(txn.type)) {
        totalCredits += txn.amount;
      } else {
        totalDebits += txn.amount;
      }
    }

    const openingBalance = monthTxns.length > 0 ? monthTxns[0]!.balanceBefore : wallet.balance;
    const closingBalance =
      monthTxns.length > 0 ? monthTxns[monthTxns.length - 1]!.balanceAfter : wallet.balance;

    return {
      openingBalance,
      closingBalance,
      totalCredits,
      totalDebits,
      transactionCount: monthTxns.length,
      transactions: monthTxns,
    };
  }

  // --- Private Helpers ---

  private getWalletOrThrow(userId: string): Wallet {
    const wallet = this.wallets.get(userId);
    if (!wallet) throw new Error(`Wallet not found for user: ${userId}`);
    return wallet;
  }

  private validateDebit(wallet: Wallet, amount: number): void {
    if (wallet.frozen) throw new Error('Wallet is frozen - debits are blocked');
    if (amount > wallet.balance) throw new Error('Insufficient balance');
    if (amount > wallet.transactionLimit)
      throw new Error(`Amount ${amount} exceeds transaction limit ${wallet.transactionLimit}`);

    const dailyRemaining = this.getDailyRemaining(wallet);
    if (amount > dailyRemaining)
      throw new Error(`Amount ${amount} exceeds daily remaining limit ${dailyRemaining}`);

    const monthlyRemaining = this.getMonthlyRemaining(wallet);
    if (amount > monthlyRemaining)
      throw new Error(`Amount ${amount} exceeds monthly remaining limit ${monthlyRemaining}`);
  }

  private createTransaction(
    wallet: Wallet,
    type: WalletTransactionType,
    amount: number,
    balanceBefore: number,
    description: string,
    referenceId?: string,
  ): WalletTransaction {
    const txn: WalletTransaction = {
      id: `wtxn_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      walletId: wallet.id,
      type,
      amount,
      balanceBefore,
      balanceAfter: wallet.balance,
      description,
      referenceId,
      metadata: {},
      createdAt: Date.now(),
    };

    const txns = this.transactions.get(wallet.id) || [];
    txns.push(txn);
    this.transactions.set(wallet.id, txns);
    return txn;
  }

  private updateUsage(wallet: Wallet, amount: number): void {
    const today = new Date().toISOString().split('T')[0]!;
    const monthKey = today.substring(0, 7);

    const daily = this.dailyUsage.get(wallet.id);
    if (daily && daily.date === today) {
      daily.amount += amount;
    } else {
      this.dailyUsage.set(wallet.id, { date: today, amount });
    }

    const monthly = this.monthlyUsage.get(wallet.id);
    if (monthly && monthly.month === monthKey) {
      monthly.amount += amount;
    } else {
      this.monthlyUsage.set(wallet.id, { month: monthKey, amount });
    }
  }

  private getDailyRemaining(wallet: Wallet): number {
    const today = new Date().toISOString().split('T')[0];
    const usage = this.dailyUsage.get(wallet.id);
    const used = usage && usage.date === today ? usage.amount : 0;
    return Math.max(0, wallet.dailyLimit - used);
  }

  private getMonthlyRemaining(wallet: Wallet): number {
    const monthKey = new Date().toISOString().substring(0, 7);
    const usage = this.monthlyUsage.get(wallet.id);
    const used = usage && usage.month === monthKey ? usage.amount : 0;
    return Math.max(0, wallet.monthlyLimit - used);
  }
}
