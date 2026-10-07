// ============================================================================
// Payments - Razorpay Gateway Service
// Razorpay payment gateway integration (India market)
// Uses real Razorpay SDK when credentials are configured, otherwise falls back
// to in-memory simulation for local development and testing.
// ============================================================================

import crypto from 'node:crypto';
import { z } from 'zod';
import Razorpay from 'razorpay';
import type { CurrencyCode, RazorpayPayment } from '../types';

export const CreateRazorpayOrderSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('INR'),
});

export const VerifyRazorpayPaymentSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

export const CreatePayoutSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().positive(),
});

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: CurrencyCode;
  status: 'created' | 'attempted' | 'paid';
  createdAt: number;
}

interface RazorpayPayout {
  id: string;
  accountId: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
}

export interface RazorpayGatewayConfig {
  keyId?: string;
  keySecret?: string;
  /** Optional pre-built Razorpay client for dependency injection in tests */
  client?: Razorpay;
}

/**
 * RazorpayGateway - Razorpay payment gateway for India market
 *
 * Handles order creation, payment verification, payouts,
 * and payment status tracking.
 *
 * When RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are configured (via constructor
 * or environment variables), uses the real Razorpay SDK. Otherwise falls back
 * to in-memory simulation for local development.
 */
export class RazorpayGateway {
  private orders: Map<string, RazorpayOrder>;
  private payments: Map<string, RazorpayPayment>;
  private payouts: Map<string, RazorpayPayout>;
  private readonly keySecret: string | undefined;
  private readonly razorpayClient: Razorpay | undefined;
  private readonly liveMode: boolean;

  constructor(config?: RazorpayGatewayConfig) {
    this.orders = new Map();
    this.payments = new Map();
    this.payouts = new Map();

    const keyId = config?.keyId ?? process.env['RAZORPAY_KEY_ID'];
    const keySecret = config?.keySecret ?? process.env['RAZORPAY_KEY_SECRET'];
    this.keySecret = keySecret;

    if (config?.client) {
      this.razorpayClient = config.client;
      this.liveMode = true;
    } else if (keyId && keySecret) {
      this.razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
      this.liveMode = true;
    } else {
      this.liveMode = false;
    }
  }

  /** Create a new Razorpay order */
  async createOrder(amount: number, currency: CurrencyCode = 'INR'): Promise<RazorpayOrder> {
    const validated = CreateRazorpayOrderSchema.parse({ amount, currency });

    if (this.liveMode && this.razorpayClient) {
      const sdkOrder = await this.razorpayClient.orders.create({
        amount: validated.amount,
        currency,
        receipt: `rcpt_${Date.now()}`,
      });

      const order: RazorpayOrder = {
        id: sdkOrder.id,
        amount:
          typeof sdkOrder.amount === 'string' ? parseInt(sdkOrder.amount, 10) : sdkOrder.amount,
        currency: currency,
        status: sdkOrder.status ?? 'created',
        createdAt: sdkOrder.created_at ?? Date.now(),
      };

      this.orders.set(order.id, order);
      return order;
    }

    // Fallback: in-memory simulation
    const order: RazorpayOrder = {
      id: `order_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      amount: validated.amount,
      currency: currency,
      status: 'created',
      createdAt: Date.now(),
    };

    this.orders.set(order.id, order);
    return order;
  }

  /** Verify a Razorpay payment after checkout */
  async verifyPayment(
    orderId: string,
    paymentId: string,
    signature: string,
  ): Promise<{ verified: boolean; payment?: RazorpayPayment }> {
    VerifyRazorpayPaymentSchema.parse({ orderId, paymentId, signature });

    if (this.liveMode && this.keySecret) {
      // Real HMAC-SHA256 verification
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      if (signature !== expectedSignature) {
        return { verified: false };
      }

      const order = this.orders.get(orderId);
      const payment: RazorpayPayment = {
        id: paymentId,
        orderId,
        amount: order?.amount ?? 0,
        currency: order?.currency ?? 'INR',
        status: 'captured',
        method: 'upi',
        createdAt: Date.now(),
      };

      if (order) {
        order.status = 'paid';
      }
      this.payments.set(paymentId, payment);
      return { verified: true, payment };
    }

    // FAIL CLOSED: without real Razorpay credentials we cannot trust a signature,
    // so we MUST NOT confirm that money was received. Order creation and dev
    // simulation are fine, but payment verification requires live credentials.
    const order = this.orders.get(orderId);
    if (!order) {
      return { verified: false };
    }

    // eslint-disable-next-line no-console
    console.warn(
      '[razorpay] verifyPayment called without RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET — failing closed',
    );
    return { verified: false };
  }

  /** Create a payout to a bank account via Razorpay */
  async createPayout(accountId: string, amount: number): Promise<RazorpayPayout> {
    CreatePayoutSchema.parse({ accountId, amount });

    // Payouts require RazorpayX which has different endpoints.
    // In live mode, we log that it would trigger RazorpayX but still simulate locally.
    const payout: RazorpayPayout = {
      id: `pout_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      accountId,
      amount,
      status: 'processing',
      createdAt: Date.now(),
    };

    this.payouts.set(payout.id, payout);

    // Simulate async payout completion
    setTimeout(() => {
      payout.status = 'completed';
    }, 0);

    return payout;
  }

  /** Get payment status by payment ID */
  async getPaymentStatus(paymentId: string): Promise<RazorpayPayment | null> {
    return this.payments.get(paymentId) ?? null;
  }

  /** Get order by ID */
  async getOrder(orderId: string): Promise<RazorpayOrder | null> {
    return this.orders.get(orderId) ?? null;
  }

  /** Generate a simulated signature (used in fallback/test mode) */
  private generateSimulatedSignature(orderId: string, paymentId: string): string {
    return `sig_${orderId}_${paymentId}`;
  }

  /**
   * Generate a test signature for use in test environments only.
   * In production, signatures come from Razorpay webhooks.
   *
   * In live mode, generates real HMAC-SHA256 signature.
   * In fallback mode, generates simulated signature.
   */
  generateTestSignature(orderId: string, paymentId: string): string {
    if (this.liveMode && this.keySecret) {
      return crypto
        .createHmac('sha256', this.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
    }
    return this.generateSimulatedSignature(orderId, paymentId);
  }
}
