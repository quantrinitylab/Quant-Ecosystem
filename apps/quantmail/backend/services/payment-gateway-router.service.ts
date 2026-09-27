// ============================================================================
// QuantMail & ERPGo — Multi-Payment Gateway Router & Checkout Engine
// Supports: Stripe, PayPal, Razorpay, Paystack, Bank Transfer
// ============================================================================

import { randomUUID, createHmac, timingSafeEqual } from 'crypto';

export type PaymentProvider = 'stripe' | 'paypal' | 'razorpay' | 'paystack' | 'bank_transfer';

export interface PaymentGatewayConfig {
  provider: PaymentProvider;
  enabled: boolean;
  supportedCurrencies: string[];
  credentials: {
    publishableKey?: string;
    secretKey?: string;
    webhookSecret?: string;
  };
}

export interface CreateCheckoutSessionParams {
  orderId: string;
  workspaceId: string;
  amount: number;
  currency: string;
  customerEmail: string;
  customerName?: string;
  preferredProvider?: PaymentProvider;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  provider: PaymentProvider;
  checkoutUrl: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'FAILED';
  createdAt: string;
}

function safeTimingEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export class PaymentGatewayRouterService {
  private gateways = new Map<PaymentProvider, PaymentGatewayConfig>();
  private sessions = new Map<string, CheckoutSessionResult>();

  constructor() {
    this.initDefaultGateways();
  }

  /**
   * Initializes standard default configurations for the supported gateways.
   */
  public initDefaultGateways(): void {
    this.registerGateway({
      provider: 'stripe',
      enabled: true,
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
      credentials: {
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_stripe_default',
        secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_stripe_default',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_stripe_default',
      },
    });

    this.registerGateway({
      provider: 'razorpay',
      enabled: true,
      supportedCurrencies: ['INR'],
      credentials: {
        publishableKey: process.env.RAZORPAY_KEY_ID || 'rzp_test_default',
        secretKey: process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_default',
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_whsec_default',
      },
    });

    this.registerGateway({
      provider: 'paypal',
      enabled: true,
      supportedCurrencies: ['USD', 'EUR', 'GBP'],
      credentials: {
        publishableKey: process.env.PAYPAL_CLIENT_ID || 'paypal_client_default',
        secretKey: process.env.PAYPAL_CLIENT_SECRET || 'paypal_secret_default',
        webhookSecret: process.env.PAYPAL_WEBHOOK_ID || 'paypal_whsec_default',
      },
    });

    this.registerGateway({
      provider: 'paystack',
      enabled: true,
      supportedCurrencies: ['NGN', 'KES', 'GHS', 'ZAR'],
      credentials: {
        publishableKey: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_paystack_default',
        secretKey: process.env.PAYSTACK_SECRET_KEY || 'sk_test_paystack_default',
        webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || 'pstk_whsec_default',
      },
    });

    this.registerGateway({
      provider: 'bank_transfer',
      enabled: true,
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'INR', 'NGN'],
      credentials: {},
    });
  }

  /**
   * Registers or updates a payment gateway configuration.
   */
  public registerGateway(config: PaymentGatewayConfig): void {
    if (!config || !config.provider) {
      throw new Error('INVALID_CONFIG: Gateway configuration must include a valid provider.');
    }
    this.gateways.set(config.provider, {
      ...config,
      supportedCurrencies: (config.supportedCurrencies || []).map((c) => c.toUpperCase()),
      credentials: { ...config.credentials },
    });
  }

  /**
   * Retrieves the configuration for a specific provider.
   */
  public getGateway(provider: PaymentProvider): PaymentGatewayConfig | null {
    const config = this.gateways.get(provider);
    return config ? JSON.parse(JSON.stringify(config)) : null;
  }

  /**
   * Resolves the optimal payment provider based on currency and preference.
   * Priority:
   * 1. Preferred provider (if enabled and supports currency)
   * 2. Currency-specific affinity (INR -> Razorpay, USD/EUR/GBP -> Stripe/PayPal, NGN/KES/ZAR -> Paystack)
   * 3. Any enabled provider that supports the currency
   * 4. Fallback to bank_transfer or first enabled provider
   */
  public resolveProviderForCurrency(
    currency: string,
    preferred?: PaymentProvider,
  ): PaymentProvider {
    const normalizedCurrency = (currency || '').trim().toUpperCase();

    // 1. Check preferred provider if specified and valid
    if (preferred) {
      const prefConfig = this.gateways.get(preferred);
      if (
        prefConfig &&
        prefConfig.enabled &&
        (prefConfig.supportedCurrencies.includes(normalizedCurrency) ||
          prefConfig.supportedCurrencies.includes('*'))
      ) {
        return preferred;
      }
    }

    // 2. Currency-specific affinities
    // INR -> Razorpay / UPI
    if (normalizedCurrency === 'INR') {
      const razorpay = this.gateways.get('razorpay');
      if (
        razorpay &&
        razorpay.enabled &&
        (razorpay.supportedCurrencies.includes('INR') || razorpay.supportedCurrencies.includes('*'))
      ) {
        return 'razorpay';
      }
    }

    // USD, EUR, GBP, CAD, AUD -> Stripe, then PayPal
    if (['USD', 'EUR', 'GBP', 'CAD', 'AUD'].includes(normalizedCurrency)) {
      const stripe = this.gateways.get('stripe');
      if (
        stripe &&
        stripe.enabled &&
        (stripe.supportedCurrencies.includes(normalizedCurrency) ||
          stripe.supportedCurrencies.includes('*'))
      ) {
        return 'stripe';
      }

      const paypal = this.gateways.get('paypal');
      if (
        paypal &&
        paypal.enabled &&
        (paypal.supportedCurrencies.includes(normalizedCurrency) ||
          paypal.supportedCurrencies.includes('*'))
      ) {
        return 'paypal';
      }
    }

    // NGN, KES, ZAR, GHS -> Paystack
    if (['NGN', 'KES', 'ZAR', 'GHS'].includes(normalizedCurrency)) {
      const paystack = this.gateways.get('paystack');
      if (
        paystack &&
        paystack.enabled &&
        (paystack.supportedCurrencies.includes(normalizedCurrency) ||
          paystack.supportedCurrencies.includes('*'))
      ) {
        return 'paystack';
      }
    }

    // 3. Any enabled provider explicitly declaring support for this currency
    for (const [provider, config] of this.gateways.entries()) {
      if (
        config.enabled &&
        (config.supportedCurrencies.includes(normalizedCurrency) ||
          config.supportedCurrencies.includes('*'))
      ) {
        return provider;
      }
    }

    // 4. Fallback to bank_transfer or first enabled provider
    const bankTransfer = this.gateways.get('bank_transfer');
    if (bankTransfer && bankTransfer.enabled) {
      return 'bank_transfer';
    }

    const firstEnabled = Array.from(this.gateways.values()).find((g) => g.enabled);
    if (firstEnabled) {
      return firstEnabled.provider;
    }

    return 'bank_transfer';
  }

  /**
   * Generates a checkout session and redirect URL for the designated order.
   */
  public createCheckoutSession(params: CreateCheckoutSessionParams): CheckoutSessionResult {
    if (!params.orderId?.trim()) {
      throw new Error('ORDER_ID_REQUIRED: orderId must be provided.');
    }
    if (!params.workspaceId?.trim()) {
      throw new Error('WORKSPACE_ID_REQUIRED: workspaceId must be provided.');
    }
    if (typeof params.amount !== 'number' || isNaN(params.amount) || params.amount <= 0) {
      throw new Error('INVALID_AMOUNT: amount must be a positive number.');
    }
    if (!params.currency?.trim()) {
      throw new Error('CURRENCY_REQUIRED: currency must be provided.');
    }
    if (!params.customerEmail?.trim()) {
      throw new Error('CUSTOMER_EMAIL_REQUIRED: customerEmail must be provided.');
    }
    if (!params.successUrl?.trim()) {
      throw new Error('SUCCESS_URL_REQUIRED: successUrl must be provided.');
    }
    if (!params.cancelUrl?.trim()) {
      throw new Error('CANCEL_URL_REQUIRED: cancelUrl must be provided.');
    }

    const normalizedCurrency = params.currency.trim().toUpperCase();
    const provider = this.resolveProviderForCurrency(normalizedCurrency, params.preferredProvider);
    const uuid = randomUUID().replace(/-/g, '');

    let sessionId = '';
    let checkoutUrl = '';

    switch (provider) {
      case 'stripe': {
        sessionId = `cs_test_${uuid}`;
        checkoutUrl = `https://checkout.stripe.com/c/pay/${sessionId}?order_id=${encodeURIComponent(
          params.orderId,
        )}&success_url=${encodeURIComponent(params.successUrl)}&cancel_url=${encodeURIComponent(
          params.cancelUrl,
        )}`;
        break;
      }
      case 'razorpay': {
        sessionId = `order_${uuid.slice(0, 16)}`;
        checkoutUrl = `https://checkout.razorpay.com/v1/checkout.html?order_id=${sessionId}&callback_url=${encodeURIComponent(
          params.successUrl,
        )}&cancel_url=${encodeURIComponent(params.cancelUrl)}`;
        break;
      }
      case 'paypal': {
        sessionId = `PAYID-${uuid.slice(0, 20).toUpperCase()}`;
        checkoutUrl = `https://www.paypal.com/checkoutnow?token=${sessionId}&returnUrl=${encodeURIComponent(
          params.successUrl,
        )}&cancelUrl=${encodeURIComponent(params.cancelUrl)}`;
        break;
      }
      case 'paystack': {
        sessionId = `pstk_${uuid}`;
        checkoutUrl = `https://checkout.paystack.com/${sessionId}?callback_url=${encodeURIComponent(
          params.successUrl,
        )}`;
        break;
      }
      case 'bank_transfer':
      default: {
        sessionId = `bt_${uuid.slice(0, 16)}`;
        const separator = params.successUrl.includes('?') ? '&' : '?';
        checkoutUrl = `${params.successUrl}${separator}session_id=${sessionId}&provider=bank_transfer&order_id=${encodeURIComponent(
          params.orderId,
        )}&status=instructions`;
        break;
      }
    }

    const session: CheckoutSessionResult = {
      sessionId,
      provider,
      checkoutUrl,
      amount: params.amount,
      currency: normalizedCurrency,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Verifies incoming webhook signature across providers.
   * Supports:
   * - Razorpay: HMAC-SHA256
   * - Stripe: HMAC-SHA256 (supports both raw hex and `t=...,v1=...` format)
   * - Paystack: HMAC-SHA512 / HMAC-SHA256
   * - PayPal / Bank Transfer: HMAC-SHA256
   */
  public verifyWebhookSignature(
    provider: PaymentProvider,
    payload: string,
    signature: string,
    secret?: string,
  ): boolean {
    if (!payload || !signature) {
      return false;
    }

    const config = this.gateways.get(provider);
    const effectiveSecret =
      secret || config?.credentials?.webhookSecret || config?.credentials?.secretKey;

    if (!effectiveSecret) {
      return false;
    }

    try {
      if (provider === 'stripe') {
        // Parse t=...,v1=... header if present
        if (signature.includes('v1=')) {
          const parts = signature.split(',').reduce<Record<string, string>>((acc, item) => {
            const [k, v] = item.split('=');
            if (k && v) acc[k.trim()] = v.trim();
            return acc;
          }, {});

          const timestamp = parts['t'];
          const v1 = parts['v1'];
          if (timestamp && v1) {
            const signedPayload = `${timestamp}.${payload}`;
            const expected = createHmac('sha256', effectiveSecret)
              .update(signedPayload)
              .digest('hex');
            if (safeTimingEqual(v1, expected)) {
              return true;
            }
          }
        }

        // Direct raw hex HMAC fallback
        const directExpected = createHmac('sha256', effectiveSecret).update(payload).digest('hex');
        return safeTimingEqual(signature, directExpected);
      }

      if (provider === 'razorpay') {
        const expected = createHmac('sha256', effectiveSecret).update(payload).digest('hex');
        return safeTimingEqual(signature, expected);
      }

      if (provider === 'paystack') {
        const expected512 = createHmac('sha512', effectiveSecret).update(payload).digest('hex');
        if (safeTimingEqual(signature, expected512)) {
          return true;
        }
        const expected256 = createHmac('sha256', effectiveSecret).update(payload).digest('hex');
        return safeTimingEqual(signature, expected256);
      }

      // paypal, bank_transfer, generic fallback
      const expected = createHmac('sha256', effectiveSecret).update(payload).digest('hex');
      return safeTimingEqual(signature, expected);
    } catch {
      return false;
    }
  }

  /**
   * Retrieves stored checkout session by ID.
   */
  public getSession(sessionId: string): CheckoutSessionResult | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  /**
   * Clears registered gateways and active sessions for test isolation.
   */
  public clearGatewaysForTesting(): void {
    this.gateways.clear();
    this.sessions.clear();
  }
}

// ============================================================================
// Singleton Instance & Top-Level Exported Functions
// ============================================================================

export const paymentGatewayRouterService = new PaymentGatewayRouterService();

export function registerGateway(config: PaymentGatewayConfig): void {
  paymentGatewayRouterService.registerGateway(config);
}

export function getGateway(provider: PaymentProvider): PaymentGatewayConfig | null {
  return paymentGatewayRouterService.getGateway(provider);
}

export function resolveProviderForCurrency(
  currency: string,
  preferred?: PaymentProvider,
): PaymentProvider {
  return paymentGatewayRouterService.resolveProviderForCurrency(currency, preferred);
}

export function createCheckoutSession(params: CreateCheckoutSessionParams): CheckoutSessionResult {
  return paymentGatewayRouterService.createCheckoutSession(params);
}

export function verifyWebhookSignature(
  provider: PaymentProvider,
  payload: string,
  signature: string,
  secret?: string,
): boolean {
  return paymentGatewayRouterService.verifyWebhookSignature(provider, payload, signature, secret);
}

export function clearGatewaysForTesting(): void {
  paymentGatewayRouterService.clearGatewaysForTesting();
}

export function initDefaultGateways(): void {
  paymentGatewayRouterService.initDefaultGateways();
}
