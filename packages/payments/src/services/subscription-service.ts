// ============================================================================
// Payments - Subscription Service
// Full subscription lifecycle with proration calculation
// ============================================================================

import type {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
  BillingInterval,
  CurrencyCode,
} from '../types';

interface SubscriptionServiceConfig {
  defaultTrialDays: number;
  gracePeriodDays: number;
  maxPlanChangesPerMonth: number;
  prorateUpgrades: boolean;
  prorateDowngrades: boolean;
}

const DEFAULT_CONFIG: SubscriptionServiceConfig = {
  defaultTrialDays: 14,
  gracePeriodDays: 3,
  maxPlanChangesPerMonth: 5,
  prorateUpgrades: true,
  prorateDowngrades: true,
};

/**
 * SubscriptionService - Manages subscription lifecycle
 *
 * Handles creation, upgrades, downgrades, cancellation, pausing,
 * resuming, trial application, and proration calculations for
 * subscription-based billing.
 */
export class SubscriptionService {
  private config: SubscriptionServiceConfig;
  private subscriptions: Map<string, Subscription>;
  private plans: Map<string, SubscriptionPlan>;
  private usageRecords: Map<string, { feature: string; used: number; limit: number }[]>;
  private planChanges: Map<string, { changedAt: number; fromPlan: string; toPlan: string }[]>;

  constructor(config: Partial<SubscriptionServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.subscriptions = new Map();
    this.plans = new Map();
    this.usageRecords = new Map();
    this.planChanges = new Map();
  }

  /** Register a plan in the system */
  registerPlan(plan: SubscriptionPlan): void {
    this.plans.set(plan.id, plan);
  }

