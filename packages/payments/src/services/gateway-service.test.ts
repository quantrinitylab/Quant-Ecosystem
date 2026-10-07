// ============================================================================
// Payments - Stripe Gateway Service Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StripeGateway } from './gateway-service';

// Mock the stripe module
vi.mock('stripe', () => {
  const mockPaymentIntents = {
    create: vi.fn(),
  };
  const mockCustomers = {
    create: vi.fn(),
  };
  const mockRefunds = {
    create: vi.fn(),
  };
  const mockSubscriptions = {
    create: vi.fn(),
  };
  const mockWebhooks = {
    constructEvent: vi.fn(),
  };

  const StripeMock = vi.fn(function () {
    return {
      paymentIntents: mockPaymentIntents,
      customers: mockCustomers,
      refunds: mockRefunds,
      subscriptions: mockSubscriptions,
      webhooks: mockWebhooks,
    };
  });

  return { default: StripeMock };
});

describe('StripeGateway', () => {
  let gateway: StripeGateway;
  let mockStripeInstance: {
    paymentIntents: { create: ReturnType<typeof vi.fn> };
    customers: { create: ReturnType<typeof vi.fn> };
    refunds: { create: ReturnType<typeof vi.fn> };
    subscriptions: { create: ReturnType<typeof vi.fn> };
    webhooks: { constructEvent: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    gateway = new StripeGateway({
      secretKey: 'sk_test_abc123',
      webhookSecret: 'whsec_test_secret',
    });

    // Access the mocked stripe instance
    const Stripe = (await import('stripe')).default;
    mockStripeInstance = new (Stripe as unknown as new () => typeof mockStripeInstance)();
  });

  describe('createPaymentIntent', () => {
    it('should create a payment intent with valid params', async () => {
      const mockIntent = { id: 'pi_123', amount: 5000, currency: 'usd' };
      mockStripeInstance.paymentIntents.create.mockResolvedValue(mockIntent);

      const result = await gateway.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
        customerId: 'cus_123',
        metadata: { orderId: 'order_1' },
      });

      expect(result).toEqual(mockIntent);
      expect(mockStripeInstance.paymentIntents.create).toHaveBeenCalledWith({
        amount: 5000,
        currency: 'usd',
        customer: 'cus_123',
        metadata: { orderId: 'order_1' },
      });
    });

    it('should create a payment intent without customerId', async () => {
      const mockIntent = { id: 'pi_456', amount: 1000, currency: 'eur' };
      mockStripeInstance.paymentIntents.create.mockResolvedValue(mockIntent);

      const result = await gateway.createPaymentIntent({
        amount: 1000,
        currency: 'eur',
      });

      expect(result).toEqual(mockIntent);
      expect(mockStripeInstance.paymentIntents.create).toHaveBeenCalledWith({
        amount: 1000,
        currency: 'eur',
        metadata: undefined,
      });
    });

    it('should reject invalid amount (negative)', async () => {
      await expect(
        gateway.createPaymentIntent({ amount: -100, currency: 'usd' }),
      ).rejects.toThrow();
    });

    it('should reject invalid amount (zero)', async () => {
      await expect(gateway.createPaymentIntent({ amount: 0, currency: 'usd' })).rejects.toThrow();
    });

    it('should reject invalid currency (too short)', async () => {
      await expect(gateway.createPaymentIntent({ amount: 1000, currency: 'us' })).rejects.toThrow();
    });
  });

  describe('createCustomer', () => {
    it('should create a customer with valid params', async () => {
      const mockCustomer = { id: 'cus_789', email: 'test@example.com', name: 'John' };
      mockStripeInstance.customers.create.mockResolvedValue(mockCustomer);

      const result = await gateway.createCustomer({
        email: 'test@example.com',
        name: 'John',
        metadata: { source: 'web' },
      });

      expect(result).toEqual(mockCustomer);
      expect(mockStripeInstance.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'John',
        metadata: { source: 'web' },
      });
    });

    it('should reject invalid email', async () => {
      await expect(
        gateway.createCustomer({ email: 'not-an-email', name: 'John' }),
      ).rejects.toThrow();
    });

    it('should reject empty name', async () => {
      await expect(
        gateway.createCustomer({ email: 'test@example.com', name: '' }),
      ).rejects.toThrow();
    });
  });

  describe('refund', () => {
    it('should create a full refund', async () => {
      const mockRefund = { id: 're_123', amount: 5000 };
      mockStripeInstance.refunds.create.mockResolvedValue(mockRefund);

      const result = await gateway.refund({
        paymentIntentId: 'pi_123',
      });

      expect(result).toEqual(mockRefund);
      expect(mockStripeInstance.refunds.create).toHaveBeenCalledWith({
        payment_intent: 'pi_123',
      });
    });

    it('should create a partial refund with reason', async () => {
      const mockRefund = { id: 're_456', amount: 2500 };
      mockStripeInstance.refunds.create.mockResolvedValue(mockRefund);

      const result = await gateway.refund({
        paymentIntentId: 'pi_456',
        amount: 2500,
        reason: 'duplicate',
      });

      expect(result).toEqual(mockRefund);
      expect(mockStripeInstance.refunds.create).toHaveBeenCalledWith({
        payment_intent: 'pi_456',
        amount: 2500,
        reason: 'duplicate',
      });
    });

    it('should reject empty paymentIntentId', async () => {
      await expect(gateway.refund({ paymentIntentId: '' })).rejects.toThrow();
    });

    it('should reject invalid reason', async () => {
      await expect(
        gateway.refund({ paymentIntentId: 'pi_123', reason: 'invalid_reason' }),
      ).rejects.toThrow();
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription with valid params', async () => {
      const mockSub = { id: 'sub_123', customer: 'cus_123' };
      mockStripeInstance.subscriptions.create.mockResolvedValue(mockSub);

      const result = await gateway.createSubscription({
        customerId: 'cus_123',
        priceId: 'price_abc',
        metadata: { plan: 'pro' },
      });

      expect(result).toEqual(mockSub);
      expect(mockStripeInstance.subscriptions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        items: [{ price: 'price_abc' }],
        metadata: { plan: 'pro' },
      });
    });

    it('should reject empty customerId', async () => {
      await expect(
        gateway.createSubscription({ customerId: '', priceId: 'price_abc' }),
      ).rejects.toThrow();
    });

    it('should reject empty priceId', async () => {
      await expect(
        gateway.createSubscription({ customerId: 'cus_123', priceId: '' }),
      ).rejects.toThrow();
    });
  });

  describe('verifyWebhook', () => {
    it('should verify and construct a webhook event', () => {
      const mockEvent = { id: 'evt_123', type: 'payment_intent.succeeded' };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = gateway.verifyWebhook('payload_body', 'sig_header');

      expect(result).toEqual(mockEvent);
      expect(mockStripeInstance.webhooks.constructEvent).toHaveBeenCalledWith(
        'payload_body',
        'sig_header',
        'whsec_test_secret',
      );
    });

    it('should throw when signature is invalid', () => {
      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Webhook signature verification failed');
      });

      expect(() => gateway.verifyWebhook('payload', 'bad_sig')).toThrow(
        'Webhook signature verification failed',
      );
    });
  });
});
