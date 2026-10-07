import type { PayoutRequest, PayoutStatus } from '../types.js';
import type { RevenueSplitEngine } from './revenue-split.js';

export class CreatorPayoutService {
  private payouts: PayoutRequest[] = [];
  private revenueSplitEngine: RevenueSplitEngine;
  private minimumPayout: number;

  constructor(revenueSplitEngine: RevenueSplitEngine, minimumPayout = 100) {
    this.revenueSplitEngine = revenueSplitEngine;
    this.minimumPayout = minimumPayout;
  }

  requestCashOut(
    creatorId: string,
    amount: number,
    method: string,
  ): { success: boolean; payout?: PayoutRequest; message?: string } {
    if (amount < this.minimumPayout) {
      return { success: false, message: `Minimum payout is ${this.minimumPayout} coins` };
    }

    const earnings = this.revenueSplitEngine.getCreatorEarnings(creatorId);
    const alreadyPaid = this.getPayoutTotal(creatorId);
    const available = earnings - alreadyPaid;

    if (amount > available) {
      return { success: false, message: `Insufficient earnings: available ${available}` };
    }

    const payout: PayoutRequest = {
      id: crypto.randomUUID(),
      creatorId,
      amount,
      method,
      status: 'pending',
      requestedAt: new Date(),
    };
    this.payouts.push(payout);
    return { success: true, payout };
  }

  getPayoutHistory(creatorId: string): PayoutRequest[] {
    return this.payouts.filter((p) => p.creatorId === creatorId);
  }

  processPayout(payoutId: string, status: PayoutStatus = 'completed'): PayoutRequest | null {
    const payout = this.payouts.find((p) => p.id === payoutId);
    if (!payout) return null;
    payout.status = status;
    payout.processedAt = new Date();
    return payout;
  }

  private getPayoutTotal(creatorId: string): number {
    return this.payouts
      .filter(
        (p) =>
          p.creatorId === creatorId &&
          (p.status === 'completed' || p.status === 'pending' || p.status === 'processing'),
      )
      .reduce((sum, p) => sum + p.amount, 0);
  }
}
