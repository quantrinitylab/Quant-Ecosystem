// ============================================================================
// Payments - Creator Subscription Service
// Per-creator subscription tiers for fan monetization
// ============================================================================

import { z } from 'zod';
import type { CreatorSubscriptionTier, CreatorSubscription } from '../types';

export const CreateTierSchema = z.object({
  creatorId: z.string().min(1),
  name: z.string().min(1),
  priceMonthly: z.number().positive(),
  benefits: z.array(z.string().min(1)).min(1),
});

export const UpdateTierSchema = z.object({
  tierId: z.string().min(1),
  name: z.string().min(1).optional(),
  priceMonthly: z.number().positive().optional(),
  benefits: z.array(z.string().min(1)).min(1).optional(),
});

export const SubscribeSchema = z.object({
  fanId: z.string().min(1),
  creatorId: z.string().min(1),
  tierId: z.string().min(1),
});

/**
 * CreatorSubscriptionService - Per-creator subscription tiers
 *
 * Allows creators to define tiers with benefits and pricing.
 * Fans can subscribe/cancel subscriptions to creator tiers.
 */
export class CreatorSubscriptionService {
  private readonly tiers: Map<string, CreatorSubscriptionTier> = new Map();
  private readonly subscriptions: Map<string, CreatorSubscription> = new Map();

  /**
   * Create a new subscription tier for a creator
   */
  createTier(params: {
    creatorId: string;
    name: string;
    priceMonthly: number;
    benefits: string[];
  }): CreatorSubscriptionTier {
    const validated = CreateTierSchema.parse(params);

    const tier: CreatorSubscriptionTier = {
      id: `tier_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      creatorId: validated.creatorId,
      name: validated.name,
      priceMonthly: validated.priceMonthly,
      benefits: validated.benefits,
      subscriberCount: 0,
      active: true,
      createdAt: Date.now(),
    };

    this.tiers.set(tier.id, tier);
    return tier;
  }

  /**
   * Update an existing subscription tier
   */
  updateTier(params: {
    tierId: string;
    name?: string;
    priceMonthly?: number;
    benefits?: string[];
  }): CreatorSubscriptionTier {
    const validated = UpdateTierSchema.parse(params);
    const tier = this.tiers.get(validated.tierId);
    if (!tier) throw new Error(`Tier not found: ${validated.tierId}`);

    if (validated.name !== undefined) tier.name = validated.name;
    if (validated.priceMonthly !== undefined) tier.priceMonthly = validated.priceMonthly;
    if (validated.benefits !== undefined) tier.benefits = validated.benefits;

    return tier;
  }

  /**
   * Delete (deactivate) a subscription tier
   */
  deleteTier(tierId: string): void {
    const tier = this.tiers.get(tierId);
    if (!tier) throw new Error(`Tier not found: ${tierId}`);
    tier.active = false;
  }

  /**
   * Subscribe a fan to a creator's tier
   */
  subscribe(params: { fanId: string; creatorId: string; tierId: string }): CreatorSubscription {
    const validated = SubscribeSchema.parse(params);
    const tier = this.tiers.get(validated.tierId);
    if (!tier) throw new Error(`Tier not found: ${validated.tierId}`);
    if (!tier.active) throw new Error('Tier is not active');
    if (tier.creatorId !== validated.creatorId)
      throw new Error('Tier does not belong to this creator');

    // Check if already subscribed
    for (const [, sub] of this.subscriptions) {
      if (
        sub.fanId === validated.fanId &&
        sub.tierId === validated.tierId &&
        sub.status === 'active'
      ) {
        throw new Error('Already subscribed to this tier');
      }
    }

    const subscription: CreatorSubscription = {
      id: `sub_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      fanId: validated.fanId,
      creatorId: validated.creatorId,
      tierId: validated.tierId,
      status: 'active',
      startedAt: Date.now(),
    };

    this.subscriptions.set(subscription.id, subscription);
    tier.subscriberCount += 1;
    return subscription;
  }

  /**
   * Cancel a subscription
   */
  cancelSubscription(subscriptionId: string): CreatorSubscription {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Subscription not found: ${subscriptionId}`);
    if (sub.status === 'cancelled') throw new Error('Subscription is already cancelled');

    sub.status = 'cancelled';
    sub.cancelledAt = Date.now();

    const tier = this.tiers.get(sub.tierId);
    if (tier) {
      tier.subscriberCount = Math.max(0, tier.subscriberCount - 1);
    }

    return sub;
  }

  /**
   * Get all subscribers for a creator
   */
  getSubscribers(creatorId: string): CreatorSubscription[] {
    const results: CreatorSubscription[] = [];
    for (const [, sub] of this.subscriptions) {
      if (sub.creatorId === creatorId && sub.status === 'active') {
        results.push(sub);
      }
    }
    return results;
  }

  /**
   * Get all subscriptions for a fan
   */
  getSubscriptions(fanId: string): CreatorSubscription[] {
    const results: CreatorSubscription[] = [];
    for (const [, sub] of this.subscriptions) {
      if (sub.fanId === fanId) {
        results.push(sub);
      }
    }
    return results;
  }
}
