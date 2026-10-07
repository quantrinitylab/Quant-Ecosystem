import type { CreatorTier, TierBenefits } from '../types.js';

const TIER_BENEFITS: Record<CreatorTier, TierBenefits> = {
  free: {
    tier: 'free',
    revenueShare: 0.5,
    maxPayoutPerMonth: 500,
    brandPartnerships: false,
    prioritySupport: false,
    customBranding: false,
  },
  starter: {
    tier: 'starter',
    revenueShare: 0.6,
    maxPayoutPerMonth: 2000,
    brandPartnerships: false,
    prioritySupport: false,
    customBranding: false,
  },
  pro: {
    tier: 'pro',
    revenueShare: 0.75,
    maxPayoutPerMonth: 10000,
    brandPartnerships: true,
    prioritySupport: true,
    customBranding: true,
  },
  enterprise: {
    tier: 'enterprise',
    revenueShare: 0.85,
    maxPayoutPerMonth: 100000,
    brandPartnerships: true,
    prioritySupport: true,
    customBranding: true,
  },
};

const TIER_ORDER: CreatorTier[] = ['free', 'starter', 'pro', 'enterprise'];

const TIER_THRESHOLDS: Record<CreatorTier, number> = {
  free: 0,
  starter: 100,
  pro: 1000,
  enterprise: 10000,
};

export class TierService {
  private tiers = new Map<string, CreatorTier>();
  private earnings = new Map<string, number>();

  getTier(creatorId: string): CreatorTier {
    return this.tiers.get(creatorId) ?? 'free';
  }

  upgradeTier(creatorId: string, newTier: CreatorTier): CreatorTier {
    const currentTier = this.getTier(creatorId);
    const currentIndex = TIER_ORDER.indexOf(currentTier);
    const newIndex = TIER_ORDER.indexOf(newTier);

    if (newIndex <= currentIndex) {
      throw new Error(`Cannot upgrade from ${currentTier} to ${newTier}`);
    }

    if (!this.checkEligibility(creatorId, newTier)) {
      throw new Error(`Creator ${creatorId} is not eligible for tier ${newTier}`);
    }

    this.tiers.set(creatorId, newTier);
    return newTier;
  }

  downgradeTier(creatorId: string): CreatorTier {
    const currentTier = this.getTier(creatorId);
    const currentIndex = TIER_ORDER.indexOf(currentTier);

    if (currentIndex === 0) {
      return currentTier;
    }

    const newTier = TIER_ORDER[currentIndex - 1]!;
    this.tiers.set(creatorId, newTier);
    return newTier;
  }

  getTierBenefits(tier: CreatorTier): TierBenefits {
    return TIER_BENEFITS[tier];
  }

  checkEligibility(creatorId: string, tier: CreatorTier): boolean {
    const totalEarnings = this.earnings.get(creatorId) ?? 0;
    return totalEarnings >= TIER_THRESHOLDS[tier];
  }

  setEarnings(creatorId: string, amount: number): void {
    this.earnings.set(creatorId, amount);
  }

  setTier(creatorId: string, tier: CreatorTier): void {
    this.tiers.set(creatorId, tier);
  }
}
