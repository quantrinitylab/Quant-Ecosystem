// ============================================================================
// Payments - Cashout Service
// Bank transfer and instant debit cashout for creators
// ============================================================================

import { z } from 'zod';
import type { CashoutRequest, CashoutMethod } from '../types';

export const RequestCashoutSchema = z.object({
  creatorId: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(['bank_transfer', 'instant']),
});

interface BalanceProvider {
  getAvailableBalance(creatorId: string): number;
  debitBalance(creatorId: string, amount: number): void;
}

/**
 * CashoutService - Bank transfer and instant debit for creators
 *
 * Manages cashout requests with validation against available balance.
 * Status transitions: pending -> processing -> completed|failed
 */
export class CashoutService {
  private readonly cashouts: Map<string, CashoutRequest> = new Map();
  private readonly balanceProvider: BalanceProvider;

  constructor(balanceProvider: BalanceProvider) {
    this.balanceProvider = balanceProvider;
  }

  /**
   * Request a cashout (validates available balance)
   */
  requestCashout(params: {
    creatorId: string;
    amount: number;
    method: CashoutMethod;
  }): CashoutRequest {
    const validated = RequestCashoutSchema.parse(params);

    const available = this.balanceProvider.getAvailableBalance(validated.creatorId);
    if (validated.amount > available) {
      throw new Error('Insufficient available balance for cashout');
    }

    const cashout: CashoutRequest = {
      id: `cashout_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      creatorId: validated.creatorId,
      amount: validated.amount,
      method: validated.method,
      status: 'pending',
      requestedAt: Date.now(),
    };

    this.cashouts.set(cashout.id, cashout);
    this.balanceProvider.debitBalance(validated.creatorId, validated.amount);
    return cashout;
  }

  /**
   * Get cashout history for a creator
   */
  getCashoutHistory(creatorId: string): CashoutRequest[] {
    const results: CashoutRequest[] = [];
    for (const [, cashout] of this.cashouts) {
      if (cashout.creatorId === creatorId) {
        results.push(cashout);
      }
    }
    return results.sort((a, b) => b.requestedAt - a.requestedAt);
  }

  /**
   * Get status of a specific cashout
   */
  getCashoutStatus(cashoutId: string): CashoutRequest {
    const cashout = this.cashouts.get(cashoutId);
    if (!cashout) throw new Error(`Cashout not found: ${cashoutId}`);
    return cashout;
  }

  /**
   * Transition cashout to processing state
   */
  markProcessing(cashoutId: string): CashoutRequest {
    const cashout = this.cashouts.get(cashoutId);
    if (!cashout) throw new Error(`Cashout not found: ${cashoutId}`);
    if (cashout.status !== 'pending') {
      throw new Error(`Cannot transition from ${cashout.status} to processing`);
    }
    cashout.status = 'processing';
    return cashout;
  }

  /**
   * Mark cashout as completed
   */
  markCompleted(cashoutId: string): CashoutRequest {
    const cashout = this.cashouts.get(cashoutId);
    if (!cashout) throw new Error(`Cashout not found: ${cashoutId}`);
    if (cashout.status !== 'processing') {
      throw new Error(`Cannot transition from ${cashout.status} to completed`);
    }
    cashout.status = 'completed';
    cashout.processedAt = Date.now();
    return cashout;
  }

  /**
   * Mark cashout as failed
   */
  markFailed(cashoutId: string): CashoutRequest {
    const cashout = this.cashouts.get(cashoutId);
    if (!cashout) throw new Error(`Cashout not found: ${cashoutId}`);
    if (cashout.status !== 'processing') {
      throw new Error(`Cannot transition from ${cashout.status} to failed`);
    }
    cashout.status = 'failed';
    cashout.processedAt = Date.now();
    return cashout;
  }
}
