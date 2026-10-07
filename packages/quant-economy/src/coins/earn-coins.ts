import type { CoinWallet } from './wallet.js';

export class EarnCoinService {
  private dailyLoginClaims = new Map<string, string>(); // userId -> last claim date string
  private referralPairs = new Set<string>(); // "referrerId:referredId"
  private wallet: CoinWallet;

  private dailyLoginReward = 10;
  private referralBonus = 50;

  constructor(wallet: CoinWallet, config?: { dailyLoginReward?: number; referralBonus?: number }) {
    this.wallet = wallet;
    if (config?.dailyLoginReward !== undefined) this.dailyLoginReward = config.dailyLoginReward;
    if (config?.referralBonus !== undefined) this.referralBonus = config.referralBonus;
  }

  claimDailyLogin(userId: string): { success: boolean; coins: number } {
    const today = new Date().toISOString().split('T')[0]!;
    const lastClaim = this.dailyLoginClaims.get(userId);

    if (lastClaim === today) {
      return { success: false, coins: 0 };
    }

    this.dailyLoginClaims.set(userId, today);
    this.wallet.creditCoins(
      userId,
      this.dailyLoginReward,
      'daily-login',
      `daily-${userId}-${today}`,
    );
    return { success: true, coins: this.dailyLoginReward };
  }

  claimReferralBonus(referrerId: string, referredId: string): { success: boolean; coins: number } {
    const pairKey = `${referrerId}:${referredId}`;

    if (this.referralPairs.has(pairKey)) {
      return { success: false, coins: 0 };
    }

    this.referralPairs.add(pairKey);
    this.wallet.creditCoins(
      referrerId,
      this.referralBonus,
      `referral:${referredId}`,
      `ref-${pairKey}`,
    );
    return { success: true, coins: this.referralBonus };
  }

  earnCustom(userId: string, amount: number, source: string): { success: boolean; coins: number } {
    if (amount <= 0) {
      return { success: false, coins: 0 };
    }
    this.wallet.creditCoins(userId, amount, source, `custom-${userId}-${crypto.randomUUID()}`);
    return { success: true, coins: amount };
  }
}
