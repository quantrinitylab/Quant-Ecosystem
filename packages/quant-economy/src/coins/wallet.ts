import type { CoinTransaction, Wallet } from '../types.js';

export class CoinWallet {
  private wallets = new Map<string, Wallet>();
  private transactions: CoinTransaction[] = [];
  private processedKeys = new Map<string, CoinTransaction>();

  createWallet(userId: string): Wallet {
    if (this.wallets.has(userId)) {
      return this.wallets.get(userId)!;
    }
    const wallet: Wallet = {
      userId,
      balance: 0,
      createdAt: new Date(),
    };
    this.wallets.set(userId, wallet);
    return wallet;
  }

  getBalance(userId: string): number {
    const wallet = this.wallets.get(userId);
    if (!wallet) {
      throw new Error(`Wallet not found for user ${userId}`);
    }
    return wallet.balance;
  }

  creditCoins(
    userId: string,
    amount: number,
    reason: string,
    idempotencyKey?: string,
  ): CoinTransaction {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    const wallet = this.wallets.get(userId);
    if (!wallet) {
      throw new Error(`Wallet not found for user ${userId}`);
    }

    const key = idempotencyKey ?? `credit-${crypto.randomUUID()}`;

    // If this key was already processed, return the existing transaction
    const existing = this.processedKeys.get(key);
    if (existing) {
      return existing;
    }

    wallet.balance += amount;

    const tx: CoinTransaction = {
      id: crypto.randomUUID(),
      userId,
      amount,
      direction: 'credit',
      reason,
      idempotencyKey: key,
      timestamp: new Date(),
    };
    this.transactions.push(tx);
    this.processedKeys.set(key, tx);
    return tx;
  }

  debitCoins(
    userId: string,
    amount: number,
    reason: string,
    idempotencyKey?: string,
  ): CoinTransaction {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    const wallet = this.wallets.get(userId);
    if (!wallet) {
      throw new Error(`Wallet not found for user ${userId}`);
    }
    if (wallet.balance < amount) {
      throw new Error(`Insufficient balance: has ${wallet.balance}, needs ${amount}`);
    }

    const key = idempotencyKey ?? `debit-${crypto.randomUUID()}`;

    // If this key was already processed, return the existing transaction
    const existing = this.processedKeys.get(key);
    if (existing) {
      return existing;
    }

    wallet.balance -= amount;

    const tx: CoinTransaction = {
      id: crypto.randomUUID(),
      userId,
      amount,
      direction: 'debit',
      reason,
      idempotencyKey: key,
      timestamp: new Date(),
    };
    this.transactions.push(tx);
    this.processedKeys.set(key, tx);
    return tx;
  }

  getTransactionHistory(userId: string): CoinTransaction[] {
    return this.transactions.filter((t) => t.userId === userId);
  }

  getWallet(userId: string): Wallet | undefined {
    return this.wallets.get(userId);
  }
}
