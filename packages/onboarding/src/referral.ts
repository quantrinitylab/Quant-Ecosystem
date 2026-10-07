import type { ReferralConfig, ReferralReward } from './types.js';

const REWARD_TIERS: ReferralReward[] = [
  { tier: 'bronze', requiredReferrals: 3, description: '1 month free premium', claimed: false },
  {
    tier: 'silver',
    requiredReferrals: 10,
    description: '3 months free premium + priority support',
    claimed: false,
  },
  {
    tier: 'gold',
    requiredReferrals: 25,
    description: '6 months free premium + early access',
    claimed: false,
  },
  {
    tier: 'platinum',
    requiredReferrals: 50,
    description: '1 year free premium + exclusive features',
    claimed: false,
  },
];

const DEFAULT_ANTIFRAUD = {
  maxReferralsPerDay: 50,
  requireVerifiedEmail: true,
  minimumAccountAge: 7,
  blockedDomains: ['tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com'],
};

export class ReferralProgram {
  private config: ReferralConfig;
  private dailyReferrals: Map<string, number> = new Map();

  constructor(userId: string) {
    this.config = {
      userId,
      referralCode: this.generateReferralCode(userId),
      referralsCount: 0,
      rewardTier: 'none',
      rewards: REWARD_TIERS.map((r) => ({ ...r })),
      antifraud: { ...DEFAULT_ANTIFRAUD },
    };
  }

  private generateReferralCode(userId: string): string {
    const prefix = userId.slice(0, 4).toUpperCase();
    const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${suffix}`;
  }

  getReferralCode(): string {
    return this.config.referralCode;
  }

  getConfig(): ReferralConfig {
    return { ...this.config };
  }

  processReferral(
    referredEmail: string,
    referredAccountAge: number,
    emailVerified: boolean,
  ): {
    success: boolean;
    reason?: string;
  } {
    // Anti-fraud checks
    const domain = referredEmail.split('@')[1];
    if (domain && this.config.antifraud.blockedDomains.includes(domain)) {
      return { success: false, reason: 'blocked_domain' };
    }

    if (this.config.antifraud.requireVerifiedEmail && !emailVerified) {
      return { success: false, reason: 'email_not_verified' };
    }

    if (referredAccountAge < this.config.antifraud.minimumAccountAge) {
      return { success: false, reason: 'account_too_new' };
    }

    // Check daily limit
    const today = new Date().toISOString().split('T')[0]!;
    const todayCount = this.dailyReferrals.get(today) ?? 0;
    if (todayCount >= this.config.antifraud.maxReferralsPerDay) {
      return { success: false, reason: 'daily_limit_reached' };
    }

    // Process the referral
    this.config.referralsCount += 1;
    this.dailyReferrals.set(today, todayCount + 1);
    this.updateRewardTier();

    return { success: true };
  }

  private updateRewardTier(): void {
    const count = this.config.referralsCount;
    if (count >= 50) {
      this.config.rewardTier = 'platinum';
    } else if (count >= 25) {
      this.config.rewardTier = 'gold';
    } else if (count >= 10) {
      this.config.rewardTier = 'silver';
    } else if (count >= 3) {
      this.config.rewardTier = 'bronze';
    } else {
      this.config.rewardTier = 'none';
    }
  }

  getCurrentTier(): ReferralConfig['rewardTier'] {
    return this.config.rewardTier;
  }

  getReferralsCount(): number {
    return this.config.referralsCount;
  }

  getAvailableRewards(): ReferralReward[] {
    return this.config.rewards.filter(
      (r) => r.requiredReferrals <= this.config.referralsCount && !r.claimed,
    );
  }

  claimReward(tier: ReferralConfig['rewardTier']): boolean {
    const reward = this.config.rewards.find(
      (r) => r.tier === tier && r.requiredReferrals <= this.config.referralsCount && !r.claimed,
    );
    if (reward) {
      reward.claimed = true;
      return true;
    }
    return false;
  }

  getNextTierProgress(): { nextTier: string; referralsNeeded: number; current: number } | null {
    const nextReward = this.config.rewards.find(
      (r) => r.requiredReferrals > this.config.referralsCount,
    );
    if (!nextReward) return null;
    return {
      nextTier: nextReward.tier,
      referralsNeeded: nextReward.requiredReferrals - this.config.referralsCount,
      current: this.config.referralsCount,
    };
  }
}

export function createReferralProgram(userId: string): ReferralProgram {
  return new ReferralProgram(userId);
}

export function getRewardTiers(): ReferralReward[] {
  return REWARD_TIERS.map((r) => ({ ...r }));
}
