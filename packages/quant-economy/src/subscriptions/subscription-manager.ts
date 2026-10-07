import type { Subscription, SubscriptionTier } from '../types.js';

const TIER_ORDER: SubscriptionTier[] = ['Free', 'Pro', 'ProPlus', 'Family'];

export class SubscriptionManager {
  private subscriptions = new Map<string, Subscription>();

  subscribe(userId: string, tier: SubscriptionTier): Subscription {
    const subscription: Subscription = {
      userId,
      tier,
      startDate: new Date(),
      active: true,
      familyMembers: tier === 'Family' ? [userId] : undefined,
    };
    this.subscriptions.set(userId, subscription);
    return subscription;
  }

  upgrade(
    userId: string,
    newTier: SubscriptionTier,
  ): { success: boolean; subscription?: Subscription; message?: string } {
    const current = this.subscriptions.get(userId);
    if (!current || !current.active) {
      return { success: false, message: 'No active subscription' };
    }

    const currentIdx = TIER_ORDER.indexOf(current.tier);
    const newIdx = TIER_ORDER.indexOf(newTier);
    if (newIdx <= currentIdx) {
      return { success: false, message: 'New tier must be higher than current' };
    }

    current.tier = newTier;
    if (newTier === 'Family' && !current.familyMembers) {
      current.familyMembers = [userId];
    }
    return { success: true, subscription: current };
  }

  downgrade(
    userId: string,
    newTier: SubscriptionTier,
  ): { success: boolean; subscription?: Subscription; message?: string } {
    const current = this.subscriptions.get(userId);
    if (!current || !current.active) {
      return { success: false, message: 'No active subscription' };
    }

    const currentIdx = TIER_ORDER.indexOf(current.tier);
    const newIdx = TIER_ORDER.indexOf(newTier);
    if (newIdx >= currentIdx) {
      return { success: false, message: 'New tier must be lower than current' };
    }

    current.tier = newTier;
    if (newTier !== 'Family') {
      current.familyMembers = undefined;
    }
    return { success: true, subscription: current };
  }

  cancel(userId: string): boolean {
    const current = this.subscriptions.get(userId);
    if (!current) return false;
    current.active = false;
    current.tier = 'Free';
    return true;
  }

  getCurrentTier(userId: string): SubscriptionTier {
    const sub = this.subscriptions.get(userId);
    if (!sub || !sub.active) return 'Free';
    return sub.tier;
  }

  getSubscription(userId: string): Subscription | undefined {
    return this.subscriptions.get(userId);
  }

  addFamilyMember(ownerId: string, memberId: string): { success: boolean; message?: string } {
    const sub = this.subscriptions.get(ownerId);
    if (!sub || sub.tier !== 'Family' || !sub.active) {
      return { success: false, message: 'Not a Family subscription' };
    }
    if (!sub.familyMembers) sub.familyMembers = [ownerId];
    // Cap is 6 total members including the owner (owner + 5 additional members)
    if (sub.familyMembers.length >= 6) {
      return { success: false, message: 'Family plan limited to 6 members' };
    }
    sub.familyMembers.push(memberId);
    return { success: true };
  }

  isFamilyMember(userId: string): boolean {
    for (const sub of this.subscriptions.values()) {
      if (sub.tier === 'Family' && sub.active && sub.familyMembers?.includes(userId)) {
        return true;
      }
    }
    return false;
  }
}
