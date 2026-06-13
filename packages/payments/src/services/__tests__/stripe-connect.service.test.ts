// ============================================================================
// Payments - Stripe Connect Service Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StripeConnectService } from '../stripe-connect.service';

vi.mock('stripe', () => {
  const mockAccounts = {
    create: vi.fn(),
    retrieve: vi.fn(),
  };
  const mockAccountLinks = {
    create: vi.fn(),
  };
  const mockTransfers = {
    create: vi.fn(),
  };
  const mockPayouts = {
    create: vi.fn(),
  };

  const StripeMock = vi.fn(function () {
    return {
      accounts: mockAccounts,
      accountLinks: mockAccountLinks,
      transfers: mockTransfers,
      payouts: mockPayouts,
    };
  });

  return { default: StripeMock };
});

describe('StripeConnectService', () => {
  let service: StripeConnectService;
  let mockStripeInstance: {
    accounts: { create: ReturnType<typeof vi.fn>; retrieve: ReturnType<typeof vi.fn> };
    accountLinks: { create: ReturnType<typeof vi.fn> };
    transfers: { create: ReturnType<typeof vi.fn> };
    payouts: { create: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new StripeConnectService({ secretKey: 'sk_test_123' });

    const Stripe = (await import('stripe')).default;
    mockStripeInstance = new (Stripe as unknown as new () => typeof mockStripeInstance)();
  });

  describe('createCreatorAccount', () => {
    it('should create an express account and return onboarding link', async () => {
      mockStripeInstance.accounts.create.mockResolvedValue({ id: 'acct_123' });
      mockStripeInstance.accountLinks.create.mockResolvedValue({
        url: 'https://connect.stripe.com/setup/e/acct_123',
      });

      const result = await service.createCreatorAccount({
        creatorId: 'creator_1',
        email: 'creator@example.com',
        country: 'US',
      });

      expect(result.creatorId).toBe('creator_1');
      expect(result.email).toBe('creator@example.com');
      expect(result.country).toBe('US');
      expect(result.stripeAccountId).toBe('acct_123');
      expect(result.onboardingUrl).toBe('https://connect.stripe.com/setup/e/acct_123');
      expect(result.status).toBe('pending');
      expect(mockStripeInstance.accounts.create).toHaveBeenCalledWith({
        type: 'express',
        email: 'creator@example.com',
        country: 'US',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
    });

    it('should reject invalid email', async () => {
      await expect(
        service.createCreatorAccount({
          creatorId: 'creator_1',
          email: 'not-an-email',
          country: 'US',
        }),
      ).rejects.toThrow();
    });

    it('should reject empty creatorId', async () => {
      await expect(
        service.createCreatorAccount({
          creatorId: '',
          email: 'creator@example.com',
          country: 'US',
        }),
      ).rejects.toThrow();
    });

    it('should reject invalid country code', async () => {
      await expect(
        service.createCreatorAccount({
          creatorId: 'creator_1',
          email: 'creator@example.com',
          country: 'USA',
        }),
      ).rejects.toThrow();
    });
  });

  describe('getAccountStatus', () => {
    it('should return active status when charges and payouts enabled', async () => {
      mockStripeInstance.accounts.retrieve.mockResolvedValue({
        id: 'acct_123',
        charges_enabled: true,
        payouts_enabled: true,
        requirements: {},
      });

      const result = await service.getAccountStatus('acct_123');

      expect(result.status).toBe('active');
      expect(result.details).toContain('fully verified');
    });

    it('should return pending status when not fully verified', async () => {
      mockStripeInstance.accounts.retrieve.mockResolvedValue({
        id: 'acct_123',
        charges_enabled: false,
        payouts_enabled: false,
        requirements: {},
      });

      const result = await service.getAccountStatus('acct_123');

      expect(result.status).toBe('pending');
    });

    it('should return restricted status when disabled_reason present', async () => {
      mockStripeInstance.accounts.retrieve.mockResolvedValue({
        id: 'acct_123',
        charges_enabled: false,
        payouts_enabled: false,
        requirements: { disabled_reason: 'requirements.past_due' },
      });

      const result = await service.getAccountStatus('acct_123');

      expect(result.status).toBe('restricted');
      expect(result.details).toContain('requirements.past_due');
    });

    it('should throw for empty accountId', async () => {
      await expect(service.getAccountStatus('')).rejects.toThrow('accountId is required');
    });
  });

  describe('transferToCreator', () => {
    it('should create a transfer to connected account', async () => {
      const mockTransfer = { id: 'tr_123', amount: 5000, currency: 'usd' };
      mockStripeInstance.transfers.create.mockResolvedValue(mockTransfer);

      const result = await service.transferToCreator({
        accountId: 'acct_123',
        amount: 5000,
        currency: 'usd',
      });

      expect(result).toEqual(mockTransfer);
      expect(mockStripeInstance.transfers.create).toHaveBeenCalledWith({
        amount: 5000,
        currency: 'usd',
        destination: 'acct_123',
      });
    });

    it('should reject zero amount', async () => {
      await expect(
        service.transferToCreator({ accountId: 'acct_123', amount: 0, currency: 'usd' }),
      ).rejects.toThrow();
    });

    it('should reject negative amount', async () => {
      await expect(
        service.transferToCreator({ accountId: 'acct_123', amount: -100, currency: 'usd' }),
      ).rejects.toThrow();
    });
  });

  describe('createPayout', () => {
    it('should create a payout for connected account', async () => {
      const mockPayout = { id: 'po_123', amount: 3000, currency: 'usd' };
      mockStripeInstance.payouts.create.mockResolvedValue(mockPayout);

      const result = await service.createPayout({
        accountId: 'acct_456',
        amount: 3000,
        currency: 'usd',
      });

      expect(result).toEqual(mockPayout);
      expect(mockStripeInstance.payouts.create).toHaveBeenCalledWith(
        { amount: 3000, currency: 'usd' },
        { stripeAccount: 'acct_456' },
      );
    });

    it('should reject empty accountId', async () => {
      await expect(
        service.createPayout({ accountId: '', amount: 3000, currency: 'usd' }),
      ).rejects.toThrow();
    });

    it('should reject invalid currency (too short)', async () => {
      await expect(
        service.createPayout({ accountId: 'acct_123', amount: 3000, currency: 'us' }),
      ).rejects.toThrow();
    });
  });
});
