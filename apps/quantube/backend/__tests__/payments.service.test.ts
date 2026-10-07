// ============================================================================
// Task 13.2 — payments wiring unit tests (test mode, NO live key)
// ============================================================================
//
// Proves the payments seam satisfies the resolved design Open Question 3: the
// Stripe gateway is sourced from env secrets (Req 7.6), CONSTRUCTS without a
// live key (TEST MODE placeholders), and its webhook signature verification +
// payment-intent validation are exercisable without any live key / network.
//
// The Stripe webhook signature is reproduced here with node:crypto using
// Stripe's documented scheme (`t=<ts>,v1=HMAC_SHA256("<ts>.<payload>", secret)`)
// so the test depends on no live key and never reaches the network.

import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPaymentsService, resolveStripeConfig } from '../routes/payments';

/** Build a valid Stripe-Signature header for `payload` signed with `secret`. */
function stripeSignature(payload: string, secret: string, ts = Math.floor(Date.now() / 1000)) {
  const signedPayload = `${ts}.${payload}`;
  const sig = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  return `t=${ts},v1=${sig}`;
}

const SECRET_KEY = process.env['STRIPE_SECRET_KEY'];
const WEBHOOK_SECRET = process.env['STRIPE_WEBHOOK_SECRET'];

afterEach(() => {
  // Restore the original env so tests don't leak placeholder secrets.
  if (SECRET_KEY === undefined) delete process.env['STRIPE_SECRET_KEY'];
  else process.env['STRIPE_SECRET_KEY'] = SECRET_KEY;
  if (WEBHOOK_SECRET === undefined) delete process.env['STRIPE_WEBHOOK_SECRET'];
  else process.env['STRIPE_WEBHOOK_SECRET'] = WEBHOOK_SECRET;
});

describe('resolveStripeConfig (Req 7.6 — secrets from env, test-mode default)', () => {
  beforeEach(() => {
    delete process.env['STRIPE_SECRET_KEY'];
    delete process.env['STRIPE_WEBHOOK_SECRET'];
  });

  it('falls back to non-live TEST placeholders when env is unset (no live key)', () => {
    const cfg = resolveStripeConfig();
    expect(cfg.testMode).toBe(true);
    expect(cfg.secretKey.startsWith('sk_live_')).toBe(false);
    expect(cfg.webhookSecret.length).toBeGreaterThan(0);
  });

  it('reads the secret from the environment when present', () => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_from_env';
    process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_test_from_env';
    const cfg = resolveStripeConfig();
    expect(cfg.secretKey).toBe('sk_test_from_env');
    expect(cfg.webhookSecret).toBe('whsec_test_from_env');
    expect(cfg.testMode).toBe(true);
  });

  it('flags live mode only for an sk_live_ key', () => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_live_xyz';
    expect(resolveStripeConfig().testMode).toBe(false);
  });
});

describe('createPaymentsService (constructs without a live key)', () => {
  beforeEach(() => {
    delete process.env['STRIPE_SECRET_KEY'];
    delete process.env['STRIPE_WEBHOOK_SECRET'];
  });

  it('constructs the Stripe gateway in test mode without throwing', () => {
    const service = createPaymentsService();
    expect(service.testMode).toBe(true);
    expect(service.gateway).toBeDefined();
    expect(typeof service.gateway.verifyWebhook).toBe('function');
  });

  it('validates payment-intent input without a live key (Zod, no network)', async () => {
    const service = createPaymentsService();
    await expect(
      service.gateway.createPaymentIntent({ amount: -100, currency: 'usd' }),
    ).rejects.toThrow();
    await expect(
      service.gateway.createPaymentIntent({ amount: 1000, currency: 'us' }),
    ).rejects.toThrow();
  });
});

describe('webhook signature verification (test mode)', () => {
  beforeEach(() => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_known';
    process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_test_known';
  });

  it('accepts a payload signed with the configured webhook secret', () => {
    const service = createPaymentsService();
    const payload = JSON.stringify({
      id: 'evt_test_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_1' } },
    });
    const header = stripeSignature(payload, 'whsec_test_known');

    const event = service.gateway.verifyWebhook(payload, header);
    expect(event.id).toBe('evt_test_1');
    expect(event.type).toBe('payment_intent.succeeded');
  });

  it('rejects a payload whose signature does not match the secret', () => {
    const service = createPaymentsService();
    const payload = JSON.stringify({ id: 'evt_test_2', type: 'payment_intent.succeeded' });
    const badHeader = stripeSignature(payload, 'whsec_WRONG_secret');

    expect(() => service.gateway.verifyWebhook(payload, badHeader)).toThrow();
  });

  it('rejects a tampered payload under a previously valid signature', () => {
    const service = createPaymentsService();
    const payload = JSON.stringify({ id: 'evt_test_3', type: 'payment_intent.succeeded' });
    const header = stripeSignature(payload, 'whsec_test_known');
    const tampered = payload.replace('evt_test_3', 'evt_attacker');

    expect(() => service.gateway.verifyWebhook(tampered, header)).toThrow();
  });
});
