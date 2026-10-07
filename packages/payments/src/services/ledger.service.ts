// ============================================================================
// Payments - Immutable Ledger Service
// Append-only transaction ledger with integrity verification
// ============================================================================

import { z } from 'zod';
import type { LedgerEntry, LedgerEntryType } from '../types';

export const RecordEntrySchema = z.object({
  accountId: z.string().min(1),
  type: z.enum(['credit', 'debit', 'transfer', 'fee', 'revenue', 'payout']),
  amount: z.number().positive(),
  description: z.string().min(1),
  referenceId: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

/**
 * LedgerService - Immutable transaction ledger
 *
 * Every financial event creates an immutable entry.
 * Entries cannot be modified or deleted, only appended.
 * Provides balance computation and integrity verification.
 */
export class LedgerService {
  private readonly entries: LedgerEntry[] = [];
  private readonly balances: Map<string, number> = new Map();

  /**
   * Record a new ledger entry (append-only)
   */
  record(params: {
    accountId: string;
    type: LedgerEntryType;
    amount: number;
    description: string;
    referenceId?: string;
    metadata?: Record<string, string>;
  }): LedgerEntry {
    const validated = RecordEntrySchema.parse(params);

    const currentBalance = this.balances.get(validated.accountId) ?? 0;
    const isCredit =
      validated.type === 'credit' || validated.type === 'revenue' || validated.type === 'transfer';
    const balanceAfter = isCredit
      ? currentBalance + validated.amount
      : currentBalance - validated.amount;

    const entry: LedgerEntry = {
      id: `led_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      accountId: validated.accountId,
      type: validated.type,
      amount: validated.amount,
      balanceAfter,
      description: validated.description,
      referenceId: validated.referenceId,
      metadata: validated.metadata,
      createdAt: Date.now(),
    };

    this.entries.push(Object.freeze(entry) as LedgerEntry);
    this.balances.set(validated.accountId, balanceAfter);

    return entry;
  }

  /**
   * Get entries with optional filters
   */
  getEntries(filters?: {
    accountId?: string;
    type?: LedgerEntryType;
    startDate?: number;
    endDate?: number;
  }): LedgerEntry[] {
    let results = [...this.entries];

    if (filters?.accountId) {
      results = results.filter((e) => e.accountId === filters.accountId);
    }
    if (filters?.type) {
      results = results.filter((e) => e.type === filters.type);
    }
    if (filters?.startDate) {
      results = results.filter((e) => e.createdAt >= filters.startDate!);
    }
    if (filters?.endDate) {
      results = results.filter((e) => e.createdAt <= filters.endDate!);
    }

    return results;
  }

  /**
   * Get current balance for an account
   */
  getBalance(accountId: string): number {
    return this.balances.get(accountId) ?? 0;
  }

  /**
   * Verify ledger integrity - check that balances match computed sums
   */
  verify(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const computedBalances: Map<string, number> = new Map();

    for (const entry of this.entries) {
      const current = computedBalances.get(entry.accountId) ?? 0;
      const isCredit =
        entry.type === 'credit' || entry.type === 'revenue' || entry.type === 'transfer';
      const expected = isCredit ? current + entry.amount : current - entry.amount;

      if (Math.abs(expected - entry.balanceAfter) > 0.001) {
        errors.push(`Entry ${entry.id}: expected balance ${expected}, got ${entry.balanceAfter}`);
      }

      computedBalances.set(entry.accountId, entry.balanceAfter);
    }

    // Verify final balances match stored balances
    for (const [accountId, storedBalance] of this.balances) {
      const computed = computedBalances.get(accountId) ?? 0;
      if (Math.abs(storedBalance - computed) > 0.001) {
        errors.push(
          `Account ${accountId}: stored balance ${storedBalance} != computed ${computed}`,
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
