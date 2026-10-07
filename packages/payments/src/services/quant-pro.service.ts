// ============================================================================
// Payments - Quant Pro Subscription Service
// Single subscription across all Quant apps with IAP support
// ============================================================================

import { z } from 'zod';
import type { QuantProPlan, IAPReceipt, IAPValidationResult, SubscriptionPlan } from '../types';
import { SubscriptionService } from './subscription-service';
import { type IAPValidator, createIAPValidatorsFromEnv } from './iap-validation';

export const SubscribeSchema = z.object({
  userId: z.string().min(1),
  plan: z.enum(['free', 'pro_monthly', 'pro_yearly']),
  paymentMethod: z.string().optional(),
});

export const ValidateIAPReceiptSchema = z.object({
  platform: z.enum(['apple', 'google']),
  receiptData: z.string().min(1),
  transactionId: z.string().min(1),
  productId: z.string().min(1),
});

/** Pro features that can be gated */
export type ProFeature =
  | 'unlimited_ai'
  | 'priority_support'
  | 'advanced_analytics'
  | 'custom_themes'
  | 'ad_free'
  | 'early_access'
  | 'premium_content'
  | 'increased_storage';

/** Quant Pro plan definitions */
const QUANT_PRO_PLANS: Record<
  QuantProPlan,
  { name: string; amount: number; interval: 'monthly' | 'yearly'; features: ProFeature[] }
> = {
  free: {
    name: 'Quant Free',
    amount: 0,
    interval: 'monthly',
    features: [],
  },
  pro_monthly: {
    name: 'Quant Pro Monthly',
    amount: 9.99,
    interval: 'monthly',
    features: [
      'unlimited_ai',
      'priority_support',
      'advanced_analytics',
      'custom_themes',
      'ad_free',
      'early_access',
      'premium_content',
      'increased_storage',
    ],
  },
  pro_yearly: {
    name: 'Quant Pro Yearly',
    amount: 99.99,
    interval: 'yearly',
    features: [
      'unlimited_ai',
      'priority_support',
      'advanced_analytics',
      'custom_themes',
      'ad_free',
      'early_access',
      'premium_content',
      'increased_storage',
    ],
  },
};

interface UserSubscriptionState {
  userId: string;
  plan: QuantProPlan;
  subscriptionId?: string;
  iapReceipt?: IAPReceipt;
  startedAt: number;
  expiresAt?: number;
  autoRenewing: boolean;
  cancelledAt?: number;
}

/**
 * QuantProService - Single subscription across all Quant apps
 *
 * Manages Quant Pro subscription lifecycle including:
 * - Subscribe/cancel/check status
 * - Feature gating based on plan
 * - Apple/Google IAP server-side receipt validation
 * - IAP subscription sync
 */
/** Optional injection of platform IAP validators (primarily for tests). */
export interface QuantProServiceOptions {
  appleValidator?: IAPValidator | null;
  googleValidator?: IAPValidator | null;
}

export class QuantProService {
  private subscriptionService: SubscriptionService;
  private userSubscriptions: Map<string, UserSubscriptionState>;
  private validatedReceipts: Map<string, IAPValidationResult>;
  private readonly appleValidator: IAPValidator | null;
  private readonly googleValidator: IAPValidator | null;

  constructor(subscriptionService?: SubscriptionService, options?: QuantProServiceOptions) {
    this.subscriptionService = subscriptionService || new SubscriptionService();
    this.userSubscriptions = new Map();
    this.validatedReceipts = new Map();

    const envValidators = createIAPValidatorsFromEnv();
    this.appleValidator =
      options?.appleValidator !== undefined ? options.appleValidator : envValidators.apple;
    this.googleValidator =
      options?.googleValidator !== undefined ? options.googleValidator : envValidators.google;

    this.registerPlans();
  }

