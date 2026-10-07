// ============================================================================
// Payments - Stripe Payment Gateway Service
// Real Stripe SDK integration with Zod validation
// ============================================================================

import Stripe from 'stripe';
import { z } from 'zod';

/**
 * Zod schema for createPaymentIntent input validation
 */
export const CreatePaymentIntentSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().min(3).max(3),
  customerId: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

/**
 * Zod schema for createCustomer input validation
 */
export const CreateCustomerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  metadata: z.record(z.string(), z.string()).optional(),
});

/**
 * Zod schema for refund input validation
 */
export const RefundSchema = z.object({
  paymentIntentId: z.string().min(1),
  amount: z.number().int().positive().optional(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
});

/**
 * Zod schema for createSubscription input validation
 */
export const CreateSubscriptionSchema = z.object({
  customerId: z.string().min(1),
  priceId: z.string().min(1),
  metadata: z.record(z.string(), z.string()).optional(),
});

/** Configuration for StripeGateway */
export interface StripeGatewayConfig {
  secretKey: string;
  webhookSecret: string;
  apiVersion?: string;
}

/**
 * StripeGateway - Real Stripe SDK integration
 *
 * Provides a validated interface to the Stripe API for payment intents,
 * customers, refunds, subscriptions, and webhook verification.
 */
export class StripeGateway {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(config: StripeGatewayConfig) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
    });
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Create a Stripe PaymentIntent
   * @param params - Validated payment intent parameters
   * @returns The created PaymentIntent
   */
  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    customerId?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.PaymentIntent> {
    const validated = CreatePaymentIntentSchema.parse(params);

    const intentParams: Stripe.PaymentIntentCreateParams = {
      amount: validated.amount,
      currency: validated.currency,
      metadata: validated.metadata,
    };

    if (validated.customerId) {
      intentParams.customer = validated.customerId;
    }

    return this.stripe.paymentIntents.create(intentParams);
  }

  /**
   * Create a Stripe Customer
   * @param params - Validated customer parameters
   * @returns The created Customer
   */
  async createCustomer(params: {
    email: string;
    name: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Customer> {
    const validated = CreateCustomerSchema.parse(params);

    return this.stripe.customers.create({
      email: validated.email,
      name: validated.name,
      metadata: validated.metadata,
    });
  }

  /**
   * Issue a refund for a PaymentIntent
   * @param params - Validated refund parameters
   * @returns The created Refund
   */
  async refund(params: {
    paymentIntentId: string;
    amount?: number;
    reason?: string;
  }): Promise<Stripe.Refund> {
    const validated = RefundSchema.parse(params);

    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: validated.paymentIntentId,
    };

    if (validated.amount !== undefined) {
      refundParams.amount = validated.amount;
    }

    if (validated.reason) {
      refundParams.reason = validated.reason;
    }

    return this.stripe.refunds.create(refundParams);
  }

  /**
   * Create a Stripe Subscription
   * @param params - Validated subscription parameters
   * @returns The created Subscription
   */
  async createSubscription(params: {
    customerId: string;
    priceId: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    const validated = CreateSubscriptionSchema.parse(params);

    return this.stripe.subscriptions.create({
      customer: validated.customerId,
      items: [{ price: validated.priceId }],
      metadata: validated.metadata,
    });
  }

  /**
   * Verify and construct a Stripe webhook event
   * @param payload - Raw request body
   * @param signature - Stripe-Signature header value
   * @returns The verified Stripe Event
   */
  verifyWebhook(payload: string | Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }
}
