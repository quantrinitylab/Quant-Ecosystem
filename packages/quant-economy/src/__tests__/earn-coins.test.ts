import { describe, it, expect, beforeEach } from 'vitest';
import { CoinWallet } from '../coins/wallet.js';
import { EarnCoinService } from '../coins/earn-coins.js';

describe('EarnCoinService', () => {
  let wallet: CoinWallet;
  let earnService: EarnCoinService;

  beforeEach(() => {
    wallet = new CoinWallet();
    wallet.createWallet('user-1');
    wallet.createWallet('user-2');
    earnService = new EarnCoinService(wallet, { dailyLoginReward: 10, referralBonus: 50 });
  });

  describe('claimDailyLogin', () => {
    it('should award daily login coins', () => {
      const result = earnService.claimDailyLogin('user-1');
      expect(result.success).toBe(true);
      expect(result.coins).toBe(10);
      expect(wallet.getBalance('user-1')).toBe(10);
    });

    it('should reject double claim on the same day', () => {
      earnService.claimDailyLogin('user-1');
      const result = earnService.claimDailyLogin('user-1');
      expect(result.success).toBe(false);
      expect(result.coins).toBe(0);
      expect(wallet.getBalance('user-1')).toBe(10);
    });

    it('should allow different users to claim on the same day', () => {
      earnService.claimDailyLogin('user-1');
      const result = earnService.claimDailyLogin('user-2');
      expect(result.success).toBe(true);
      expect(result.coins).toBe(10);
    });
  });

  describe('claimReferralBonus', () => {
    it('should award referral bonus to referrer', () => {
      const result = earnService.claimReferralBonus('user-1', 'user-2');
      expect(result.success).toBe(true);
      expect(result.coins).toBe(50);
      expect(wallet.getBalance('user-1')).toBe(50);
    });

    it('should reject duplicate referral pair', () => {
      earnService.claimReferralBonus('user-1', 'user-2');
      const result = earnService.claimReferralBonus('user-1', 'user-2');
      expect(result.success).toBe(false);
      expect(result.coins).toBe(0);
    });

    it('should allow reverse pair as separate referral', () => {
      earnService.claimReferralBonus('user-1', 'user-2');
      const result = earnService.claimReferralBonus('user-2', 'user-1');
      expect(result.success).toBe(true);
      expect(result.coins).toBe(50);
    });
  });

  describe('earnCustom', () => {
    it('should award custom coins', () => {
      const result = earnService.earnCustom('user-1', 25, 'event-reward');
      expect(result.success).toBe(true);
      expect(result.coins).toBe(25);
    });
  });
});
