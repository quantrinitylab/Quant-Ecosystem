import type { BoostAnalytics, BoostRequest } from '../types.js';
import type { CoinWallet } from '../coins/wallet.js';
import type { BoostPackRegistry } from './boost-packs.js';

export class SelfBoostEngine {
  private boosts = new Map<string, BoostRequest>();
  private analytics = new Map<string, BoostAnalytics>();
  private wallet: CoinWallet;
  private packRegistry: BoostPackRegistry;

  constructor(wallet: CoinWallet, packRegistry: BoostPackRegistry) {
    this.wallet = wallet;
    this.packRegistry = packRegistry;
  }

  boostPost(
    userId: string,
    postId: string,
    packId: string,
  ): { success: boolean; boost?: BoostRequest; message?: string } {
    const pack = this.packRegistry.getPack(packId);
    if (!pack) {
      return { success: false, message: 'Pack not found' };
    }

    try {
      this.wallet.debitCoins(userId, pack.costCoins, `boost:${postId}`);
    } catch (e: any) {
      return { success: false, message: e.message };
    }

    const boost: BoostRequest = {
      id: crypto.randomUUID(),
      userId,
      postId,
      packId,
      multiplier: pack.multiplier,
      sponsored: false,
      createdAt: new Date(),
    };
    this.boosts.set(boost.id, boost);

    const boostAnalytics: BoostAnalytics = {
      boostId: boost.id,
      impressions: 0,
      reachMultiplier: pack.multiplier,
      organicReach: 0,
    };
    this.analytics.set(boost.id, boostAnalytics);

    return { success: true, boost };
  }

  getBoostAnalytics(boostId: string): BoostAnalytics | undefined {
    return this.analytics.get(boostId);
  }

  recordBoostImpression(boostId: string): void {
    const analytics = this.analytics.get(boostId);
    if (analytics) {
      analytics.impressions++;
      analytics.organicReach = analytics.impressions * analytics.reachMultiplier;
    }
  }

  getBoost(boostId: string): BoostRequest | undefined {
    return this.boosts.get(boostId);
  }
}
