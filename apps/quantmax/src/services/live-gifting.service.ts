// ============================================================================
// QuantMax - Live Gifting Service
// Virtual gifts, coin economy, and creator earnings for live streams
// ============================================================================
//
// MONEY-INTEGRITY (verify-first, Batch-17): this is an in-memory, GAMIFIED coin
// balance and is NOT wired to any route/consumer (referenced only by its own
// unit test). `addCoins` is not payment-gated (no real money in) and there is
// no withdrawal path (no real money out); `estimatedRevenue` (coins * $0.005)
// is an ANALYTICS estimate, not a cash movement. So it carries no money-integrity
// risk as-is. If live-gifting is ever wired to real coin top-ups or creator
// cashouts, its balances must move onto the durable @quant/credits ledger
// (transfer/spend, PayoutService) rather than this Map — no rebuild until then.

export interface Gift {
  id: string;
  name: string;
  icon: string;
  coinCost: number;
  animationType: string;
}

export interface GiftTransaction {
  id: string;
  streamId: string;
  senderId: string;
  giftId: string;
  quantity: number;
  totalCoins: number;
  timestamp: number;
}

export interface CreatorEarnings {
  streamId: string;
  totalGifts: number;
  totalCoins: number;
  estimatedRevenue: number;
  topGifters: { userId: string; totalCoins: number }[];
}

export class LiveGiftingService {
  private gifts: Map<string, Gift> = new Map();
  private transactions: GiftTransaction[] = [];
  private userBalances: Map<string, number> = new Map();
  private idCounter = 0;

  private generateId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  constructor() {
    this.initDefaultGifts();
  }

  private initDefaultGifts(): void {
    const defaults: Omit<Gift, 'id'>[] = [
      { name: 'Rose', icon: '🌹', coinCost: 1, animationType: 'float' },
      { name: 'Heart', icon: '❤️', coinCost: 5, animationType: 'pulse' },
      { name: 'Star', icon: '⭐', coinCost: 10, animationType: 'spin' },
      { name: 'Diamond', icon: '💎', coinCost: 100, animationType: 'sparkle' },
      { name: 'Rocket', icon: '🚀', coinCost: 500, animationType: 'launch' },
      { name: 'Castle', icon: '🏰', coinCost: 1000, animationType: 'grand' },
    ];
    for (const g of defaults) {
      const id = this.generateId('gift');
      this.gifts.set(id, { id, ...g });
    }
  }

  sendGift(
    streamId: string,
    senderId: string,
    giftId: string,
    quantity: number,
  ): GiftTransaction | null {
    const gift = this.gifts.get(giftId);
    if (!gift) return null;

    const totalCoins = gift.coinCost * quantity;
    if (!this.deductCoins(senderId, totalCoins)) return null;

    const transaction: GiftTransaction = {
      id: this.generateId('txn'),
      streamId,
      senderId,
      giftId,
      quantity,
      totalCoins,
      timestamp: Date.now(),
    };
    this.transactions.push(transaction);
    return transaction;
  }

  getAvailableGifts(): Gift[] {
    return [...this.gifts.values()];
  }

  getGiftHistory(streamId: string): GiftTransaction[] {
    return this.transactions.filter((t) => t.streamId === streamId);
  }

  calculateCreatorEarnings(streamId: string): CreatorEarnings {
    const streamTxns = this.transactions.filter((t) => t.streamId === streamId);
    const totalCoins = streamTxns.reduce((sum, t) => sum + t.totalCoins, 0);
    const gifterMap = new Map<string, number>();

    for (const txn of streamTxns) {
      const current = gifterMap.get(txn.senderId) ?? 0;
      gifterMap.set(txn.senderId, current + txn.totalCoins);
    }

    const topGifters = [...gifterMap.entries()]
      .map(([userId, coins]) => ({ userId, totalCoins: coins }))
      .sort((a, b) => b.totalCoins - a.totalCoins);

    return {
      streamId,
      totalGifts: streamTxns.length,
      totalCoins,
      estimatedRevenue: totalCoins * 0.005, // $0.005 per coin
      topGifters,
    };
  }

  getTopGifters(streamId: string, limit: number): { userId: string; totalCoins: number }[] {
    const earnings = this.calculateCreatorEarnings(streamId);
    return earnings.topGifters.slice(0, limit);
  }

  getUserBalance(userId: string): number {
    return this.userBalances.get(userId) ?? 0;
  }

  addCoins(userId: string, amount: number): void {
    const current = this.userBalances.get(userId) ?? 0;
    this.userBalances.set(userId, current + amount);
  }

  deductCoins(userId: string, amount: number): boolean {
    const current = this.userBalances.get(userId) ?? 0;
    if (current < amount) return false;
    this.userBalances.set(userId, current - amount);
    return true;
  }
}