  /** Subscribe a user to a Quant Pro plan */
  async subscribe(
    userId: string,
    plan: QuantProPlan,
    paymentMethod?: string,
  ): Promise<UserSubscriptionState> {
    SubscribeSchema.parse({ userId, plan, paymentMethod });

    // Check for existing subscription
    const existing = this.userSubscriptions.get(userId);
    if (existing && existing.plan !== 'free' && !existing.cancelledAt) {
      throw new Error('User already has an active subscription. Cancel first or change plan.');
    }

    if (plan === 'free') {
      const state: UserSubscriptionState = {
        userId,
        plan: 'free',
        startedAt: Date.now(),
        autoRenewing: false,
      };
      this.userSubscriptions.set(userId, state);
      return state;
    }

    const planId = `quant_pro_${plan}`;

    const subscription = await this.subscriptionService.create({
      customerId: userId,
      planId,
      trialDays: 0,
      metadata: { paymentMethod: paymentMethod || 'default' },
    });

    const state: UserSubscriptionState = {
      userId,
      plan,
      subscriptionId: subscription.id,
      startedAt: Date.now(),
      expiresAt: subscription.currentPeriodEnd,
      autoRenewing: true,
    };

    this.userSubscriptions.set(userId, state);
    return state;
  }

  /** Cancel a user's subscription */
  async cancelSubscription(userId: string): Promise<UserSubscriptionState> {
    const state = this.userSubscriptions.get(userId);
    if (!state) {
      throw new Error(`No subscription found for user: ${userId}`);
    }
    if (state.plan === 'free') {
      throw new Error('Cannot cancel free plan');
    }

    if (state.subscriptionId) {
      await this.subscriptionService.cancel(state.subscriptionId, false);
    }

    state.cancelledAt = Date.now();
    state.autoRenewing = false;
    return state;
  }

  /** Get current subscription status for a user */
  async getSubscriptionStatus(userId: string): Promise<UserSubscriptionState> {
    const state = this.userSubscriptions.get(userId);
    if (!state) {
      // Default to free plan
      const freeState: UserSubscriptionState = {
        userId,
        plan: 'free',
        startedAt: Date.now(),
        autoRenewing: false,
      };
      this.userSubscriptions.set(userId, freeState);
      return freeState;
    }
    return state;
  }

  /** Check if a pro feature is enabled for a user */
  async isProFeatureEnabled(userId: string, feature: ProFeature): Promise<boolean> {
    const state = await this.getSubscriptionStatus(userId);

    if (state.plan === 'free') return false;
    if (state.cancelledAt && state.expiresAt && Date.now() > state.expiresAt) return false;

    const planDef = QUANT_PRO_PLANS[state.plan];
    return planDef.features.includes(feature);
  }

  /** Validate an IAP receipt (Apple or Google server-side) */
  async validateIAPReceipt(receipt: IAPReceipt): Promise<IAPValidationResult> {
    ValidateIAPReceiptSchema.parse(receipt);

    if (receipt.platform === 'apple') {
      return this.validateAppleReceipt(receipt);
    } else {
      return this.validateGoogleReceipt(receipt);
    }
  }

  /** Sync an IAP subscription with local state */
  async syncIAPSubscription(userId: string, receipt: IAPReceipt): Promise<UserSubscriptionState> {
    const validation = await this.validateIAPReceipt(receipt);

    if (!validation.valid) {
      throw new Error(`IAP receipt validation failed: ${validation.error || 'Invalid receipt'}`);
    }

    // Determine plan from product ID
    const plan = this.productIdToPlan(receipt.productId);

    const state: UserSubscriptionState = {
      userId,
      plan,
      iapReceipt: receipt,
      startedAt: Date.now(),
      expiresAt: validation.expiresAt,
      autoRenewing: validation.autoRenewing || false,
    };

    this.userSubscriptions.set(userId, state);
    this.validatedReceipts.set(receipt.transactionId, validation);
    return state;
  }

  /** Get plan details */
  getPlanDetails(plan: QuantProPlan): {
    name: string;
    amount: number;
    interval: string;
    features: ProFeature[];
  } {
    return QUANT_PRO_PLANS[plan];
  }

  /** Get all available plans */
  getAllPlans(): Record<
    QuantProPlan,
    { name: string; amount: number; interval: string; features: ProFeature[] }
  > {
    return { ...QUANT_PRO_PLANS };
  }

