import type { Tip } from '../types.js';
import type { CoinWallet } from '../coins/wallet.js';

export const PRESET_TIP_AMOUNTS = [10, 50, 100, 500] as const;

export class TippingService {
  private tips: Tip[] = [];
  private wallet: CoinWallet;

  constructor(wallet: CoinWallet) {
    this.wallet = wallet;
  }

  sendTip(
    fromUserId: string,
    toUserId: string,
    amount: number,
  ): { success: boolean; tip?: Tip; message?: string } {
    if (amount <= 0) {
      return { success: false, message: 'Amount must be positive' };
    }

    try {
      this.wallet.debitCoins(fromUserId, amount, `tip:to:${toUserId}`);
    } catch (e: any) {
      return { success: false, message: e.message };
    }

    this.wallet.creditCoins(toUserId, amount, `tip:from:${fromUserId}`);

    const tip: Tip = {
      id: crypto.randomUUID(),
      fromUserId,
      toUserId,
      amount,
      createdAt: new Date(),
    };
    this.tips.push(tip);

    return { success: true, tip };
  }

  getTipsReceived(userId: string): Tip[] {
    return this.tips.filter((t) => t.toUserId === userId);
  }

  getTipsSent(userId: string): Tip[] {
    return this.tips.filter((t) => t.fromUserId === userId);
  }

  getPresetAmounts(): readonly number[] {
    return PRESET_TIP_AMOUNTS;
  }
}
