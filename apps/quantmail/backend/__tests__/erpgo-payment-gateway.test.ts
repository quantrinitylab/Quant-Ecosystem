// @vitest-environment node
// ============================================================================
// ERPGo Multi-Payment Gateway Router & Checkout Engine Test Suite
// Covers: Stripe, PayPal, Razorpay, Paystack, Bank Transfer
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import {
  registerGateway,
  getGateway,
  resolveProviderForCurrency,
  createCheckoutSession,
  verifyWebhookSignature,
  clearGatewaysForTesting,
  initDefaultGateways,
  paymentGatewayRouterService,
  PaymentGatewayRouterService,
} from '../services/payment-gateway-router.service';

describe('ERPGo Multi-Payment Gateway Router & Checkout Engine', () => {
  beforeEach(() => {
    clearGatewaysForTesting();
    initDefaultGateways();
  });

  describe('Gateway Registration & Configuration', () => {
    it('initializes default gateways (Stripe, Razorpay, PayPal, Paystack, Bank Transfer)', () => {
      const stripe = getGateway('stripe');
      const razorpay = getGateway('razorpay');
      const paypal = getGateway('paypal');
      const paystack = getGateway('paystack');
      const bankTransfer = getGateway('bank_transfer');

      expect(stripe).not.toBeNull();
      expect(stripe?.enabled).toBe(true);
      expect(stripe?.supportedCurrencies).toContain('USD');

      expect(razorpay).not.toBeNull();
      expect(razorpay?.enabled).toBe(true);
      expect(razorpay?.supportedCurrencies).toContain('INR');

      expect(paypal).not.toBeNull();
      expect(paypal?.enabled).toBe(true);

      expect(paystack).not.toBeNull();
      expect(paystack?.enabled).toBe(true);
      expect(paystack?.supportedCurrencies).toContain('NGN');

      expect(bankTransfer).not.toBeNull();
      expect(bankTransfer?.enabled).toBe(true);
    });

    it('allows registering and overriding gateway configuration', () => {
      registerGateway({
        provider: 'stripe',
        enabled: false,
        supportedCurrencies: ['USD'],
        credentials: {
          publishableKey: 'pk_custom_123',
          secretKey: 'sk_custom_123',
        },
      });

      const updated = getGateway('stripe');
      expect(updated?.enabled).toBe(false);
      expect(updated?.credentials.publishableKey).toBe('pk_custom_123');
    });

    it('throws error when registering gateway without provider', () => {
      expect(() => {
        // @ts-expect-error Testing invalid runtime input
        registerGateway({});
      }).toThrow('INVALID_CONFIG');
    });
  });

  describe('Currency-Based Gateway Routing', () => {
    it('routes INR transactions directly to Razorpay', () => {
      const provider = resolveProviderForCurrency('INR');
      expect(provider).toBe('razorpay');
    });

    it('routes INR (lowercase inr) case-insensitively to Razorpay', () => {
      const provider = resolveProviderForCurrency('inr');
      expect(provider).toBe('razorpay');
    });

    it('routes USD transactions to Stripe by default', () => {
      const provider = resolveProviderForCurrency('USD');
      expect(provider).toBe('stripe');
    });

    it('routes EUR and GBP transactions to Stripe', () => {
      expect(resolveProviderForCurrency('EUR')).toBe('stripe');
      expect(resolveProviderForCurrency('GBP')).toBe('stripe');
    });

    it('routes African currencies (NGN, KES, ZAR) to Paystack', () => {
      expect(resolveProviderForCurrency('NGN')).toBe('paystack');
      expect(resolveProviderForCurrency('KES')).toBe('paystack');
      expect(resolveProviderForCurrency('ZAR')).toBe('paystack');
    });

    it('respects preferred provider when preferred is enabled and supports currency', () => {
      const provider = resolveProviderForCurrency('USD', 'paypal');
      expect(provider).toBe('paypal');
    });

    it('falls back to optimal provider if preferred provider is disabled', () => {
      registerGateway({
        provider: 'paypal',
        enabled: false,
        supportedCurrencies: ['USD', 'EUR'],
        credentials: {},
      });

      const provider = resolveProviderForCurrency('USD', 'paypal');
      expect(provider).toBe('stripe');
    });

    it('falls back to optimal provider if preferred provider does not support currency', () => {
      // Razorpay only supports INR by default
      const provider = resolveProviderForCurrency('USD', 'razorpay');
      expect(provider).toBe('stripe');
    });

    it('falls back to bank transfer for unsupported currency when bank transfer is enabled', () => {
      const provider = resolveProviderForCurrency('XYZ');
      expect(provider).toBe('bank_transfer');
    });

    it('falls back to first enabled provider for unsupported currency when bank transfer is disabled', () => {
      registerGateway({
        provider: 'bank_transfer',
        enabled: false,
        supportedCurrencies: [],
        credentials: {},
      });

      const provider = resolveProviderForCurrency('XYZ');
      // Should fall back to the first available enabled provider (e.g. stripe)
      expect(['stripe', 'paypal', 'razorpay', 'paystack']).toContain(provider);
    });

    it('falls back to bank_transfer when no providers are enabled', () => {
      clearGatewaysForTesting();
      const provider = resolveProviderForCurrency('USD');
      expect(provider).toBe('bank_transfer');
    });
  });

  describe('Checkout Session Creation', () => {
    it('creates checkout session for Stripe with valid session ID and checkout URL', () => {
      const session = createCheckoutSession({
        orderId: 'ord-1001',
        workspaceId: 'ws-test-42',
        amount: 49.99,
        currency: 'USD',
        customerEmail: 'alex@quant.com',
        customerName: 'Alex Mercer',
        successUrl: 'https://quantmail.in/billing/success',
        cancelUrl: 'https://quantmail.in/billing/cancel',
      });

      expect(session.sessionId).toMatch(/^cs_test_[a-f0-9]+$/);
      expect(session.provider).toBe('stripe');
      expect(session.amount).toBe(49.99);
      expect(session.currency).toBe('USD');
      expect(session.status).toBe('PENDING');
      expect(session.checkoutUrl).toContain('checkout.stripe.com');
      expect(session.checkoutUrl).toContain(encodeURIComponent('ord-1001'));
      expect(session.checkoutUrl).toContain(session.sessionId);
    });

    it('creates checkout session for Razorpay with valid session ID and checkout URL for INR', () => {
      const session = createCheckoutSession({
        orderId: 'ord-inr-2002',
        workspaceId: 'ws-test-42',
        amount: 2499,
        currency: 'INR',
        customerEmail: 'rohit@quant.in',
        customerName: 'Rohit Sharma',
        successUrl: 'https://quantmail.in/billing/success',
        cancelUrl: 'https://quantmail.in/billing/cancel',
      });

      expect(session.sessionId).toMatch(/^order_[a-f0-9]{16}$/);
      expect(session.provider).toBe('razorpay');
      expect(session.amount).toBe(2499);
      expect(session.currency).toBe('INR');
      expect(session.status).toBe('PENDING');
      expect(session.checkoutUrl).toContain('checkout.razorpay.com');
      expect(session.checkoutUrl).toContain(session.sessionId);
    });

    it('creates checkout session for PayPal when requested as preferred provider', () => {
      const session = createCheckoutSession({
        orderId: 'ord-paypal-3003',
        workspaceId: 'ws-test-42',
        amount: 99.0,
        currency: 'USD',
        customerEmail: 'buyer@paypal.com',
        preferredProvider: 'paypal',
        successUrl: 'https://quantmail.in/billing/success',
        cancelUrl: 'https://quantmail.in/billing/cancel',
      });

      expect(session.sessionId).toMatch(/^PAYID-[A-F0-9]+$/);
      expect(session.provider).toBe('paypal');
      expect(session.checkoutUrl).toContain('paypal.com/checkoutnow');
      expect(session.checkoutUrl).toContain(session.sessionId);
    });

    it('creates checkout session for Paystack with NGN currency', () => {
      const session = createCheckoutSession({
        orderId: 'ord-ngn-4004',
        workspaceId: 'ws-test-42',
        amount: 50000,
        currency: 'NGN',
        customerEmail: 'adebayo@lagos.ng',
        successUrl: 'https://quantmail.in/billing/success',
        cancelUrl: 'https://quantmail.in/billing/cancel',
      });

      expect(session.sessionId).toMatch(/^pstk_[a-f0-9]+$/);
      expect(session.provider).toBe('paystack');
      expect(session.checkoutUrl).toContain('checkout.paystack.com');
      expect(session.checkoutUrl).toContain(session.sessionId);
    });

    it('creates bank transfer checkout session with instruction URL', () => {
      const session = createCheckoutSession({
        orderId: 'ord-wire-5005',
        workspaceId: 'ws-test-42',
        amount: 15000,
        currency: 'USD',
        customerEmail: 'corporate@enterprise.org',
        preferredProvider: 'bank_transfer',
        successUrl: 'https://quantmail.in/billing/wire-instructions',
        cancelUrl: 'https://quantmail.in/billing/cancel',
      });

      expect(session.sessionId).toMatch(/^bt_[a-f0-9]{16}$/);
      expect(session.provider).toBe('bank_transfer');
      expect(session.checkoutUrl).toContain('session_id=' + session.sessionId);
      expect(session.checkoutUrl).toContain('provider=bank_transfer');
    });

    it('validates required fields on createCheckoutSession', () => {
      expect(() => {
        createCheckoutSession({
          orderId: '',
          workspaceId: 'ws-1',
          amount: 100,
          currency: 'USD',
          customerEmail: 'test@example.com',
          successUrl: 'https://success.com',
          cancelUrl: 'https://cancel.com',
        });
      }).toThrow('ORDER_ID_REQUIRED');

      expect(() => {
        createCheckoutSession({
          orderId: 'ord-1',
          workspaceId: '',
          amount: 100,
          currency: 'USD',
          customerEmail: 'test@example.com',
          successUrl: 'https://success.com',
          cancelUrl: 'https://cancel.com',
        });
      }).toThrow('WORKSPACE_ID_REQUIRED');

      expect(() => {
        createCheckoutSession({
          orderId: 'ord-1',
          workspaceId: 'ws-1',
          amount: -5,
          currency: 'USD',
          customerEmail: 'test@example.com',
          successUrl: 'https://success.com',
          cancelUrl: 'https://cancel.com',
        });
      }).toThrow('INVALID_AMOUNT');
    });

    it('persists and retrieves created sessions via getSession', () => {
      const session = createCheckoutSession({
        orderId: 'ord-persist-6006',
        workspaceId: 'ws-test-42',
        amount: 75.0,
        currency: 'USD',
        customerEmail: 'persist@quant.com',
        successUrl: 'https://quantmail.in/billing/success',
        cancelUrl: 'https://quantmail.in/billing/cancel',
      });

      const retrieved = paymentGatewayRouterService.getSession(session.sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(session.sessionId);
      expect(retrieved?.amount).toBe(75.0);
    });
  });

  describe('Webhook Signature Verification', () => {
    it('verifies valid HMAC-SHA256 signature for Razorpay', () => {
      const secret = 'rzp_sec_test_token_987';
      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_9999', amount: 5000 } } },
      });
      const validSignature = createHmac('sha256', secret).update(payload).digest('hex');

      const isValid = verifyWebhookSignature('razorpay', payload, validSignature, secret);
      expect(isValid).toBe(true);
    });

    it('rejects invalid signature for Razorpay', () => {
      const secret = 'rzp_sec_test_token_987';
      const payload = JSON.stringify({ event: 'payment.captured' });
      const invalidSignature = 'tampered_signature_hex_1234567890abcdef';

      const isValid = verifyWebhookSignature('razorpay', payload, invalidSignature, secret);
      expect(isValid).toBe(false);
    });

    it('verifies valid HMAC-SHA256 signature for Stripe with raw hex', () => {
      const secret = 'whsec_stripe_test_live_key';
      const payload = JSON.stringify({
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_12345', payment_status: 'paid' } },
      });
      const validSignature = createHmac('sha256', secret).update(payload).digest('hex');

      const isValid = verifyWebhookSignature('stripe', payload, validSignature, secret);
      expect(isValid).toBe(true);
    });

    it('verifies valid Stripe signature with standard header format t=...,v1=...', () => {
      const secret = 'whsec_stripe_test_live_key';
      const timestamp = '1727435000';
      const payload = JSON.stringify({ id: 'evt_stripe_99' });
      const signedPayload = `${timestamp}.${payload}`;
      const v1Signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
      const stripeHeader = `t=${timestamp},v1=${v1Signature}`;

      const isValid = verifyWebhookSignature('stripe', payload, stripeHeader, secret);
      expect(isValid).toBe(true);
    });

    it('rejects Stripe signature when timestamp payload mismatch occurs', () => {
      const secret = 'whsec_stripe_test_live_key';
      const timestamp = '1727435000';
      const payload = JSON.stringify({ id: 'evt_stripe_99' });
      const stripeHeader = `t=${timestamp},v1=bad_v1_signature_hash_00000000000000000000000000000000`;

      const isValid = verifyWebhookSignature('stripe', payload, stripeHeader, secret);
      expect(isValid).toBe(false);
    });

    it('verifies valid HMAC-SHA512 signature for Paystack', () => {
      const secret = 'sk_test_paystack_secret';
      const payload = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_123' } });
      const validSignature = createHmac('sha512', secret).update(payload).digest('hex');

      const isValid = verifyWebhookSignature('paystack', payload, validSignature, secret);
      expect(isValid).toBe(true);
    });

    it('uses registered gateway webhook secret when secret argument is omitted', () => {
      const registeredSecret = 'registered_rzp_webhook_secret_777';
      registerGateway({
        provider: 'razorpay',
        enabled: true,
        supportedCurrencies: ['INR'],
        credentials: {
          webhookSecret: registeredSecret,
        },
      });

      const payload = JSON.stringify({ event: 'order.paid' });
      const signature = createHmac('sha256', registeredSecret).update(payload).digest('hex');

      const isValid = verifyWebhookSignature('razorpay', payload, signature);
      expect(isValid).toBe(true);
    });

    it('returns false when signature or payload is empty', () => {
      expect(verifyWebhookSignature('razorpay', '', 'sig', 'secret')).toBe(false);
      expect(verifyWebhookSignature('razorpay', 'payload', '', 'secret')).toBe(false);
    });

    it('returns false when no webhook secret is available', () => {
      registerGateway({
        provider: 'razorpay',
        enabled: true,
        supportedCurrencies: ['INR'],
        credentials: {}, // No secret
      });

      expect(verifyWebhookSignature('razorpay', 'payload', 'sig')).toBe(false);
    });
  });

  describe('Service Class Isolation', () => {
    it('supports standalone instance creation of PaymentGatewayRouterService', () => {
      const customRouter = new PaymentGatewayRouterService();
      customRouter.clearGatewaysForTesting();

      customRouter.registerGateway({
        provider: 'bank_transfer',
        enabled: true,
        supportedCurrencies: ['EUR'],
        credentials: {},
      });

      expect(customRouter.resolveProviderForCurrency('EUR')).toBe('bank_transfer');
    });
  });
});
