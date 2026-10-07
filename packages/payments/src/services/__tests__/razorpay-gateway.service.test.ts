// ============================================================================
// Payments - Razorpay Gateway Service Tests
// ============================================================================

import crypto from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { RazorpayGateway } from '../razorpay-gateway.service';

describe('RazorpayGateway', () => {
  let gateway: RazorpayGateway;

  beforeEach(() => {
    gateway = new RazorpayGateway();
  });

  describe('createOrder', () => {
    it('should create an order with specified amount and currency', async () => {
      const order = await gateway.createOrder(1000, 'INR');

      expect(order.id).toMatch(/^order_/);
      expect(order.amount).toBe(1000);
      expect(order.currency).toBe('INR');
      expect(order.status).toBe('created');
      expect(order.createdAt).toBeGreaterThan(0);
    });

    it('should default currency to INR', async () => {
      const order = await gateway.createOrder(500);

      expect(order.currency).toBe('INR');
    });

    it('should reject zero amount', async () => {
      await expect(gateway.createOrder(0)).rejects.toThrow();
    });

    it('should reject negative amount', async () => {
      await expect(gateway.createOrder(-100)).rejects.toThrow();
    });
  });

  describe('verifyPayment (fail-closed when unconfigured)', () => {
    it('rejects verification without live credentials even with a generated signature', async () => {
      const order = await gateway.createOrder(1000, 'INR');
      const paymentId = 'pay_test_123';
      const signature = gateway.generateTestSignature(order.id, paymentId);

      const result = await gateway.verifyPayment(order.id, paymentId, signature);

      // No real Razorpay credentials => never confirm a payment.
      expect(result.verified).toBe(false);
      expect(result.payment).toBeUndefined();
    });

    it('should reject payment with invalid signature', async () => {
      const order = await gateway.createOrder(1000, 'INR');
      const result = await gateway.verifyPayment(order.id, 'pay_123', 'invalid_sig');

      expect(result.verified).toBe(false);
      expect(result.payment).toBeUndefined();
    });

    it('should reject payment for non-existent order', async () => {
      const result = await gateway.verifyPayment('order_invalid', 'pay_123', 'sig');

      expect(result.verified).toBe(false);
    });

    it('does not mark order as paid when verification fails closed', async () => {
      const order = await gateway.createOrder(1000, 'INR');
      const paymentId = 'pay_test_456';
      const signature = gateway.generateTestSignature(order.id, paymentId);

      await gateway.verifyPayment(order.id, paymentId, signature);
      const updatedOrder = await gateway.getOrder(order.id);

      expect(updatedOrder!.status).toBe('created');
    });
  });

  describe('createPayout', () => {
    it('should create a payout with processing status', async () => {
      const payout = await gateway.createPayout('acc_123', 5000);

      expect(payout.id).toMatch(/^pout_/);
      expect(payout.accountId).toBe('acc_123');
      expect(payout.amount).toBe(5000);
      expect(payout.status).toBe('processing');
    });

    it('should reject zero amount payout', async () => {
      await expect(gateway.createPayout('acc_123', 0)).rejects.toThrow();
    });

    it('should reject empty account ID', async () => {
      await expect(gateway.createPayout('', 1000)).rejects.toThrow();
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment after verification (live mode)', async () => {
      const mockClient = {
        orders: {
          create: async () => ({
            id: 'order_status_live',
            amount: 500,
            currency: 'INR',
            status: 'created' as const,
            created_at: Date.now(),
            entity: 'order',
            amount_paid: 0,
            amount_due: 500,
            attempts: 0,
            description: '',
            token: {} as never,
          }),
        },
      } as never;
      const liveGateway = new RazorpayGateway({
        keyId: 'rzp_test_key',
        keySecret: 'test_secret',
        client: mockClient,
      });
      const order = await liveGateway.createOrder(500, 'INR');
      const paymentId = 'pay_status_test';
      const signature = liveGateway.generateTestSignature(order.id, paymentId);

      await liveGateway.verifyPayment(order.id, paymentId, signature);
      const payment = await liveGateway.getPaymentStatus(paymentId);

      expect(payment).not.toBeNull();
      expect(payment!.id).toBe(paymentId);
      expect(payment!.status).toBe('captured');
    });

    it('should return null for unknown payment', async () => {
      const payment = await gateway.getPaymentStatus('pay_unknown');

      expect(payment).toBeNull();
    });
  });
});

describe('RazorpayGateway (live mode)', () => {
  const testKeyId = 'rzp_test_key123';
  const testKeySecret = 'test_secret_abc';

  it('should verify HMAC-SHA256 signature correctly', async () => {
    const mockClient = {
      orders: {
        create: async () => ({
          id: 'order_live_1',
          amount: 5000,
          currency: 'INR',
          status: 'created' as const,
          created_at: Date.now(),
          entity: 'order',
          amount_paid: 0,
          amount_due: 5000,
          attempts: 0,
          description: '',
          token: {} as never,
        }),
      },
    } as never;

    const gateway = new RazorpayGateway({
      keyId: testKeyId,
      keySecret: testKeySecret,
      client: mockClient,
    });

    // Create an order first to populate internal state
    const order = await gateway.createOrder(5000, 'INR');
    const paymentId = 'pay_live_456';

    // Compute expected HMAC-SHA256 signature
    const expectedSig = crypto
      .createHmac('sha256', testKeySecret)
      .update(`${order.id}|${paymentId}`)
      .digest('hex');

    const result = await gateway.verifyPayment(order.id, paymentId, expectedSig);

    expect(result.verified).toBe(true);
    expect(result.payment).toBeDefined();
    expect(result.payment!.id).toBe(paymentId);
    expect(result.payment!.status).toBe('captured');
  });

  it('should reject invalid signature in live mode', async () => {
    const mockClient = {
      orders: {
        create: async () => ({
          id: 'order_live_2',
          amount: 3000,
          currency: 'INR',
          status: 'created' as const,
          created_at: Date.now(),
          entity: 'order',
          amount_paid: 0,
          amount_due: 3000,
          attempts: 0,
          description: '',
          token: {} as never,
        }),
      },
    } as never;

    const gateway = new RazorpayGateway({
      keyId: testKeyId,
      keySecret: testKeySecret,
      client: mockClient,
    });

    const order = await gateway.createOrder(3000, 'INR');
    const result = await gateway.verifyPayment(order.id, 'pay_bad', 'invalid_signature_hex');

    expect(result.verified).toBe(false);
    expect(result.payment).toBeUndefined();
  });

  it('should generate correct HMAC-SHA256 test signature in live mode', () => {
    const gateway = new RazorpayGateway({
      keyId: testKeyId,
      keySecret: testKeySecret,
    });

    const orderId = 'order_test_123';
    const paymentId = 'pay_test_456';

    const sig = gateway.generateTestSignature(orderId, paymentId);
    const expected = crypto
      .createHmac('sha256', testKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    expect(sig).toBe(expected);
  });
});
