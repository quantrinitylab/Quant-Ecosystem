import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  PaymentEngine,
  type PaymentProcessorBackend,
  type ProcessorChargeRequest,
  type ProcessorChargeResult,
  type EngineTransaction,
} from '../payment-engine';
import { PaymentValidationError } from '../errors';

/**
 * Property-based tests for the payment-amount-validation fix.
 *
 * Task 1 (this file, "bug condition" block): Property 1 — for every input that
 * satisfies the bug condition (non-finite/non-positive amount OR malformed
 * currency), the engine must reject with a PaymentValidationError and produce no
 * side effects (no processor.charge, nothing persisted). These MUST FAIL on the
 * unfixed engine.
 */

class SpyProcessor implements PaymentProcessorBackend {
  chargeCallCount = 0;
  readonly requests: ProcessorChargeRequest[] = [];

  async charge(request: ProcessorChargeRequest): Promise<ProcessorChargeResult> {
    this.chargeCallCount++;
    this.requests.push(request);
    return { status: 'completed' };
  }
}

const typeArb: fc.Arbitrary<EngineTransaction['type']> = fc.constantFrom(
  'one_time',
  'subscription',
  'refund',
);

const validCurrencyArb: fc.Arbitrary<string> = fc.constantFrom(
  'USD',
  'EUR',
  'INR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
);

// Amounts that are non-finite OR not strictly positive (the bug condition for amount).
const invalidAmountArb: fc.Arbitrary<number> = fc.oneof(
  fc.double({ max: 0, noNaN: true, noDefaultInfinity: true }), // <= 0, finite
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
);

// Strings that are NOT well-formed 3-letter uppercase currency codes.
const invalidCurrencyArb: fc.Arbitrary<string> = fc
  .oneof(
    fc.constantFrom('', 'us', 'usd', 'US$', 'USDT', 'U', 'USDD', '12', 'usD', 'U S', ' US'),
    fc.string(),
  )
  .filter((s) => !/^[A-Z]{3}$/.test(s));

// Valid, strictly-positive finite amounts (used when isolating the currency defect).
const validAmountArb: fc.Arbitrary<number> = fc
  .double({ min: Number.MIN_VALUE, max: 1e12, noNaN: true, noDefaultInfinity: true })
  .filter((n) => Number.isFinite(n) && n > 0);

describe('PaymentEngine.processPayment — bug condition properties (Property 1)', () => {
  it('rejects every invalid amount (with a valid currency) and produces no side effects', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidAmountArb,
        validCurrencyArb,
        typeArb,
        async (amount, currency, type) => {
          const spy = new SpyProcessor();
          const engine = new PaymentEngine(spy);

          await expect(engine.processPayment('u1', amount, currency, type)).rejects.toBeInstanceOf(
            PaymentValidationError,
          );
          expect(spy.chargeCallCount).toBe(0);
          expect(await engine.getUserTransactions('u1')).toHaveLength(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('rejects every invalid currency (with a valid amount) and produces no side effects', async () => {
    await fc.assert(
      fc.asyncProperty(
        validAmountArb,
        invalidCurrencyArb,
        typeArb,
        async (amount, currency, type) => {
          const spy = new SpyProcessor();
          const engine = new PaymentEngine(spy);

          await expect(engine.processPayment('u1', amount, currency, type)).rejects.toBeInstanceOf(
            PaymentValidationError,
          );
          expect(spy.chargeCallCount).toBe(0);
          expect(await engine.getUserTransactions('u1')).toHaveLength(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 2 — Preservation properties (Property 2)
//
// For every non-buggy input (finite, strictly-positive amount + valid currency,
// any type), the engine must preserve today's behavior across each processor
// path. These MUST PASS on the unfixed engine and continue to pass after the fix.
// ---------------------------------------------------------------------------
describe('PaymentEngine.processPayment — preservation properties (Property 2)', () => {
  it('processor-completed: records completed, persists once, preserves amount/currency/type', async () => {
    await fc.assert(
      fc.asyncProperty(
        validAmountArb,
        validCurrencyArb,
        typeArb,
        fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        async (amount, currency, type, providerRef) => {
          const outcome: ProcessorChargeResult = providerRef
            ? { status: 'completed', providerRef }
            : { status: 'completed' };

          const engine = new PaymentEngine(new SpyCompletedProcessor(outcome));
          const tx = await engine.processPayment('u1', amount, currency, type);

          expect(tx.status).toBe('completed');
          expect(tx.amount).toBe(amount);
          expect(tx.currency).toBe(currency);
          expect(tx.type).toBe(type);
          if (providerRef) {
            expect((tx.metadata as Record<string, unknown>)?.['providerRef']).toBe(providerRef);
          }
          expect(await engine.getUserTransactions('u1')).toHaveLength(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('processor-throw: valid inputs fail closed (status failed) and persist', async () => {
    await fc.assert(
      fc.asyncProperty(
        validAmountArb,
        validCurrencyArb,
        typeArb,
        async (amount, currency, type) => {
          const engine = new PaymentEngine(new ThrowingProcessor());
          const tx = await engine.processPayment('u1', amount, currency, type);

          expect(tx.status).toBe('failed');
          expect(await engine.getUserTransactions('u1')).toHaveLength(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('processor-declined: valid inputs fail closed (status failed)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validAmountArb,
        validCurrencyArb,
        typeArb,
        async (amount, currency, type) => {
          const engine = new PaymentEngine(new SpyCompletedProcessor({ status: 'failed' }));
          const tx = await engine.processPayment('u1', amount, currency, type);

          expect(tx.status).toBe('failed');
        },
      ),
      { numRuns: 100 },
    );
  });
});

class SpyCompletedProcessor implements PaymentProcessorBackend {
  constructor(private readonly outcome: ProcessorChargeResult) {}
  async charge(_request: ProcessorChargeRequest): Promise<ProcessorChargeResult> {
    return this.outcome;
  }
}

class ThrowingProcessor implements PaymentProcessorBackend {
  async charge(_request: ProcessorChargeRequest): Promise<ProcessorChargeResult> {
    throw new Error('processor unavailable');
  }
}
