/**
 * Payment engine facade — direct payment-method + charge pipeline.
 *
 * Adopted from `@quant/payment` (consolidated into `@quant/payments` under K8).
 * This is the lightweight charge pipeline: validate → build transaction →
 * charge through a pluggable `PaymentProcessorBackend` (fail-closed) →
 * record. It complements the gateway services in this package (Stripe,
 * Razorpay, UPI, wallets) with a framework-neutral, processor-agnostic engine
 * that apps can drive directly.
 *
 * Note on naming: the interfaces here are `EnginePaymentMethod` /
 * `EngineTransaction` (not `PaymentMethod` / `Transaction`) because
 * `@quant/payments`' canonical `types.ts` already owns the Stripe-shaped
 * `PaymentMethod` / `Transaction` records. The engine's shapes are a simpler,
 * user-centric model and deliberately keep distinct names.
 */
import { randomUUID } from 'node:crypto';

import { PaymentValidationError } from './errors';
import { isValidCurrency } from './currency';

export interface EnginePaymentMethod {
  id: string;
  userId: string;
  type: 'card' | 'paypal' | 'crypto';
  details: Record<string, unknown>;
  isDefault: boolean;
}

export interface EngineTransaction {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  type: 'subscription' | 'one_time' | 'refund';
  status: 'pending' | 'completed' | 'failed';
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/** Request handed to a real payment processor. */
export interface ProcessorChargeRequest {
  userId: string;
  amount: number;
  currency: string;
  type: EngineTransaction['type'];
  metadata?: Record<string, unknown>;
}

/** Outcome returned by a real payment processor. */
export interface ProcessorChargeResult {
  status: 'completed' | 'failed';
  providerRef?: string;
}

/**
 * A real payment processor backend. Implementations talk to an external
 * processor (Stripe, Adyen, internal gateway, ...) and return a definitive
 * outcome. Throwing is treated as a failure (fail-closed).
 */
export interface PaymentProcessorBackend {
  charge(request: ProcessorChargeRequest): Promise<ProcessorChargeResult>;
}

/**
 * HTTP payment processor backend. Enabled by PAYMENT_PROCESSOR_URL.
 * Posts the charge to the configured processor and trusts only an explicit
 * `{ status: 'completed' }` response.
 */
export class HttpPaymentProcessorBackend implements PaymentProcessorBackend {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async charge(request: ProcessorChargeRequest): Promise<ProcessorChargeResult> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/charges`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      return { status: 'failed' };
    }
    const body = (await res.json()) as { status?: string; providerRef?: string };
    return {
      status: body.status === 'completed' ? 'completed' : 'failed',
      providerRef: body.providerRef,
    };
  }
}

export class PaymentEngine {
  private methods: Map<string, EnginePaymentMethod[]> = new Map();
  private transactions: EngineTransaction[] = [];
  private readonly processor: PaymentProcessorBackend | null;

  constructor(processor?: PaymentProcessorBackend) {
    this.processor = processor ?? PaymentEngine.createProcessorFromEnv();
  }

  private static createProcessorFromEnv(): PaymentProcessorBackend | null {
    const url = process.env['PAYMENT_PROCESSOR_URL'];
    if (url) {
      return new HttpPaymentProcessorBackend(url, process.env['PAYMENT_PROCESSOR_API_KEY']);
    }
    return null;
  }

  /** Whether a real payment processor is wired up. */
  isProcessorConfigured(): boolean {
    return this.processor !== null;
  }

  async addPaymentMethod(
    userId: string,
    method: Omit<EnginePaymentMethod, 'id' | 'userId'>,
  ): Promise<EnginePaymentMethod> {
    const newMethod: EnginePaymentMethod = {
      ...method,
      id: `pm_${randomUUID()}`,
      userId,
    };

    const userMethods = this.methods.get(userId) || [];
    userMethods.push(newMethod);
    this.methods.set(userId, userMethods);

    return newMethod;
  }

  async processPayment(
    userId: string,
    amount: number,
    currency: string,
    type: EngineTransaction['type'],
    metadata?: Record<string, unknown>,
  ): Promise<EngineTransaction> {
    // Validation guard (fail fast): reject invalid input BEFORE constructing or
    // persisting a Transaction and BEFORE calling processor.charge, so a rejected
    // call has no side effects. A negative amount is never valid for any type
    // (refunds are positive amounts with type='refund').
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new PaymentValidationError(
        `Invalid payment amount: ${String(amount)} (must be a finite, positive number)`,
        'INVALID_PAYMENT_AMOUNT',
      );
    }
    if (!isValidCurrency(currency)) {
      throw new PaymentValidationError(
        `Invalid payment currency: ${String(currency)} (must be a 3-letter ISO-4217 code)`,
        'INVALID_PAYMENT_CURRENCY',
      );
    }

    const transaction: EngineTransaction = {
      id: `tx_${randomUUID()}`,
      userId,
      amount,
      currency,
      type,
      status: 'pending',
      metadata,
      createdAt: new Date(),
    };

    if (this.processor) {
      try {
        const result = await this.processor.charge({ userId, amount, currency, type, metadata });
        transaction.status = result.status;
        if (result.providerRef) {
          transaction.metadata = { ...(metadata ?? {}), providerRef: result.providerRef };
        }
      } catch (error) {
        // FAIL CLOSED: a processor error must never be treated as a success.
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(`[payment-engine] processor charge failed, marking failed: ${message}`);
        transaction.status = 'failed';
      }
    } else {
      // FAIL CLOSED: with no real processor configured we never confirm a charge.
      // eslint-disable-next-line no-console
      console.warn(
        '[payment-engine] no payment processor configured (PAYMENT_PROCESSOR_URL) — marking payment failed',
      );
      transaction.status = 'failed';
    }

    this.transactions.push(transaction);
    return transaction;
  }

  async getUserTransactions(userId: string): Promise<EngineTransaction[]> {
    return this.transactions.filter((t) => t.userId === userId);
  }

  async getUserPaymentMethods(userId: string): Promise<EnginePaymentMethod[]> {
    return this.methods.get(userId) || [];
  }
}

export const paymentEngine = new PaymentEngine();