  // --- Private Helpers ---

  private registerPlans(): void {
    const plans: SubscriptionPlan[] = [
      {
        id: 'quant_pro_free',
        name: 'Quant Free',
        description: 'Free tier with basic features',
        amount: 0,
        currency: 'USD',
        interval: 'monthly',
        intervalCount: 1,
        trialDays: 0,
        features: [],
        limits: {},
        active: true,
        metadata: {},
        createdAt: Date.now(),
      },
      {
        id: 'quant_pro_pro_monthly',
        name: 'Quant Pro Monthly',
        description: 'Full access to all Quant Pro features, billed monthly',
        amount: 9.99,
        currency: 'USD',
        interval: 'monthly',
        intervalCount: 1,
        trialDays: 0,
        features: [
          'unlimited_ai',
          'priority_support',
          'advanced_analytics',
          'custom_themes',
          'ad_free',
          'early_access',
          'premium_content',
          'increased_storage',
        ],
        limits: { ai_requests: 999999, storage_gb: 100 },
        active: true,
        metadata: {},
        createdAt: Date.now(),
      },
      {
        id: 'quant_pro_pro_yearly',
        name: 'Quant Pro Yearly',
        description: 'Full access to all Quant Pro features, billed yearly',
        amount: 99.99,
        currency: 'USD',
        interval: 'yearly',
        intervalCount: 1,
        trialDays: 0,
        features: [
          'unlimited_ai',
          'priority_support',
          'advanced_analytics',
          'custom_themes',
          'ad_free',
          'early_access',
          'premium_content',
          'increased_storage',
        ],
        limits: { ai_requests: 999999, storage_gb: 100 },
        active: true,
        metadata: {},
        createdAt: Date.now(),
      },
    ];

    for (const plan of plans) {
      this.subscriptionService.registerPlan(plan);
    }
  }

  private async validateAppleReceipt(receipt: IAPReceipt): Promise<IAPValidationResult> {
    // Basic well-formedness check (cheap, before any network call).
    if (!receipt.receiptData || receipt.receiptData.length < 10) {
      return {
        valid: false,
        platform: 'apple',
        productId: receipt.productId,
        transactionId: receipt.transactionId,
        error: 'Invalid receipt data',
      };
    }

    // FAIL CLOSED: with no real validator configured we MUST NOT approve.
    if (!this.appleValidator) {
      // eslint-disable-next-line no-console
      console.warn(
        '[quant-pro] Apple IAP validation not configured (APPLE_IAP_SHARED_SECRET) — failing closed',
      );
      return {
        valid: false,
        platform: 'apple',
        productId: receipt.productId,
        transactionId: receipt.transactionId,
        error: 'Apple IAP validation not configured',
      };
    }

    return this.appleValidator.validate(receipt);
  }

  private async validateGoogleReceipt(receipt: IAPReceipt): Promise<IAPValidationResult> {
    if (!receipt.receiptData || receipt.receiptData.length < 10) {
      return {
        valid: false,
        platform: 'google',
        productId: receipt.productId,
        transactionId: receipt.transactionId,
        error: 'Invalid receipt data',
      };
    }

    // FAIL CLOSED: with no real validator configured we MUST NOT approve.
    if (!this.googleValidator) {
      // eslint-disable-next-line no-console
      console.warn(
        '[quant-pro] Google Play IAP validation not configured (GOOGLE_PLAY_PACKAGE_NAME/GOOGLE_PLAY_ACCESS_TOKEN) — failing closed',
      );
      return {
        valid: false,
        platform: 'google',
        productId: receipt.productId,
        transactionId: receipt.transactionId,
        error: 'Google IAP validation not configured',
      };
    }

    return this.googleValidator.validate(receipt);
  }

  private productIdToPlan(productId: string): QuantProPlan {
    if (productId.includes('yearly') || productId.includes('annual')) {
      return 'pro_yearly';
    }
    if (productId.includes('monthly') || productId.includes('pro')) {
      return 'pro_monthly';
    }
    return 'free';
  }
}
