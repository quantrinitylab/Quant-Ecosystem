// ============================================================================
// QuantAds — coin economy services, backed by the durable @quant/credits ledger
// ============================================================================
//
// These replace the QuantAds usage of the in-memory `@quant/quant-economy`
// money services (BuyCoinService / EarnCoinService / StorePurchaseService /
// GiftingService / TippingService / SelfBoostEngine). Every coin movement now
// goes through {@link QuantAdsCreditsWallet} onto the append-only credit
// ledger, so balances survive restarts and are idempotent by construction.
//
// The NON-money record-keeping (gift/tip/boost history, boost analytics) keeps
// the same per-instance in-memory behaviour these services had before — it is
// not a ledger and carries no dual-source-of-truth risk. The shared catalog /
// inventory / boost-pack registries are still provided by the container.
//
// Coins map 1:1 to whole credits. Money semantics preserved:
//   • buy      → credit (kind purchase), idempotent per paymentRef.
//   • earn     → credit (daily: adjustment/spendable; referral: earn-kind).
//   • store    → debit (spend); item granted to inventory on success.
//   • gift     → debit sender (spend); item granted to recipient inventory.
//   • tip      → transfer sender→recipient (recipient credit is withdrawable).
//   • boost    → debit (spend); boost + analytics recorded.

import { randomUUID } from 'node:crypto';
import type {
  PaymentGatewayAdapter,
  VirtualGoodsCatalog,
  CrossAppInventory,
  BoostPackRegistry,
  Gift,
  Tip,
  BoostRequest,
  BoostAnalytics,
} from '@quant/quant-economy';
import type { QuantAdsCreditsWallet } from './credits-wallet.js';
import type { PublisherWalletPort } from './publisher-payout-scheduler.service.js';

// ---------------------------------------------------------------------------
// Buy coins — real payment verification, then an idempotent ledger credit.
// ---------------------------------------------------------------------------

export class BuyCoinLedgerService {
  constructor(private readonly wallet: QuantAdsCreditsWallet) {}

  buyWithStripe(
    userId: string,
    amount: number,
    paymentRef: string,
    adapter: PaymentGatewayAdapter,
  ) {
    return this.processPurchase(userId, amount, paymentRef, adapter, 'stripe');
  }

  buyWithRazorpay(
    userId: string,
    amount: number,
    paymentRef: string,
    adapter: PaymentGatewayAdapter,
  ) {
    return this.processPurchase(userId, amount, paymentRef, adapter, 'razorpay');
  }

  buyWithUPI(userId: string, amount: number, paymentRef: string, adapter: PaymentGatewayAdapter) {
    return this.processPurchase(userId, amount, paymentRef, adapter, 'upi');
  }

  private async processPurchase(
    userId: string,
    amount: number,
    paymentRef: string,
    adapter: PaymentGatewayAdapter,
    source: string,
  ): Promise<{ success: boolean; coins: number }> {
    const order = await adapter.createOrder(amount, 'INR');
    const verified = await adapter.verifyPayment(order.orderId, paymentRef);
    if (!verified) {
      return { success: false, coins: 0 };
    }

    // Idempotent by paymentRef: a replayed callback credits at most once, and
    // the purchase is visible on the ledger as a `purchase` entry.
    const { credited } = await this.wallet.grantOnce(
      userId,
      amount,
      'purchase',
      `buy-${paymentRef}`,
      `buy-coins:${source}`,
    );
    return { success: credited, coins: credited ? amount : 0 };
  }
}

// ---------------------------------------------------------------------------
// Earn coins — daily login + referral, idempotent via ledger provenance keys.
// ---------------------------------------------------------------------------

export class EarnCoinLedgerService {
  private readonly dailyLoginReward: number;
  private readonly referralBonus: number;

  constructor(
    private readonly wallet: QuantAdsCreditsWallet,
    config?: { dailyLoginReward?: number; referralBonus?: number },
  ) {
    this.dailyLoginReward = config?.dailyLoginReward ?? 10;
    this.referralBonus = config?.referralBonus ?? 50;
  }

  async claimDailyLogin(userId: string): Promise<{ success: boolean; coins: number }> {
    const today = new Date().toISOString().split('T')[0]!;
    // Daily reward is spendable (kind adjustment), permanent, at-most-once/day.
    const { credited } = await this.wallet.grantOnce(
      userId,
      this.dailyLoginReward,
      'adjustment',
      `daily-${userId}-${today}`,
      'daily-login',
    );
    return { success: credited, coins: credited ? this.dailyLoginReward : 0 };
  }

  async claimReferralBonus(
    referrerId: string,
    referredId: string,
  ): Promise<{ success: boolean; coins: number }> {
    // Referral bonus is an EARNED credit (withdrawable), once per referral pair.
    const { credited } = await this.wallet.grantOnce(
      referrerId,
      this.referralBonus,
      'referral',
      `ref-${referrerId}:${referredId}`,
      `referral:${referredId}`,
    );
    return { success: credited, coins: credited ? this.referralBonus : 0 };
  }
}

// ---------------------------------------------------------------------------
// Store purchase — debit the buyer, grant the item to their inventory.
// ---------------------------------------------------------------------------

export class StorePurchaseLedgerService {
  constructor(
    private readonly wallet: QuantAdsCreditsWallet,
    private readonly catalog: VirtualGoodsCatalog,
    private readonly inventory: CrossAppInventory,
  ) {}

