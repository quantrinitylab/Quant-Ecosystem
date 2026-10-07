import type { SubscriptionTier } from '../types.js';
import type { SubscriptionManager } from './subscription-manager.js';

const TIER_FEATURES: Record<SubscriptionTier, string[]> = {
  Free: ['basic_feed', 'basic_messaging', 'basic_profile'],
  Pro: [
    'basic_feed',
    'basic_messaging',
    'basic_profile',
    'boost',
    'premium_themes',
    'no_ads',
    'priority_support_lite',
  ],
  ProPlus: [
    'basic_feed',
    'basic_messaging',
    'basic_profile',
    'boost',
    'premium_themes',
    'no_ads',
    'priority_support',
    'exclusive_items',
    'early_access',
  ],
  Family: [
    'basic_feed',
    'basic_messaging',
    'basic_profile',
    'boost',
    'premium_themes',
    'no_ads',
    'priority_support',
    'exclusive_items',
    'early_access',
    'family_sharing',
  ],
};

export class EntitlementService {
  private subscriptionManager: SubscriptionManager;

  constructor(subscriptionManager: SubscriptionManager) {
    this.subscriptionManager = subscriptionManager;
  }

  checkEntitlement(userId: string, feature: string): boolean {
    let tier = this.subscriptionManager.getCurrentTier(userId);

    // If user is Free tier, check if they are a family member of another user
    if (tier === 'Free' && this.subscriptionManager.isFamilyMember(userId)) {
      tier = 'Family';
    }

    const features = TIER_FEATURES[tier];
    return features.includes(feature);
  }

  getEntitlements(userId: string): string[] {
    let tier = this.subscriptionManager.getCurrentTier(userId);

    if (tier === 'Free' && this.subscriptionManager.isFamilyMember(userId)) {
      tier = 'Family';
    }

    return [...TIER_FEATURES[tier]];
  }

  getFeaturesByTier(tier: SubscriptionTier): string[] {
    return [...TIER_FEATURES[tier]];
  }
}
