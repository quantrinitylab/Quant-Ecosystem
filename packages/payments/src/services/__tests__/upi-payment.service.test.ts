// ============================================================================
// Payments - UPI Payment Service Tests
// ============================================================================

import crypto from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { UPIPaymentService } from '../upi-payment.service';

describe('UPIPaymentService', () => {
  let service: UPIPaymentService;

  beforeEach(() => {
    service = new UPIPaymentService();
  });

  describe('generatePaymentLink', () => {
    it('should generate a valid UPI payment link', async () => {
      const payment = await service.generatePaymentLink(100, 'merchant@upi');

      expect(payment.id).toMatch(/^upay_/);
      expect(payment.upiId).toBe('merchant@upi');
      expect(payment.amount).toBe(100);
      expect(payment.currency).toBe('INR');
      expect(payment.status).toBe('pending');
      expect(payment.paymentLink).toContain('upi://pay');
      expect(payment.paymentLink).toContain('merchant@upi');
      expect(payment.paymentLink).toContain('am=100');
      expect(payment.transactionRef).toMatch(/^upi_/);
    });

    it('should include description in payment link', async () => {
      const payment = await service.generatePaymentLink(50, 'shop@paytm', 'Order 123');

      expect(payment.paymentLink).toContain('Order 123');
    });

    it('should reject zero amount', async () => {
      await expect(service.generatePaymentLink(0, 'test@upi')).rejects.toThrow();
    });

    it('should reject negative amount', async () => {
      await expect(service.generatePaymentLink(-10, 'test@upi')).rejects.toThrow();
    });

    it('should reject invalid UPI ID format', async () => {
      await expect(service.generatePaymentLink(100, 'invalid-upi')).rejects.toThrow();
    });

    it('should reject empty UPI ID', async () => {
      await expect(service.generatePaymentLink(100, '')).rejects.toThrow();
    });
  });

  describe('verifyPayment (fail-closed when unconfigured)', () => {
    it('does not auto-complete a pending payment without live credentials', async () => {
      const payment = await service.generatePaymentLink(200, 'store@ybl');
      const result = await service.verifyPayment(payment.transactionRef);

      // No real credentials => cannot confirm money was received.
      expect(result.verified).toBe(false);
      expect(result.payment).toBeDefined();
      expect(result.payment!.status).toBe('pending');
    });

    it('should return false for unknown transaction ref', async () => {
      const result = await service.verifyPayment('upi_unknown_ref');

      expect(result.verified).toBe(false);
      expect(result.payment).toBeUndefined();
    });

    it('reports an already completed payment as verified', async () => {
      // Drive a payment to completed via live mode, then re-verify in fallback.
      const liveService = new UPIPaymentService({
        keyId: 'rzp_test_key',
        keySecret: 'secret',
        client: {
          orders: {
            create: async () => ({
              id: 'order_done',
              amount: 100,
              currency: 'INR',
              status: 'created' as const,
              created_at: Date.now(),
              entity: 'order',
              amount_paid: 0,
              amount_due: 100,
              attempts: 0,
              description: '',
              token: {} as never,
            }),
          },
        } as never,
      });
      const payment = await liveService.generatePaymentLink(100, 'test@upi');
      const first = await liveService.verifyPayment(payment.transactionRef);
      expect(first.verified).toBe(true);
      expect(first.payment!.status).toBe('completed');
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment status', async () => {
      const payment = await service.generatePaymentLink(300, 'vendor@upi');
      const status = await service.getPaymentStatus(payment.transactionRef);

      expect(status).not.toBeNull();
      expect(status!.status).toBe('pending');
    });

    it('should return null for unknown reference', async () => {
      const status = await service.getPaymentStatus('unknown_ref');

      expect(status).toBeNull();
    });
  });

  describe('expirePayment', () => {
    it('should expire a pending payment', async () => {
      const payment = await service.generatePaymentLink(100, 'test@upi');
      const expired = await service.expirePayment(payment.transactionRef);

      expect(expired).not.toBeNull();
      expect(expired!.status).toBe('expired');
    });

    it('should not expire a completed payment', async () => {
      const liveService = new UPIPaymentService({
        keyId: 'rzp_test_key',
        keySecret: 'secret',
        client: {
          orders: {
            create: async () => ({
              id: 'order_exp',
              amount: 100,
              currency: 'INR',
              status: 'created' as const,
              created_at: Date.now(),
              entity: 'order',
              amount_paid: 0,
              amount_due: 100,
              attempts: 0,
              description: '',
              token: {} as never,
            }),
          },
        } as never,
      });
      const payment = await liveService.generatePaymentLink(100, 'test@upi');
      await liveService.verifyPayment(payment.transactionRef);
      const result = await liveService.expirePayment(payment.transactionRef);

      expect(result!.status).toBe('completed');
    });

    it('should return null for unknown reference', async () => {
      const result = await service.expirePayment('unknown_ref');

      expect(result).toBeNull();
    });
  });
});

