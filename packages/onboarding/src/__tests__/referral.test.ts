import { describe, expect, it } from 'vitest';
import { createReferralProgram, getRewardTiers } from '../referral.js';

describe('Referral Program', () => {
  describe('referral code generation', () => {
    it('creates a program with a referral code', () => {
      const program = createReferralProgram('user-1');
      const code = program.getReferralCode();

      expect(code).toBeTruthy();
      expect(code.includes('-')).toBe(true);
    });

    it('generates unique codes for different users', () => {
      const program1 = createReferralProgram('user-a');
      const program2 = createReferralProgram('user-b');

      expect(program1.getReferralCode()).not.toBe(program2.getReferralCode());
    });

    it('code starts with first 4 chars of userId uppercased', () => {
      const program = createReferralProgram('testuser');
      const code = program.getReferralCode();
      expect(code.startsWith('TEST')).toBe(true);
    });
  });

  describe('reward tiers', () => {
    it('starts at no tier', () => {
      const program = createReferralProgram('user-2');
      expect(program.getCurrentTier()).toBe('none');
      expect(program.getReferralsCount()).toBe(0);
    });

    it('advances to bronze at 3 referrals', () => {
      const program = createReferralProgram('user-3');
      for (let i = 0; i < 3; i++) {
        program.processReferral(`user${i}@valid.com`, 30, true);
      }
      expect(program.getCurrentTier()).toBe('bronze');
    });

    it('advances to silver at 10 referrals', () => {
      const program = createReferralProgram('user-4');
      for (let i = 0; i < 10; i++) {
        program.processReferral(`user${i}@valid.com`, 30, true);
      }
      expect(program.getCurrentTier()).toBe('silver');
    });

    it('advances to gold at 25 referrals', () => {
      const program = createReferralProgram('user-5');
      for (let i = 0; i < 25; i++) {
        program.processReferral(`user${i}@valid.com`, 30, true);
      }
      expect(program.getCurrentTier()).toBe('gold');
    });

    it('advances to platinum at 50 referrals', () => {
      const program = createReferralProgram('user-6');
      for (let i = 0; i < 50; i++) {
        program.processReferral(`user${i}@valid.com`, 30, true);
      }
      expect(program.getCurrentTier()).toBe('platinum');
    });

    it('returns reward tiers info', () => {
      const tiers = getRewardTiers();
      expect(tiers).toHaveLength(4);
      expect(tiers[0]!.tier).toBe('bronze');
      expect(tiers[3]!.tier).toBe('platinum');
    });

    it('shows next tier progress', () => {
      const program = createReferralProgram('user-7');
      program.processReferral('user0@valid.com', 30, true);

      const progress = program.getNextTierProgress();
      expect(progress).not.toBeNull();
      expect(progress!.nextTier).toBe('bronze');
      expect(progress!.referralsNeeded).toBe(2);
      expect(progress!.current).toBe(1);
    });

    it('claims available rewards', () => {
      const program = createReferralProgram('user-8');
      for (let i = 0; i < 3; i++) {
        program.processReferral(`user${i}@valid.com`, 30, true);
      }

      const available = program.getAvailableRewards();
      expect(available.length).toBe(1);
      expect(available[0]!.tier).toBe('bronze');

      const claimed = program.claimReward('bronze');
      expect(claimed).toBe(true);

      const afterClaim = program.getAvailableRewards();
      expect(afterClaim.length).toBe(0);
    });
  });

  describe('anti-fraud checks', () => {
    it('rejects blocked email domains', () => {
      const program = createReferralProgram('user-9');
      const result = program.processReferral('test@tempmail.com', 30, true);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('blocked_domain');
    });

    it('rejects unverified emails', () => {
      const program = createReferralProgram('user-10');
      const result = program.processReferral('test@valid.com', 30, false);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('email_not_verified');
    });

    it('rejects accounts that are too new', () => {
      const program = createReferralProgram('user-11');
      const result = program.processReferral('test@valid.com', 2, true);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('account_too_new');
    });

    it('enforces daily referral limit', () => {
      const program = createReferralProgram('user-12');
      // Default limit is 50, verify it exists in config
      const config = program.getConfig();
      const limit = config.antifraud.maxReferralsPerDay;
      expect(limit).toBe(50);

      // Process up to the limit
      for (let i = 0; i < limit; i++) {
        const result = program.processReferral(`user${i}@valid.com`, 30, true);
        expect(result.success).toBe(true);
      }

      const result = program.processReferral('extra@valid.com', 30, true);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('daily_limit_reached');
    });

    it('accepts valid referrals', () => {
      const program = createReferralProgram('user-13');
      const result = program.processReferral('valid@example.com', 30, true);
      expect(result.success).toBe(true);
      expect(program.getReferralsCount()).toBe(1);
    });
  });
});