  async purchaseItem(
    userId: string,
    itemId: string,
  ): Promise<{ success: boolean; message: string }> {
    const item = this.catalog.getItem(itemId);
    if (!item) {
      return { success: false, message: 'Item not found' };
    }
    try {
      await this.wallet.spend(
        userId,
        item.priceCoins,
        `store:${userId}:${itemId}:${randomUUID()}`,
        `purchase:${itemId}`,
      );
    } catch (e: unknown) {
      return { success: false, message: e instanceof Error ? e.message : 'Insufficient balance' };
    }
    this.inventory.grantItem(userId, itemId);
    return { success: true, message: `Purchased ${item.name}` };
  }
}

// ---------------------------------------------------------------------------
// Gifting — debit the sender, grant the gifted item to the recipient.
// ---------------------------------------------------------------------------

export class GiftingLedgerService {
  private readonly gifts: Gift[] = [];

  constructor(
    private readonly wallet: QuantAdsCreditsWallet,
    private readonly catalog: VirtualGoodsCatalog,
    private readonly inventory: CrossAppInventory,
  ) {}

  async sendGift(
    fromUserId: string,
    toUserId: string,
    itemId: string,
  ): Promise<{ success: boolean; gift?: Gift; message?: string }> {
    const item = this.catalog.getItem(itemId);
    if (!item) {
      return { success: false, message: 'Item not found' };
    }
    try {
      await this.wallet.spend(
        fromUserId,
        item.priceCoins,
        `gift:${fromUserId}:${toUserId}:${itemId}:${randomUUID()}`,
        `gift:${itemId}:to:${toUserId}`,
      );
    } catch (e: unknown) {
      return { success: false, message: e instanceof Error ? e.message : 'Insufficient balance' };
    }
    const gift: Gift = {
      id: randomUUID(),
      fromUserId,
      toUserId,
      itemId,
      status: 'accepted',
      createdAt: new Date(),
    };
    this.gifts.push(gift);
    this.inventory.grantItem(toUserId, itemId);
    return { success: true, gift };
  }

  getReceivedGifts(userId: string): Gift[] {
    return this.gifts.filter((g) => g.toUserId === userId);
  }

  getSentGifts(userId: string): Gift[] {
    return this.gifts.filter((g) => g.fromUserId === userId);
  }
}

// ---------------------------------------------------------------------------
// Tipping — atomic sender→recipient transfer (recipient credit is withdrawable).
// ---------------------------------------------------------------------------

export class TippingLedgerService {
  private readonly tips: Tip[] = [];

  constructor(private readonly wallet: QuantAdsCreditsWallet) {}

  async sendTip(
    fromUserId: string,
    toUserId: string,
    amount: number,
  ): Promise<{ success: boolean; tip?: Tip; message?: string }> {
    if (amount <= 0) {
      return { success: false, message: 'Amount must be positive' };
    }
    try {
      await this.wallet.transfer(
        fromUserId,
        toUserId,
        amount,
        `tip:${fromUserId}:${toUserId}:${randomUUID()}`,
        'referral',
        `tip:from:${fromUserId}`,
      );
    } catch (e: unknown) {
      return { success: false, message: e instanceof Error ? e.message : 'Insufficient balance' };
    }
    const tip: Tip = {
      id: randomUUID(),
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
}

// ---------------------------------------------------------------------------
// Boost — debit the booster, record the boost and its analytics.
// ---------------------------------------------------------------------------

export class BoostLedgerService {
  private readonly boosts = new Map<string, BoostRequest>();
  private readonly analytics = new Map<string, BoostAnalytics>();

  constructor(
    private readonly wallet: QuantAdsCreditsWallet,
    private readonly packRegistry: BoostPackRegistry,
  ) {}

  async boostPost(
    userId: string,
    postId: string,
    packId: string,
  ): Promise<{ success: boolean; boost?: BoostRequest; message?: string }> {
    const pack = this.packRegistry.getPack(packId);
    if (!pack) {
      return { success: false, message: 'Pack not found' };
    }
    try {
      await this.wallet.spend(
        userId,
        pack.costCoins,
        `boost:${userId}:${postId}:${randomUUID()}`,
        `boost:${postId}`,
      );
    } catch (e: unknown) {
      return { success: false, message: e instanceof Error ? e.message : 'Insufficient balance' };
    }
    const boost: BoostRequest = {
      id: randomUUID(),
      userId,
      postId,
      packId,
      multiplier: pack.multiplier,
      sponsored: false,
      createdAt: new Date(),
    };
    this.boosts.set(boost.id, boost);
    this.analytics.set(boost.id, {
      boostId: boost.id,
      impressions: 0,
      reachMultiplier: pack.multiplier,
      organicReach: 0,
    });
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

  /** All boosts created by a given user (the `/boost/active/:userId` view). */
  getActiveBoosts(userId: string): BoostRequest[] {
    return [...this.boosts.values()].filter((b) => b.userId === userId);
  }
}

// ---------------------------------------------------------------------------
// Publisher payout wallet port — credits a publisher's ad-click earnings onto
// the durable ledger as a WITHDRAWABLE earn-kind (`creator_payout`), idempotent
// by the scheduler's per-(publisher, UTC-day) key. This is what makes real ad
// revenue land durably (the prior in-memory CoinWallet port lost it on restart)
// and cash-out-eligible via the payout/withdrawal flow.
// ---------------------------------------------------------------------------

export function createPublisherWalletPort(wallet: QuantAdsCreditsWallet): PublisherWalletPort {
  return {
    async credit(
      publisherId: string,
      amountCredits: number,
      idempotencyKey: string,
    ): Promise<void> {
      await wallet.grantOnce(
        publisherId,
        amountCredits,
        'creator_payout',
        idempotencyKey,
        'ad-revenue',
      );
    },
  };
}