describe('UPIPaymentService (live mode)', () => {
  const testKeyId = 'rzp_test_upi_key';
  const testKeySecret = 'upi_test_secret_xyz';

  it('should create Razorpay order in live mode', async () => {
    const mockClient = {
      orders: {
        create: async (params: Record<string, unknown>) => ({
          id: 'order_upi_live_1',
          amount: params.amount,
          currency: params.currency,
          status: 'created' as const,
          created_at: Date.now(),
          entity: 'order',
          amount_paid: 0,
          amount_due: params.amount,
          attempts: 0,
          description: '',
          receipt: params.receipt,
          method: params.method,
          token: {} as never,
        }),
      },
    };

    const service = new UPIPaymentService({
      keyId: testKeyId,
      keySecret: testKeySecret,
      merchantVPA: 'test@razorpay',
      client: mockClient as never,
    });

    const payment = await service.generatePaymentLink(500, 'user@ybl', 'Test Order');

    expect(payment.transactionRef).toBe('order_upi_live_1');
    expect(payment.amount).toBe(500);
    expect(payment.currency).toBe('INR');
    expect(payment.status).toBe('pending');
    expect(payment.id).toMatch(/^upay_/);
  });

  it('should generate UPI deep link with merchant VPA', async () => {
    const mockClient = {
      orders: {
        create: async () => ({
          id: 'order_upi_vpa_1',
          amount: 200,
          currency: 'INR',
          status: 'created' as const,
          created_at: Date.now(),
          entity: 'order',
          amount_paid: 0,
          amount_due: 200,
          attempts: 0,
          description: '',
          token: {} as never,
        }),
      },
    };

    const service = new UPIPaymentService({
      keyId: testKeyId,
      keySecret: testKeySecret,
      merchantVPA: 'test@razorpay',
      client: mockClient as never,
    });

    const payment = await service.generatePaymentLink(200, 'buyer@upi', 'VPA Test');

    expect(payment.paymentLink).toContain('upi://pay');
    expect(payment.paymentLink).toContain('test@razorpay');
    expect(payment.paymentLink).toContain('am=200');
  });

  it('should verify payment signature via HMAC-SHA256', async () => {
    const service = new UPIPaymentService({
      keyId: testKeyId,
      keySecret: testKeySecret,
    });

    const orderId = 'order_hmac_test_1';
    const paymentId = 'pay_hmac_test_1';

    const expectedSignature = crypto
      .createHmac('sha256', testKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const result = await service.verifyPaymentSignature(orderId, paymentId, expectedSignature);

    expect(result).toBe(true);
  });

  it('should reject invalid signature', async () => {
    const service = new UPIPaymentService({
      keyId: testKeyId,
      keySecret: testKeySecret,
    });

    const result = await service.verifyPaymentSignature(
      'order_test',
      'pay_test',
      'invalid_signature_value',
    );

    expect(result).toBe(false);
  });

  it('should return false for signature verification with no credentials', async () => {
    const service = new UPIPaymentService();

    const result = await service.verifyPaymentSignature('order_test', 'pay_test', 'any_signature');

    expect(result).toBe(false);
  });
});
