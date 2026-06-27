// @vitest-environment node
// ============================================================================
// Payment rails — multi-provider top-up registry (fail-closed)
// ============================================================================
//
// Verifies Req 2 / Correctness Property 4:
//   * A rail with no webhook secret + no session creator is registered but
//     reports isConfigured() === false and FAILS CLOSED on checkout.
//   * A fully-wired rail creates a provider-hosted checkout handle (no fake).
//   * Webhook verification is real HMAC-SHA256 (constant-time); a tampered
//     payload or wrong secret is rejected.
//   * The registry lists only configured rails as available top-up methods.

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  ConfigurablePaymentProvider,
  PaymentProviderRegistry,
  createPaymentProvidersFromEnv,
  hmacSha256Verify,
} from '../index';

describe('ConfigurablePaymentProvider — fail closed when unconfigured', () => {
  it('reports not-configured and rejects checkout with PROVIDER_NOT_CONFIGURED', async () => {
    const p = new ConfigurablePaymentProvider({ name: 'paypal' });
    expect(p.isConfigured()).toBe(false);
    await expect(
      p.createCheckoutSession({ ownerRef: 'u1', kind: 'topup', credits: 100 }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'PROVIDER_NOT_CONFIGURED' });
  });

  it('a secret without a session creator is still not configured', () => {
    const p = new ConfigurablePaymentProvider({ name: 'crypto', webhookSecret: 's' });
    expect(p.isConfigured()).toBe(false);
  });

  it('creates a provider-hosted handle when fully wired', async () => {
    const p = new ConfigurablePaymentProvider({
      name: 'stripe',
      webhookSecret: 'whsec',
      createSession: (input) => ({
        sessionId: `cs_${input.ownerRef}`,
        url: `https://pay.stripe.test/cs_${input.ownerRef}`,
        provider: 'stripe',
      }),
    });
    expect(p.isConfigured()).toBe(true);
    const handle = await p.createCheckoutSession({ ownerRef: 'u1', kind: 'topup', credits: 100 });
    expect(handle.url).toContain('https://pay.stripe.test/');
    expect(handle.provider).toBe('stripe');
  });

  it('rejects a session creator that returns an invalid handle', async () => {
    const p = new ConfigurablePaymentProvider({
      name: 'stripe',
      webhookSecret: 'whsec',
      createSession: () => ({ sessionId: '', url: '', provider: 'stripe' }),
    });
    await expect(
      p.createCheckoutSession({ ownerRef: 'u1', kind: 'topup', credits: 100 }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'PROVIDER_BAD_RESPONSE' });
  });
});

describe('webhook signature verification (real HMAC-SHA256)', () => {
  it('accepts a correctly-signed payload and rejects tampering / wrong secret', () => {
    const secret = 'whsec_123';
    const payload = JSON.stringify({ providerEventId: 'evt_1', type: 'payment_success' });
    const sig = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

    expect(hmacSha256Verify(payload, sig, secret)).toBe(true);
    expect(hmacSha256Verify(payload + 'x', sig, secret)).toBe(false);
    expect(hmacSha256Verify(payload, sig, 'wrong')).toBe(false);

    const p = new ConfigurablePaymentProvider({ name: 'razorpay', webhookSecret: secret });
    expect(p.verifyWebhookSignature(payload, sig, secret)).toBe(true);
    // No secret configured anywhere => fail closed.
    const bare = new ConfigurablePaymentProvider({ name: 'razorpay' });
    expect(bare.verifyWebhookSignature(payload, sig, '')).toBe(false);
  });
});

describe('PaymentProviderRegistry / createPaymentProvidersFromEnv', () => {
  it('registers all four rails; only fully-wired rails are configured', () => {
    const registry = createPaymentProvidersFromEnv(
      { STRIPE_WEBHOOK_SECRET: 'a', RAZORPAY_WEBHOOK_SECRET: 'b' },
      {
        createSession: {
          stripe: (i) => ({ sessionId: 's', url: 'https://x/s', provider: 'stripe' }),
          // razorpay has a secret but NO creator -> not configured.
        },
      },
    );
    expect(registry.rails().sort()).toEqual(['crypto', 'paypal', 'razorpay', 'stripe']);
    expect(registry.configuredRails()).toEqual(['stripe']);
    expect(registry.has('crypto')).toBe(true);
  });

  it('getConfigured fails closed for an unconfigured rail and throws for unknown', () => {
    const registry = createPaymentProvidersFromEnv({}, {});
    expect(() => registry.getConfigured('paypal')).toThrowError(/not configured/);
    expect(() => registry.get('venmo')).toThrowError(/Unknown payment rail/);
  });
});
