import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PaymentEngine,
  type EnginePaymentMethod,
  type PaymentProcessorBackend,
  type ProcessorChargeRequest,
  type ProcessorChargeResult,
  type EngineTransaction,
} from '../payment-engine';
import { PaymentValidationError } from '../errors';

/**
 * A spy payment-processor backend: records every `charge` call so tests can
 * assert whether the engine reached the processor, and returns a configurable
 * outcome (defaults to a successful charge).
 */
class SpyProcessor implements PaymentProcessorBackend {
  chargeCallCount = 0;
  readonly requests: ProcessorChargeRequest[] = [];

  constructor(
    private readonly outcome: ProcessorChargeResult | (() => ProcessorChargeResult) = {
      status: 'completed',
    },
  ) {}

  async charge(request: ProcessorChargeRequest): Promise<ProcessorChargeResult> {
    this.chargeCallCount++;
    this.requests.push(request);
    return typeof this.outcome === 'function' ? this.outcome() : this.outcome;
  }
}

// ---------------------------------------------------------------------------
// Task 1 — Bug condition exploration (Property 1)
//
// Each case here encodes the EXPECTED (fixed) behavior: an invalid amount or
// currency must be rejected with a typed PaymentValidationError, BEFORE any
// processor.charge call and BEFORE any transaction is persisted.
//
// On the UNFIXED engine these MUST FAIL (no throw; charge called; transaction
// persisted) — that failure confirms the bug exists.
// ---------------------------------------------------------------------------
describe('PaymentEngine.processPayment — bug condition (invalid amount/currency rejected with no side effects)', () => {
  interface BugCase {
    readonly name: string;
    readonly amount: number;
    readonly currency: string;
    readonly type: EngineTransaction['type'];
  }

  const bugCases: BugCase[] = [
    { name: 'negative amount', amount: -100, currency: 'USD', type: 'one_time' },
    { name: 'zero amount', amount: 0, currency: 'USD', type: 'one_time' },
    { name: 'NaN amount', amount: Number.NaN, currency: 'USD', type: 'subscription' },
    {
      name: 'Infinity amount',
      amount: Number.POSITIVE_INFINITY,
      currency: 'USD',
      type: 'one_time',
    },
    {
      name: '-Infinity amount',
      amount: Number.NEGATIVE_INFINITY,
      currency: 'USD',
      type: 'one_time',
    },
    { name: 'empty currency', amount: 100, currency: '', type: 'one_time' },
    { name: 'lowercase 2-letter currency', amount: 100, currency: 'us', type: 'one_time' },
    { name: 'lowercase 3-letter currency', amount: 100, currency: 'usd', type: 'one_time' },
    { name: 'symbol in currency', amount: 100, currency: 'US$', type: 'one_time' },
    { name: '4-letter currency', amount: 100, currency: 'USDT', type: 'one_time' },
    { name: 'negative refund', amount: -50, currency: 'USD', type: 'refund' },
  ];

  for (const c of bugCases) {
    it(`rejects ${c.name} with a PaymentValidationError and no side effects`, async () => {
      const spy = new SpyProcessor({ status: 'completed' });
      const engine = new PaymentEngine(spy);

      // (a) the call throws a PaymentValidationError
      await expect(
        engine.processPayment('u1', c.amount, c.currency, c.type),
      ).rejects.toBeInstanceOf(PaymentValidationError);

      // (b) the processor was never reached
      expect(spy.chargeCallCount).toBe(0);

      // (c) nothing was persisted for this call
      const txns = await engine.getUserTransactions('u1');
      expect(txns).toHaveLength(0);
    });
  }

  it('the documented counterexample processPayment("u1", -100, "USD", "one_time") is rejected', async () => {
    const spy = new SpyProcessor({ status: 'completed' });
    const engine = new PaymentEngine(spy);

    await expect(engine.processPayment('u1', -100, 'USD', 'one_time')).rejects.toBeInstanceOf(
      PaymentValidationError,
    );
    expect(spy.chargeCallCount).toBe(0);
    expect(await engine.getUserTransactions('u1')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 2 — Preservation baseline (Property 2)
//
// Valid inputs (finite, strictly-positive amount + well-formed currency, any
// type incl. refund) must behave exactly as today across every processor path.
// These MUST PASS on the unfixed engine (capturing the baseline) and continue to
// pass after the fix.
// ---------------------------------------------------------------------------
describe('PaymentEngine.processPayment — preservation (valid inputs behave identically to today)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('processor-completed without providerRef: records completed, metadata untouched', async () => {
    const spy = new SpyProcessor({ status: 'completed' });
    const engine = new PaymentEngine(spy);

    const tx = await engine.processPayment('u1', 100, 'USD', 'one_time', { note: 'hi' });

    expect(spy.chargeCallCount).toBe(1);
    expect(tx.status).toBe('completed');
    expect(tx.amount).toBe(100);
    expect(tx.currency).toBe('USD');
    expect(tx.type).toBe('one_time');
    expect(tx.metadata).toEqual({ note: 'hi' });
    expect(tx.id.startsWith('tx_')).toBe(true);
    expect(tx.createdAt).toBeInstanceOf(Date);
    expect(await engine.getUserTransactions('u1')).toHaveLength(1);
  });

  it('processor-completed with providerRef: merges providerRef into metadata', async () => {
    const spy = new SpyProcessor({ status: 'completed', providerRef: 'pref_123' });
    const engine = new PaymentEngine(spy);

    const tx = await engine.processPayment('u1', 250, 'EUR', 'subscription', { plan: 'pro' });

    expect(tx.status).toBe('completed');
    expect(tx.metadata).toEqual({ plan: 'pro', providerRef: 'pref_123' });
  });

  it('processor-throw: fails closed (status failed), still persisted', async () => {
    const spy = new SpyProcessor(() => {
      throw new Error('gateway timeout');
    });
    const engine = new PaymentEngine(spy);

    const tx = await engine.processPayment('u1', 100, 'USD', 'one_time');

    expect(spy.chargeCallCount).toBe(1);
    expect(tx.status).toBe('failed');
    expect(await engine.getUserTransactions('u1')).toHaveLength(1);
  });

  it('processor-declined: fails closed (status failed)', async () => {
    const spy = new SpyProcessor({ status: 'failed' });
    const engine = new PaymentEngine(spy);

    const tx = await engine.processPayment('u1', 100, 'USD', 'one_time');

    expect(tx.status).toBe('failed');
  });

  it('no-processor configured: fails closed (status failed)', async () => {
    vi.stubEnv('PAYMENT_PROCESSOR_URL', '');
    const engine = new PaymentEngine();

    const tx = await engine.processPayment('u1', 100, 'USD', 'one_time');

    expect(engine.isProcessorConfigured()).toBe(false);
    expect(tx.status).toBe('failed');
    expect(await engine.getUserTransactions('u1')).toHaveLength(1);
  });

  it('refund: a valid positive refund is processed exactly as today', async () => {
    const spy = new SpyProcessor({ status: 'completed', providerRef: 'rfnd_1' });
    const engine = new PaymentEngine(spy);

    const tx = await engine.processPayment('u1', 50, 'USD', 'refund');

    expect(spy.chargeCallCount).toBe(1);
    expect(tx.type).toBe('refund');
    expect(tx.status).toBe('completed');
    expect(tx.metadata).toEqual({ providerRef: 'rfnd_1' });
  });

  it('unrelated operations are unaffected: addPaymentMethod / getUserPaymentMethods / getUserTransactions', async () => {
    const engine = new PaymentEngine(new SpyProcessor({ status: 'completed' }));

    const method: Omit<EnginePaymentMethod, 'id' | 'userId'> = {
      type: 'card',
      details: { last4: '4242' },
      isDefault: true,
    };
    const added = await engine.addPaymentMethod('u1', method);

    expect(added.id.startsWith('pm_')).toBe(true);
    expect(added.userId).toBe('u1');
    expect(added.type).toBe('card');

    expect(await engine.getUserPaymentMethods('u1')).toEqual([added]);
    expect(await engine.getUserPaymentMethods('other')).toEqual([]);
    expect(await engine.getUserTransactions('u1')).toEqual([]);
  });
});
