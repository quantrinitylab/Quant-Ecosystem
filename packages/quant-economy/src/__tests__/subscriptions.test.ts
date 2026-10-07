import { describe, it, expect, beforeEach } from 'vitest';
import { SubscriptionManager } from '../subscriptions/subscription-manager.js';
import { EntitlementService } from '../subscriptions/entitlements.js';

describe('Subscriptions', () => {
  let subManager: SubscriptionManager;
  let entitlementService: EntitlementService;

  beforeEach(() => {
    subManager = new SubscriptionManager();
    entitlementService = new EntitlementService(subManager);
  });

  describe('SubscriptionManager', () => {
    it('should subscribe a user to a tier', () => {
      const sub = subManager.subscribe('user-1', 'Pro');
      expect(sub.tier).toBe('Pro');
      expect(sub.active).toBe(true);
    });

    it('should upgrade tier', () => {
      subManager.subscribe('user-1', 'Pro');
      const result = subManager.upgrade('user-1', 'ProPlus');
      expect(result.success).toBe(true);
      expect(result.subscription?.tier).toBe('ProPlus');
    });

    it('should reject downgrade to higher tier', () => {
      subManager.subscribe('user-1', 'Pro');
      const result = subManager.downgrade('user-1', 'ProPlus');
      expect(result.success).toBe(false);
    });

    it('should cancel subscription', () => {
      subManager.subscribe('user-1', 'Pro');
      const cancelled = subManager.cancel('user-1');
      expect(cancelled).toBe(true);
      expect(subManager.getCurrentTier('user-1')).toBe('Free');
    });

    it('should support Family plan with members', () => {
      subManager.subscribe('owner', 'Family');
      subManager.addFamilyMember('owner', 'member-1');
      subManager.addFamilyMember('owner', 'member-2');
      expect(subManager.isFamilyMember('member-1')).toBe(true);
      expect(subManager.isFamilyMember('member-2')).toBe(true);
    });

    it('should limit Family plan to 6 total members (including owner)', () => {
      subManager.subscribe('owner', 'Family');
      for (let i = 1; i <= 5; i++) {
        subManager.addFamilyMember('owner', `member-${i}`);
      }
      const result = subManager.addFamilyMember('owner', 'member-6');
      expect(result.success).toBe(false);
      expect(result.message).toContain('limited to 6');
    });
  });

  describe('EntitlementService', () => {
    it('should grant Pro features to Pro user', () => {
      subManager.subscribe('user-1', 'Pro');
      expect(entitlementService.checkEntitlement('user-1', 'boost')).toBe(true);
      expect(entitlementService.checkEntitlement('user-1', 'premium_themes')).toBe(true);
      expect(entitlementService.checkEntitlement('user-1', 'no_ads')).toBe(true);
    });

    it('should deny Pro features to Free user', () => {
      subManager.subscribe('user-1', 'Free');
      expect(entitlementService.checkEntitlement('user-1', 'boost')).toBe(false);
      expect(entitlementService.checkEntitlement('user-1', 'premium_themes')).toBe(false);
    });

    it('should grant Family features to family members', () => {
      subManager.subscribe('owner', 'Family');
      subManager.addFamilyMember('owner', 'member-1');
      // member-1 gets Family tier entitlements
      expect(entitlementService.checkEntitlement('member-1', 'boost')).toBe(true);
      expect(entitlementService.checkEntitlement('member-1', 'family_sharing')).toBe(true);
    });

    it('should return full entitlement list for tier', () => {
      subManager.subscribe('user-1', 'ProPlus');
      const entitlements = entitlementService.getEntitlements('user-1');
      expect(entitlements).toContain('exclusive_items');
      expect(entitlements).toContain('early_access');
      expect(entitlements).toContain('boost');
    });

    it('should handle user without subscription as Free', () => {
      expect(entitlementService.checkEntitlement('new-user', 'basic_feed')).toBe(true);
      expect(entitlementService.checkEntitlement('new-user', 'boost')).toBe(false);
    });
  });
});
