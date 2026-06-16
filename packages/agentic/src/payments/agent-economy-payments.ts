// ============================================================================
// Agentic - Agent Economy Payments
// ============================================================================
//
// MONEY PATH — fails closed.
//
// Processing a payment moves real money, so this service NEVER reports a payment
// as completed unless a real payment backend is configured and confirms it:
//   - When a payment backend is configured (AGENT_PAYMENTS_URL, optionally
//     AGENT_PAYMENTS_API_KEY) the charge is processed against the real service.
//   - When NO backend is configured, `processPayment` FAILS CLOSED: it returns a
//     `failed` transaction and does not credit processed totals.
//   - When the backend errors (or declines), the transaction is recorded as
//     `failed`. Errors are logged as warnings (never silently swallowed).
// This mirrors the fail-closed posture of packages/payments (quant-pro.service).

import { EventEmitter } from 'events';
import { AgentEconomy } from '../economy/agent-economy';

export interface PaymentTransaction {
  id: string;
  buyer: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: Date;
  listingId: string;
}

/** Outcome of charging a payment against the real payment backend. */
export interface ChargeResult {
  id: string;
  status: 'completed' | 'failed';
}

/**
 * Pluggable payment backend that charges a real payment processor. Tests can
 * supply a fake to exercise the real-mode path without touching the network.
 */
export interface PaymentBackend {
  charge(input: {
    buyer: string;
    amount: number;
    currency: string;
    listingId: string;
  }): Promise<ChargeResult>;
}

/**
 * Real payment backend backed by a configured HTTP service. Enabled by
 * AGENT_PAYMENTS_URL (optionally AGENT_PAYMENTS_API_KEY).
 */
export class HttpPaymentBackend implements PaymentBackend {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async charge(input: {
    buyer: string;
    amount: number;
    currency: string;
    listingId: string;
  }): Promise<ChargeResult> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/charges`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error(`payment service responded ${res.status}`);
    }
    const body = (await res.json()) as { id?: string; status?: string };
    return {
      id: body.id ?? `pay-${Date.now()}`,
      status: body.status === 'completed' ? 'completed' : 'failed',
    };
  }
}

export class AgentEconomyPayments extends EventEmitter {
  private transactions: PaymentTransaction[] = [];
  private totalProcessed: number = 0;
  private readonly backend: PaymentBackend | null;

  /**
   * @param backend Optional explicit backend (primarily for tests). When
   *   omitted, a real backend is constructed from environment configuration.
   */
  constructor(_economy: AgentEconomy, backend?: PaymentBackend) {
    super();
    this.backend = backend ?? AgentEconomyPayments.createBackendFromEnv();
  }

  private static createBackendFromEnv(): PaymentBackend | null {
    const url = process.env['AGENT_PAYMENTS_URL'];
    if (url) {
      return new HttpPaymentBackend(url, process.env['AGENT_PAYMENTS_API_KEY']);
    }
    return null;
  }

  /** Whether a real payment backend is wired up. */
  isBackendConfigured(): boolean {
    return this.backend !== null;
  }

  async processPayment(
    buyer: string,
    amount: number,
    listingId: string,
    currency: string = 'USD',
  ): Promise<PaymentTransaction> {
    const transaction: PaymentTransaction = {
      id: `pay-${Date.now()}`,
      buyer,
      amount,
      currency,
      status: 'pending',
      timestamp: new Date(),
      listingId,
    };

    // FAIL CLOSED: without a real payment backend we MUST NOT confirm a payment.
    if (!this.backend) {
      // eslint-disable-next-line no-console
      console.warn(
        '[agent-economy-payments] payment backend not configured (AGENT_PAYMENTS_URL) — failing closed',
      );
      transaction.status = 'failed';
      this.transactions.push(transaction);
      this.emit('payment:failed', transaction);
      return transaction;
    }

    let charge: ChargeResult;
    try {
      charge = await this.backend.charge({ buyer, amount, currency, listingId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(
        `[agent-economy-payments] charge failed for ${listingId}, recording failed payment: ${message}`,
      );
      transaction.status = 'failed';
      this.transactions.push(transaction);
      this.emit('payment:failed', transaction);
      return transaction;
    }

    transaction.id = charge.id;
    transaction.status = charge.status;
    this.transactions.push(transaction);

    if (transaction.status === 'completed') {
      this.totalProcessed += amount;
      this.emit('payment:completed', transaction);
    } else {
      this.emit('payment:failed', transaction);
    }

    return transaction;
  }

  getPaymentStats() {
    return {
      totalTransactions: this.transactions.length,
      totalProcessed: this.totalProcessed,
      successRate:
        this.transactions.filter((t) => t.status === 'completed').length /
          this.transactions.length || 0,
    };
  }
}
