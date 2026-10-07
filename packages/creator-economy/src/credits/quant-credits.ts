import type { CreditTransaction } from '../types.js';

export class QuantCreditsService {
  private balances = new Map<string, number>();
  private transactions: CreditTransaction[] = [];

  getBalance(userId: string): number {
    return this.balances.get(userId) ?? 0;
  }

  earnCredits(userId: string, amount: number, source: string): CreditTransaction {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const current = this.getBalance(userId);
    this.balances.set(userId, current + amount);

    const transaction: CreditTransaction = {
      id: `credit-${crypto.randomUUID()}`,
      userId,
      amount,
      type: 'earn',
      source,
      timestamp: new Date(),
    };
    this.transactions.push(transaction);
    return transaction;
  }

  spendCredits(userId: string, amount: number, purpose: string): CreditTransaction {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const current = this.getBalance(userId);
    if (current < amount) {
      throw new Error(`Insufficient credits: has ${current}, needs ${amount}`);
    }

    this.balances.set(userId, current - amount);

    const transaction: CreditTransaction = {
      id: `credit-${crypto.randomUUID()}`,
      userId,
      amount,
      type: 'spend',
      source: purpose,
      timestamp: new Date(),
    };
    this.transactions.push(transaction);
    return transaction;
  }

  transferCredits(fromUser: string, toUser: string, amount: number): CreditTransaction[] {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    // Validate both balances before any mutation
    const fromBalance = this.getBalance(fromUser);
    if (fromBalance < amount) {
      throw new Error(`Insufficient credits: has ${fromBalance}, needs ${amount}`);
    }
    const toBalance = this.getBalance(toUser);

    // Apply both mutations together after validation
    const newFromBalance = fromBalance - amount;
    const newToBalance = toBalance + amount;
    this.balances.set(fromUser, newFromBalance);
    this.balances.set(toUser, newToBalance);

    const outTransaction: CreditTransaction = {
      id: `credit-${crypto.randomUUID()}`,
      userId: fromUser,
      amount,
      type: 'transfer_out',
      source: `transfer:${toUser}`,
      timestamp: new Date(),
    };

    const inTransaction: CreditTransaction = {
      id: `credit-${crypto.randomUUID()}`,
      userId: toUser,
      amount,
      type: 'transfer_in',
      source: `transfer:${fromUser}`,
      timestamp: new Date(),
    };

    this.transactions.push(outTransaction, inTransaction);
    return [outTransaction, inTransaction];
  }

  getTransactionHistory(userId: string): CreditTransaction[] {
    return this.transactions.filter((t) => t.userId === userId);
  }
}