  /** Create a new subscription */
  async create(params: {
    customerId: string;
    planId: string;
    quantity?: number;
    trialDays?: number;
    couponCode?: string;
    metadata?: Record<string, string>;
  }): Promise<Subscription> {
    const plan = this.plans.get(params.planId);
    if (!plan) {
      throw new Error(`Plan not found: ${params.planId}`);
    }
    if (!plan.active) {
      throw new Error(`Plan is not active: ${params.planId}`);
    }

    const trialDays = params.trialDays ?? plan.trialDays ?? this.config.defaultTrialDays;
    const now = Date.now();
    const periodDuration = this.getIntervalMs(plan.interval, plan.intervalCount);
    const trialEnd = trialDays > 0 ? now + trialDays * 86400000 : undefined;

    const subscription: Subscription = {
      id: `sub_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      customerId: params.customerId,
      planId: params.planId,
      status: trialDays > 0 ? 'trialing' : 'active',
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd || now + periodDuration,
      trialStart: trialDays > 0 ? now : undefined,
      trialEnd,
      cancelAtPeriodEnd: false,
      quantity: params.quantity || 1,
      metadata: params.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    this.subscriptions.set(subscription.id, subscription);
    this.usageRecords.set(subscription.id, []);
    this.planChanges.set(subscription.id, []);
    return subscription;
  }

  /** Upgrade a subscription to a higher plan */
  async upgrade(
    subscriptionId: string,
    newPlanId: string,
  ): Promise<{ subscription: Subscription; prorationAmount: number }> {
    const subscription = this.getSubscriptionOrThrow(subscriptionId);
    const currentPlan = this.plans.get(subscription.planId);
    const newPlan = this.plans.get(newPlanId);

    if (!currentPlan || !newPlan) {
      throw new Error('Plan not found');
    }
    if (newPlan.amount <= currentPlan.amount) {
      throw new Error('New plan must be higher tier for upgrade. Use downgrade() instead.');
    }
    this.checkPlanChangeLimit(subscriptionId);

    const prorationAmount = this.config.prorateUpgrades
      ? this.calculateProration(subscription, currentPlan, newPlan)
      : 0;

    subscription.planId = newPlanId;
    subscription.updatedAt = Date.now();
    this.recordPlanChange(subscriptionId, currentPlan.id, newPlanId);

    return { subscription, prorationAmount };
  }

  /** Downgrade a subscription to a lower plan */
  async downgrade(
    subscriptionId: string,
    newPlanId: string,
  ): Promise<{ subscription: Subscription; creditAmount: number }> {
    const subscription = this.getSubscriptionOrThrow(subscriptionId);
    const currentPlan = this.plans.get(subscription.planId);
    const newPlan = this.plans.get(newPlanId);

    if (!currentPlan || !newPlan) {
      throw new Error('Plan not found');
    }
    if (newPlan.amount >= currentPlan.amount) {
      throw new Error('New plan must be lower tier for downgrade. Use upgrade() instead.');
    }
    this.checkPlanChangeLimit(subscriptionId);

    const creditAmount = this.config.prorateDowngrades
      ? this.calculateProration(subscription, currentPlan, newPlan)
      : 0;

    subscription.planId = newPlanId;
    subscription.updatedAt = Date.now();
    this.recordPlanChange(subscriptionId, currentPlan.id, newPlanId);

    return { subscription, creditAmount: Math.abs(creditAmount) };
  }

  /** Cancel a subscription */
  async cancel(subscriptionId: string, immediately: boolean = false): Promise<Subscription> {
    const subscription = this.getSubscriptionOrThrow(subscriptionId);

    if (immediately) {
      subscription.status = 'cancelled';
      subscription.cancelledAt = Date.now();
    } else {
      subscription.cancelAtPeriodEnd = true;
    }
    subscription.updatedAt = Date.now();
    return subscription;
  }

  /** Pause a subscription */
  async pause(subscriptionId: string, resumeDate?: number): Promise<Subscription> {
    const subscription = this.getSubscriptionOrThrow(subscriptionId);

    if (subscription.status !== 'active') {
      throw new Error(`Cannot pause subscription with status: ${subscription.status}`);
    }

    subscription.status = 'paused';
    subscription.pausedAt = Date.now();
    subscription.resumeAt = resumeDate;
    subscription.updatedAt = Date.now();
    return subscription;
  }

  /** Resume a paused subscription */
  async resume(subscriptionId: string): Promise<Subscription> {
    const subscription = this.getSubscriptionOrThrow(subscriptionId);

    if (subscription.status !== 'paused') {
      throw new Error(`Cannot resume subscription with status: ${subscription.status}`);
    }

    const plan = this.plans.get(subscription.planId)!;
    const periodDuration = this.getIntervalMs(plan.interval, plan.intervalCount);
    const now = Date.now();

    subscription.status = 'active';
    subscription.pausedAt = undefined;
    subscription.resumeAt = undefined;
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = now + periodDuration;
    subscription.updatedAt = now;
    return subscription;
  }

  /** Apply a trial period to an existing subscription */
  async applyTrial(subscriptionId: string, trialDays: number): Promise<Subscription> {
    const subscription = this.getSubscriptionOrThrow(subscriptionId);

    if (subscription.trialEnd) {
      throw new Error('Subscription already has a trial applied');
    }

    const now = Date.now();
    subscription.status = 'trialing';
    subscription.trialStart = now;
    subscription.trialEnd = now + trialDays * 86400000;
    subscription.currentPeriodEnd = subscription.trialEnd;
    subscription.updatedAt = now;
    return subscription;
  }

  /** Check current subscription status with period validation */
  async checkStatus(
    subscriptionId: string,
  ): Promise<{ status: SubscriptionStatus; daysRemaining: number; isInGracePeriod: boolean }> {
    const subscription = this.getSubscriptionOrThrow(subscriptionId);
    const now = Date.now();
    const msRemaining = subscription.currentPeriodEnd - now;
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / 86400000));

    let isInGracePeriod = false;
    if (msRemaining < 0) {
      const gracePeriodMs = this.config.gracePeriodDays * 86400000;
      isInGracePeriod = Math.abs(msRemaining) <= gracePeriodMs;
      if (!isInGracePeriod && subscription.status === 'active') {
        subscription.status = 'past_due';
        subscription.updatedAt = now;
      }
    }

    return { status: subscription.status, daysRemaining, isInGracePeriod };
  }

  /** Get usage for a subscription */
  async getUsage(
    subscriptionId: string,
  ): Promise<{ feature: string; used: number; limit: number; percentage: number }[]> {
    this.getSubscriptionOrThrow(subscriptionId);
    const records = this.usageRecords.get(subscriptionId) || [];
    return records.map((r) => ({
      ...r,
      percentage: r.limit > 0 ? Math.round((r.used / r.limit) * 100) : 0,
    }));
  }

  /** Renew a subscription for the next period */
  async renewSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = this.getSubscriptionOrThrow(subscriptionId);
    const plan = this.plans.get(subscription.planId)!;

    if (subscription.cancelAtPeriodEnd) {
      subscription.status = 'cancelled';
      subscription.cancelledAt = Date.now();
      subscription.updatedAt = Date.now();
      return subscription;
    }

    const periodDuration = this.getIntervalMs(plan.interval, plan.intervalCount);
    subscription.currentPeriodStart = subscription.currentPeriodEnd;
    subscription.currentPeriodEnd = subscription.currentPeriodStart + periodDuration;

    if (subscription.status === 'trialing') {
      subscription.status = 'active';
    }
    subscription.updatedAt = Date.now();
    return subscription;
  }

  /** Calculate proration for a plan change */
  calculateProration(
    subscription: Subscription,
    fromPlan: SubscriptionPlan,
    toPlan: SubscriptionPlan,
  ): number {
    const now = Date.now();
    const periodTotal = subscription.currentPeriodEnd - subscription.currentPeriodStart;
    const periodUsed = now - subscription.currentPeriodStart;
    const remainingRatio = Math.max(0, 1 - periodUsed / periodTotal);

    const currentRemaining = fromPlan.amount * remainingRatio * subscription.quantity;
    const newRemaining = toPlan.amount * remainingRatio * subscription.quantity;

    return Math.round((newRemaining - currentRemaining) * 100) / 100;
  }

  /** Get upcoming invoice preview */
  async getUpcomingInvoice(subscriptionId: string): Promise<{
    amount: number;
    currency: CurrencyCode;
    dueDate: number;
    lineItems: { description: string; amount: number }[];
  }> {
    const subscription = this.getSubscriptionOrThrow(subscriptionId);
    const plan = this.plans.get(subscription.planId)!;
    const amount = plan.amount * subscription.quantity;

    return {
      amount,
      currency: plan.currency,
      dueDate: subscription.currentPeriodEnd,
      lineItems: [
        {
          description: `${plan.name} x ${subscription.quantity}`,
          amount,
        },
      ],
    };
  }

  /** Record usage for a feature */
  async recordUsage(subscriptionId: string, feature: string, quantity: number): Promise<void> {
    this.getSubscriptionOrThrow(subscriptionId);
    const records = this.usageRecords.get(subscriptionId) || [];
    const existing = records.find((r) => r.feature === feature);
    if (existing) {
      existing.used += quantity;
    } else {
      const plan = this.plans.get(this.subscriptions.get(subscriptionId)!.planId)!;
      records.push({ feature, used: quantity, limit: plan.limits[feature] || 0 });
    }
    this.usageRecords.set(subscriptionId, records);
  }

  // --- Private Helpers ---

  private getSubscriptionOrThrow(id: string): Subscription {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new Error(`Subscription not found: ${id}`);
    return sub;
  }

  private getIntervalMs(interval: BillingInterval, count: number): number {
    const intervals: Record<BillingInterval, number> = {
      daily: 86400000,
      weekly: 604800000,
      monthly: 2592000000,
      quarterly: 7776000000,
      yearly: 31536000000,
    };
    return intervals[interval] * count;
  }

  private checkPlanChangeLimit(subscriptionId: string): void {
    const changes = this.planChanges.get(subscriptionId) || [];
    const monthAgo = Date.now() - 2592000000;
    const recentChanges = changes.filter((c) => c.changedAt > monthAgo);
    if (recentChanges.length >= this.config.maxPlanChangesPerMonth) {
      throw new Error('Maximum plan changes per month exceeded');
    }
  }

  private recordPlanChange(subscriptionId: string, fromPlan: string, toPlan: string): void {
    const changes = this.planChanges.get(subscriptionId) || [];
    changes.push({ changedAt: Date.now(), fromPlan, toPlan });
    this.planChanges.set(subscriptionId, changes);
  }
}
