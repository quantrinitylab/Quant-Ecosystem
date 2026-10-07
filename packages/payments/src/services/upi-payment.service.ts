// ============================================================================
// Payments - UPI Payment Service
// UPI payment integration for India market
// Uses Razorpay SDK with UPI method when credentials are configured,
// otherwise falls back to in-memory simulation.
// ============================================================================

import crypto from 'node:crypto';
import { z } from 'zod';
import Razorpay from 'razorpay';
import type { UPIPayment, CurrencyCode } from '../types';

export const GenerateUPIPaymentLinkSchema = z.object({
  amount: z.number().positive(),
  upiId: z
    .string()
    .min(1)
    .regex(/^[\w.-]+@[\w]+$/, 'Invalid UPI ID format'),
});

export const VerifyUPIPaymentSchema = z.object({
  transactionRef: z.string().min(1),
});

export interface UPIPaymentServiceConfig {
  keyId?: string;
  keySecret?: string;
  merchantVPA?: string;
  /** Optional pre-built Razorpay client for dependency injection in tests */
  client?: Razorpay;
}

/**
 * UPIPaymentService - UPI payment handling for India market
 *
 * Generates payment links, verifies transactions, and tracks
 * payment status.
 *
 * When RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are configured, creates
 * Razorpay orders with UPI as preferred method and generates UPI deep links.
 * Otherwise falls back to in-memory simulation.
 */
export class UPIPaymentService {
  private payments: Map<string, UPIPayment>;
  private readonly keySecret: string | undefined;
  private readonly merchantVPA: string;
  private readonly razorpayClient: Razorpay | undefined;
  private readonly liveMode: boolean;

  constructor(config?: UPIPaymentServiceConfig) {
    this.payments = new Map();

    const keyId = config?.keyId ?? process.env['RAZORPAY_KEY_ID'];
    const keySecret = config?.keySecret ?? process.env['RAZORPAY_KEY_SECRET'];
    this.keySecret = keySecret;
    this.merchantVPA =
      config?.merchantVPA ?? process.env['RAZORPAY_MERCHANT_VPA'] ?? 'quant@razorpay';

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

  /** Generate a UPI payment link */
  async generatePaymentLink(
    amount: number,
    upiId: string,
    description?: string,
  ): Promise<UPIPayment> {
    GenerateUPIPaymentLinkSchema.parse({ amount, upiId });

    const transactionRef = `upi_${Date.now()}_${globalThis.crypto.randomUUID()}`;
    const desc = description ?? 'Payment';

    if (this.liveMode && this.razorpayClient) {
      const sdkOrder = await this.razorpayClient.orders.create({
        amount,
        currency: 'INR',
        method: 'upi',
        receipt: transactionRef,
      });

      const paymentLink = `upi://pay?pa=${this.merchantVPA}&pn=Quant&am=${amount}&cu=INR&tn=${desc}&tr=${transactionRef}`;

      const payment: UPIPayment = {
        id: `upay_${Date.now()}_${globalThis.crypto.randomUUID()}`,
        upiId,
        amount,
        currency: 'INR' as CurrencyCode,
        status: 'pending',
        paymentLink,
        transactionRef: sdkOrder.id,
        createdAt: Date.now(),
      };

      this.payments.set(payment.transactionRef, payment);
      return payment;
    }

    // Fallback: in-memory simulation
    const payment: UPIPayment = {
      id: `upay_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      upiId,
      amount,
      currency: 'INR' as CurrencyCode,
      status: 'pending',
      paymentLink: `upi://pay?pa=${upiId}&pn=Quant&am=${amount}&cu=INR&tn=${desc}`,
      transactionRef,
      createdAt: Date.now(),
    };

    this.payments.set(transactionRef, payment);
    return payment;
  }

  /** Verify a UPI payment by transaction reference */
  async verifyPayment(
    transactionRef: string,
  ): Promise<{ verified: boolean; payment?: UPIPayment }> {
    VerifyUPIPaymentSchema.parse({ transactionRef });

    const payment = this.payments.get(transactionRef);
    if (!payment) {
      return { verified: false };
    }

    if (this.liveMode && this.keySecret) {
      // In live mode, verify via Razorpay order status polling.
      // For now, mark as completed if payment exists (real implementation
      // would check order status via API or use webhook signature).
      if (payment.status === 'pending') {
        payment.status = 'completed';
      }
      return { verified: payment.status === 'completed', payment };
    }

    // FAIL CLOSED: without real Razorpay credentials we cannot confirm that the
    // UPI payment actually completed, so we never auto-complete a pending payment.
    // eslint-disable-next-line no-console
    console.warn(
      '[upi] verifyPayment called without RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET — failing closed',
    );
    return { verified: payment.status === 'completed', payment };
  }

  /**
   * Verify a UPI payment using HMAC-SHA256 signature (webhook-based verification).
   * Use this when receiving Razorpay webhook callbacks with a signature.
   */
  async verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ): Promise<boolean> {
    if (!this.keySecret) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return signature === expectedSignature;
  }

  /** Get payment status by transaction reference */
  async getPaymentStatus(ref: string): Promise<UPIPayment | null> {
    return this.payments.get(ref) ?? null;
  }

  /** Expire a pending payment (e.g., timeout after 15 minutes) */
  async expirePayment(transactionRef: string): Promise<UPIPayment | null> {
    const payment = this.payments.get(transactionRef);
    if (!payment) return null;

    if (payment.status === 'pending') {
      payment.status = 'expired';
    }
    return payment;
  }
}
