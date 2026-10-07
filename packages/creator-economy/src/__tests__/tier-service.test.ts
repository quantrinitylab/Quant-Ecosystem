import { describe, it, expect, beforeEach } from 'vitest';
import { TierService } from '../tiers/tier-service.js';

describe('TierService', () => {
  let service: TierService;

  beforeEach(() => {
    service = new TierService();
  });

  describe('getTier', () => {
    it('returns free tier for new creator', () => {
      expect(service.getTier('creator-1')).toBe('free');
    });

    it('returns assigned tier', () => {
      service.setTier('creator-1', 'pro');
      expect(service.getTier('creator-1')).toBe('pro');
    });
  });

  describe('upgradeTier', () => {
    it('upgrades from free to starter when eligible', () => {
      service.setEarnings('creator-1', 200);
      const newTier = service.upgradeTier('creator-1', 'starter');
      expect(newTier).toBe('starter');
      expect(service.getTier('creator-1')).toBe('starter');
    });

    it('throws when upgrading to lower tier', () => {
      service.setTier('creator-1', 'pro');
      expect(() => service.upgradeTier('creator-1', 'starter')).toThrow(
        'Cannot upgrade from pro to starter',
      );
    });

    it('throws when not eligible', () => {
      service.setEarnings('creator-1', 50);
      expect(() => service.upgradeTier('creator-1', 'starter')).toThrow('not eligible');
    });

    it('upgrades to enterprise with sufficient earnings', () => {
      service.setEarnings('creator-1', 15000);
      service.upgradeTier('creator-1', 'enterprise');
      expect(service.getTier('creator-1')).toBe('enterprise');
    });
  });

  describe('downgradeTier', () => {
    it('downgrades by one level', () => {
      service.setTier('creator-1', 'pro');
      const newTier = service.downgradeTier('creator-1');
      expect(newTier).toBe('starter');
    });

    it('stays at free tier if already lowest', () => {
      const newTier = service.downgradeTier('creator-1');
      expect(newTier).toBe('free');
    });
  });

  describe('checkEligibility', () => {
    it('returns true when earnings meet threshold', () => {
      service.setEarnings('creator-1', 1500);
      expect(service.checkEligibility('creator-1', 'pro')).toBe(true);
    });

    it('returns false when earnings below threshold', () => {
      service.setEarnings('creator-1', 50);
      expect(service.checkEligibility('creator-1', 'pro')).toBe(false);
    });

    it('everyone is eligible for free tier', () => {
      expect(service.checkEligibility('creator-1', 'free')).toBe(true);
    });
  });

  describe('getTierBenefits', () => {
    it('returns benefits for pro tier', () => {
      const benefits = service.getTierBenefits('pro');
      expect(benefits.revenueShare).toBe(0.75);
      expect(benefits.brandPartnerships).toBe(true);
      expect(benefits.prioritySupport).toBe(true);
    });

    it('returns benefits for free tier', () => {
      const benefits = service.getTierBenefits('free');
      expect(benefits.revenueShare).toBe(0.5);
      expect(benefits.brandPartnerships).toBe(false);
    });
  });
});
