import { describe, it, expect, beforeEach } from 'vitest';
import {
  getUserWallet,
  creditCreatorDiamonds,
  clearWalletsForTesting,
} from '../services/virtual-gifts.service';
import {
  requestPayout,
  processPayout,
  getCreatorPayoutHistory,
  validatePayoutDetails,
  clearPayoutsForTesting,
  MINIMUM_PAYOUT_DIAMONDS,
  DIAMOND_TO_USD_RATE,
  PayoutDetails,
} from '../services/creator-payout.service';

describe('Shortie Creator Diamond Payout & Withdrawal Gateway', () => {
  beforeEach(() => {
    clearWalletsForTesting();
    clearPayoutsForTesting();
  });

  describe('validatePayoutDetails', () => {
    it('validates UPI ID format correctly', () => {
      const validUpi: PayoutDetails = { method: 'upi', upiId: 'creator@okaxis' };
      expect(validatePayoutDetails(validUpi).valid).toBe(true);

      const validUpi2: PayoutDetails = { method: 'upi', upiId: 'superstar.gamer_99@upi' };
      expect(validatePayoutDetails(validUpi2).valid).toBe(true);

      const invalidUpiNoBank: PayoutDetails = { method: 'upi', upiId: 'invalid-upi-handle' };
      const res1 = validatePayoutDetails(invalidUpiNoBank);
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Invalid UPI ID format');

      const invalidUpiMissing: PayoutDetails = { method: 'upi' };
      const res2 = validatePayoutDetails(invalidUpiMissing);
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('UPI ID is required');
    });

    it('validates Bank Transfer details', () => {
      const validBank: PayoutDetails = {
        method: 'bank_transfer',
        bankAccountNumber: '123456789012',
        ifscOrSwiftCode: 'HDFC0001234',
      };
      expect(validatePayoutDetails(validBank).valid).toBe(true);

      const missingAccount: PayoutDetails = {
        method: 'bank_transfer',
        ifscOrSwiftCode: 'HDFC0001234',
      };
      expect(validatePayoutDetails(missingAccount).valid).toBe(false);

      const missingIfsc: PayoutDetails = {
        method: 'bank_transfer',
        bankAccountNumber: '123456789012',
      };
      expect(validatePayoutDetails(missingIfsc).valid).toBe(false);
    });

    it('validates PayPal email address', () => {
      const validPaypal: PayoutDetails = {
        method: 'paypal',
        paypalEmail: 'creator@gmail.com',
      };
      expect(validatePayoutDetails(validPaypal).valid).toBe(true);

      const invalidPaypal: PayoutDetails = {
        method: 'paypal',
        paypalEmail: 'not-an-email',
      };
      expect(validatePayoutDetails(invalidPaypal).valid).toBe(false);
    });

    it('validates Stripe payout details', () => {
      const validStripe: PayoutDetails = {
        method: 'stripe',
        paypalEmail: 'stripe_account@company.com',
      };
      expect(validatePayoutDetails(validStripe).valid).toBe(true);

      const emptyStripe: PayoutDetails = {
        method: 'stripe',
      };
      expect(validatePayoutDetails(emptyStripe).valid).toBe(false);
    });
  });

  describe('requestPayout', () => {
    it('enforces minimum 1,000 diamond threshold ($10.00 USD)', () => {
      const creatorId = 'creator_under_threshold';
      creditCreatorDiamonds(creatorId, 2000);

      const details: PayoutDetails = { method: 'upi', upiId: 'creator@upi' };

      // Attempt to withdraw 999 diamonds
      expect(() => {
        requestPayout(creatorId, 999, details);
      }).toThrow(`Minimum payout threshold is ${MINIMUM_PAYOUT_DIAMONDS} diamonds`);

      // Attempt to withdraw 500 diamonds
      expect(() => {
        requestPayout(creatorId, 500, details);
      }).toThrow('Minimum payout threshold is 1000 diamonds ($10.00 USD)');
    });

    it('rejects invalid UPI format', () => {
      const creatorId = 'creator_bad_upi';
      creditCreatorDiamonds(creatorId, 1500);

      const invalidDetails: PayoutDetails = { method: 'upi', upiId: 'bad_upi_without_bank' };

      expect(() => {
        requestPayout(creatorId, 1000, invalidDetails);
      }).toThrow('Invalid UPI ID format');

      // Balance should remain un-deducted
      const wallet = getUserWallet(creatorId);
      expect(wallet.diamondsBalance).toBe(1500);
    });

    it('rejects payout when diamond balance is insufficient', () => {
      const creatorId = 'broke_creator';
      creditCreatorDiamonds(creatorId, 500);

      const details: PayoutDetails = { method: 'upi', upiId: 'broke@upi' };

      expect(() => {
        requestPayout(creatorId, 1000, details);
      }).toThrow('INSUFFICIENT_DIAMONDS');
    });

    it('deducts diamonds from available balance and creates PENDING request in escrow', () => {
      const creatorId = 'star_creator';
      creditCreatorDiamonds(creatorId, 2500);

      const details: PayoutDetails = {
        method: 'bank_transfer',
        bankAccountNumber: '9876543210123',
        ifscOrSwiftCode: 'SBIN0001234',
      };

      const payout = requestPayout(creatorId, 1500, details);

      expect(payout.id).toMatch(/^payout_/);
      expect(payout.creatorId).toBe(creatorId);
      expect(payout.diamondsAmount).toBe(1500);
      expect(payout.usdAmount).toBe(15.0); // 1500 * 0.01 = $15.00
      expect(payout.status).toBe('PENDING');
      expect(payout.details).toEqual(details);
      expect(payout.requestedAt).toBeDefined();

      // Creator balance must be reduced from 2500 to 1000 (locked in escrow)
      const wallet = getUserWallet(creatorId);
      expect(wallet.diamondsBalance).toBe(1000);

      // Fraud prevention check: Double-spend attempt should fail
      expect(() => {
        requestPayout(creatorId, 1500, details);
      }).toThrow('INSUFFICIENT_DIAMONDS');
    });
  });

  describe('processPayout', () => {
    it('completing payout marks status COMPLETED and keeps diamonds deducted', () => {
      const creatorId = 'top_producer';
      creditCreatorDiamonds(creatorId, 3000);

      const details: PayoutDetails = { method: 'upi', upiId: 'top@okaxis' };
      const payout = requestPayout(creatorId, 2000, details);

      expect(payout.status).toBe('PENDING');

      const completed = processPayout(payout.id, 'COMPLETED');
      expect(completed.id).toBe(payout.id);
      expect(completed.status).toBe('COMPLETED');
      expect(completed.processedAt).toBeDefined();
      expect(completed.failureReason).toBeUndefined();

      // Diamonds must remain deducted
      const wallet = getUserWallet(creatorId);
      expect(wallet.diamondsBalance).toBe(1000);
    });

    it('rejecting payout refunds diamonds back to creator balance', () => {
      const creatorId = 'refund_creator';
      creditCreatorDiamonds(creatorId, 2000);

      const details: PayoutDetails = {
        method: 'paypal',
        paypalEmail: 'creator@example.com',
      };

      const payout = requestPayout(creatorId, 1000, details);
      // Balance locked in escrow
      expect(getUserWallet(creatorId).diamondsBalance).toBe(1000);

      // Bank or compliance rejects the withdrawal request
      const rejected = processPayout(
        payout.id,
        'REJECTED',
        'Compliance check failed: Unverified PayPal account',
      );

      expect(rejected.id).toBe(payout.id);
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.failureReason).toBe('Compliance check failed: Unverified PayPal account');
      expect(rejected.processedAt).toBeDefined();

      // Diamonds must be refunded back to creator balance
      const wallet = getUserWallet(creatorId);
      expect(wallet.diamondsBalance).toBe(2000);
    });

    it('prevents finalizing an already processed payout', () => {
      const creatorId = 'finalized_creator';
      creditCreatorDiamonds(creatorId, 1000);

      const details: PayoutDetails = { method: 'upi', upiId: 'final@upi' };
      const payout = requestPayout(creatorId, 1000, details);

      processPayout(payout.id, 'COMPLETED');

      expect(() => {
        processPayout(payout.id, 'REJECTED', 'Cannot reject after completion');
      }).toThrow('Payout request has already been finalized');
    });

    it('throws when payout request ID is not found', () => {
      expect(() => {
        processPayout('non_existent_id', 'COMPLETED');
      }).toThrow('Payout request with id non_existent_id not found');
    });
  });

  describe('getCreatorPayoutHistory', () => {
    it('returns history for the creator in reverse chronological order', () => {
      const creatorA = 'creator_alpha';
      const creatorB = 'creator_beta';

      creditCreatorDiamonds(creatorA, 5000);
      creditCreatorDiamonds(creatorB, 2000);

      const p1 = requestPayout(creatorA, 1000, { method: 'upi', upiId: 'alpha1@upi' });
      const p2 = requestPayout(creatorA, 2000, { method: 'upi', upiId: 'alpha2@upi' });
      const pB = requestPayout(creatorB, 1000, { method: 'upi', upiId: 'beta@upi' });

      processPayout(p1.id, 'COMPLETED');

      const historyA = getCreatorPayoutHistory(creatorA);
      expect(historyA).toHaveLength(2);
      expect(historyA[0].id).toBe(p2.id); // Newest first
      expect(historyA[1].id).toBe(p1.id);
      expect(historyA[1].status).toBe('COMPLETED');

      const historyB = getCreatorPayoutHistory(creatorB);
      expect(historyB).toHaveLength(1);
      expect(historyB[0].id).toBe(pB.id);
    });
  });
});
