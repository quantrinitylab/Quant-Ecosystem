// @vitest-environment node
// ============================================================================
// quantmax — Stage-6 engine seam tests (Task 14.5 / DoD-2 & DoD-4)
// ============================================================================
//
// Traverses the real integration seam for the engines wired into quantmax in
// Tasks 14.2 (feed/recommendation stack) and 14.4 (payments + quant-commerce +
// quant-economy), using Fastify `inject()` against the app's REAL `buildApp()`
// (apps/quantmax/backend/app.ts). No network, no mocked server-core: the global
// `onRequest` auth hook from `createApp()` and the decorated engines are
// exercised exactly as in production. Engines under test:
//
//   - the feed stack (14.2) — @quant/recommendations, @quant/ranking,
//     @quant/ml-pipeline, @quant/ml-runtime, @quant/triton-client composed into
//     `fastify.feed` (backend/lib/feed-engines.ts), routes under `/feed`.
//   - @quant/payments       (14.4) — `fastify.payments` (real StripeGateway)
//     under `/payments`, plus the signature-verified Stripe webhook.
//   - @quant/quant-commerce (14.4) — `fastify.commerce`, routes under `/commerce`.
//   - @quant/quant-economy  (14.4) — `fastify.economy`, routes under `/economy`.
//
// Like the quantneon/quantube harnesses (and UNLIKE quantai, whose buildApp()
// has phantom-package breakage), quantmax's buildApp() loads CLEANLY: every
// `@quant/*` it imports is a real workspace package declared in
// apps/quantmax/package.json. This test builds the app via its OWN buildApp()
// and does NOT replicate the wiring (confirmed by the `buildApp loads` assertion).
//
// For each mutating surface: unauth -> 401, valid JWT w/o scope -> 403, valid
// JWT w/ scope -> 2xx (engine reached). For reads: unauth -> 401, authed -> 2xx.
//
// PUBLIC_PATHS prefix-collision check: quantmax's seam prefixes `/feed`,
// `/payments`, `/commerce`, `/economy` do NOT equal/prefix any allowlist entry
// (/health,/healthz,/ready,/readyz,/live,/livez,/metrics) — every read surface
// is asserted 401 unauthenticated to prove no silent auth-bypass.
//
// JWTs are HS256-signed with node:crypto (no new dependency). The Stripe webhook
// secret is set at MODULE LOAD (before buildApp constructs the payments service)
// so the gateway's verifyWebhook uses the SAME secret we sign test events with —
// signature verification is local crypto (Req 7.6), no live key needed.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

// The Stripe webhook secret MUST be set BEFORE buildApp() constructs the
// payments service (createPaymentsService reads it from env at boot). Setting it
// at module load — which runs before `beforeAll` — guarantees the gateway's
// verifyWebhook uses the SAME secret we sign test events with below. No live
// Stripe key is needed: signature verification is local crypto (Req 7.6).
const WEBHOOK_SECRET = 'whsec_test_seam_secret_value';
process.env['STRIPE_WEBHOOK_SECRET'] = WEBHOOK_SECRET;

const testConfig: AppConfig = {
  ...getConfig(),
  port: 3008,
  host: '0.0.0.0',
  logLevel: 'silent',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

let jtiCounter = 0;
function signToken(scopes: string[], sub = 'user-123'): string {
  jtiCounter += 1;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: testConfig.jwtIssuer,
      aud: testConfig.jwtAudience,
      sub,
      jti: `seam-${jtiCounter}`,
      iat: now,
      exp: now + 3600,
      email: 'max@example.com',
      username: 'maxuser',
      role: 'user',
      scopes,
      app: 'quantmax',
    }),
  );
  const signature = base64url(
    createHmac('sha256', testConfig.jwtSecret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

// Build a Stripe `Stripe-Signature` header for a raw payload using the scheme
// `stripe.webhooks.constructEvent` verifies: `t=<ts>,v1=<hmacSHA256 hex of
// "<ts>.<payload>">`. node:crypto only — no live key.
function stripeSignatureHeader(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const feedId = 'max-feed-1';
const candidate = (id: string, upvotes: number) => ({
  id,
  content: `clip ${id}`,
  authorId: 'author-1',
  timestamp: Date.now(),
  upvotes,
  shares: 1,
  replies: 0,
  replyQuality: 0.5,
  authorReputation: 0.5,
});

// ===========================================================================
// Harness sanity.
// ===========================================================================
describe('quantmax buildApp() seam harness', () => {
  it('buildApp loads and decorates the Stage-6 engines', () => {
    expect(app).toBeTruthy();
    expect(app.feed).toBeTruthy();
    expect(app.payments).toBeTruthy();
    expect(app.commerce).toBeTruthy();
    expect(app.economy).toBeTruthy();
  });
});

// ===========================================================================
// feed stack (Task 14.2) — seed candidates (feed:write), drive composed feed
// (recommendations -> ranking), ml-pipeline inference, ml-runtime + triton reads.
// ===========================================================================
describe('seam: feed POST /feed/candidates (mutating, feed:write)', () => {
  const url = '/feed/candidates';
  const payload = {
    feedId,
    items: [candidate('c1', 10), candidate('c2', 5), candidate('c3', 1)],
    replace: true,
  };

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `feed:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['feed:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `feed:write` -> 201 and seeds the recommendation candidate pool', async () => {
    const token = signToken(['feed:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ success: true, data: { feedId, poolSize: 3 } });
  });
});

describe('seam: feed GET /feed (composed read: recommendations -> ranking)', () => {
  const url = `/feed?feedId=${feedId}&page=1&pageSize=10`;

  it('unauthenticated request -> 401 UNAUTHORIZED (no PUBLIC_PATHS bypass for /feed)', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('authenticated request -> 200 and traverses recommendations -> ranking (retrievalCount > 0)', async () => {
    const writeToken = signToken(['feed:write']);
    await app.inject({
      method: 'POST',
      url: '/feed/candidates',
      headers: { authorization: `Bearer ${writeToken}` },
      payload: {
        feedId,
        items: [candidate('c1', 10), candidate('c2', 5), candidate('c3', 1)],
        replace: true,
      },
    });

    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(body.data).toHaveProperty('algorithmUsed');
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(typeof body.data.retrievalCount).toBe('number');
    expect(body.data.retrievalCount).toBeGreaterThan(0);
  });
});

describe('seam: feed POST /feed/score (mutating, feed:write: ml-pipeline inference)', () => {
  const url = '/feed/score';
  const payload = { inputId: 'c1', features: [1, 0] };

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(401);
  });

  it('valid JWT lacking `feed:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['feed:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
  });

  it('valid JWT with `feed:write` -> 200 and reaches the ml-pipeline InferenceEngine', async () => {
    const token = signToken(['feed:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(body.data).toHaveProperty('result');
  });
});

describe('seam: feed GET /feed/runtime/cache + /feed/triton/models (read: ml-runtime + triton-client)', () => {
  it('GET /feed/runtime/cache unauth -> 401, authed -> 200 (ml-runtime ModelLoader reached)', async () => {
    const unauth = await app.inject({ method: 'GET', url: '/feed/runtime/cache' });
    expect(unauth.statusCode).toBe(401);

    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url: '/feed/runtime/cache',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true });
    expect(res.json().data).toHaveProperty('cache');
  });

  it('GET /feed/triton/models unauth -> 401, authed -> 200 (triton-client registry reached)', async () => {
    const unauth = await app.inject({ method: 'GET', url: '/feed/triton/models' });
    expect(unauth.statusCode).toBe(401);

    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url: '/feed/triton/models',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(Array.isArray(body.data.models)).toBe(true);
  });
});

// ===========================================================================
// payments (Task 14.4) — sensitive money surfaces. POST /payments/intents
// asserted for 401/403/past-auth (502 in test mode, NOT 2xx — engine reached);
// GET /payments/config is the read 2xx surface; webhook signature-verified.
// ===========================================================================
describe('seam: payments POST /payments/intents (mutating, payments:write)', () => {
  const url = '/payments/intents';
  const payload = { amount: 500, currency: 'usd' };

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `payments:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['payments:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `payments:write` -> past auth into the StripeGateway (502 in test mode, NOT 401/403)', async () => {
    const token = signToken(['payments:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    // Engine reached: auth + scope passed, route invoked the Stripe gateway,
    // which cannot reach the live API in test mode -> mapped to 502 (NOT 401/403).
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'PAYMENT_GATEWAY_ERROR' } });
  });
});

describe('seam: payments GET /payments/config (read, payments:read)', () => {
  const url = '/payments/config';

  it('unauthenticated request -> 401 UNAUTHORIZED (no PUBLIC_PATHS bypass)', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `payments:read` -> 403 FORBIDDEN', async () => {
    const token = signToken(['profile:read']);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `payments:read` -> 200 and reaches the payments service (testMode flag)', async () => {
    const token = signToken(['payments:read']);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(body.data).toHaveProperty('testMode');
    expect(body.data.testMode).toBe(true);
  });
});

describe('seam: payments POST /payments/webhook (Stripe signature verification, Req 7.6)', () => {
  const url = '/payments/webhook';
  const eventPayload = JSON.stringify({
    id: 'evt_test_seam_1',
    object: 'event',
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_test_seam_1' } },
  });

  it('unauthenticated request -> 401 (webhook stays behind the global auth hook; Req 7.3)', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignatureHeader(eventPayload, WEBHOOK_SECRET),
      },
      payload: eventPayload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT + VALID Stripe signature -> 200 accepted (verified against the raw body)', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'stripe-signature': stripeSignatureHeader(eventPayload, WEBHOOK_SECRET),
      },
      payload: eventPayload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { received: true, type: 'payment_intent.succeeded', id: 'evt_test_seam_1' },
    });
  });

  it('valid JWT + BAD Stripe signature -> 400 WEBHOOK_SIGNATURE_INVALID', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'stripe-signature': stripeSignatureHeader(eventPayload, 'whsec_WRONG_secret'),
      },
      payload: eventPayload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'WEBHOOK_SIGNATURE_INVALID' },
    });
  });

  it('valid JWT + MISSING Stripe signature -> 400 WEBHOOK_SIGNATURE_MISSING', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: eventPayload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'WEBHOOK_SIGNATURE_MISSING' },
    });
  });
});

// ===========================================================================
// quant-commerce (Task 14.4) — POST /commerce/orders (commerce:write) full
// matrix + GET /commerce/orders read.
// ===========================================================================
describe('seam: commerce POST /commerce/orders (mutating, commerce:write)', () => {
  const url = '/commerce/orders';
  const payload = { merchantOrderId: 'm-order-1', merchant: 'amazon', items: ['sku-1', 'sku-2'] };

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `commerce:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['commerce:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `commerce:write` -> 201 and reaches the OrderTracker engine', async () => {
    const token = signToken(['commerce:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    // Engine reached: the tracker created an order owned by the caller.
    expect(body.data.order).toMatchObject({ merchantOrderId: 'm-order-1', merchant: 'amazon' });
  });
});

describe('seam: commerce GET /commerce/orders (read)', () => {
  const url = '/commerce/orders';

  it('unauthenticated request -> 401 UNAUTHORIZED (no PUBLIC_PATHS bypass)', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('authenticated request -> 200 and reaches the OrderTracker engine', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(Array.isArray(body.data.orders)).toBe(true);
    expect(Array.isArray(body.data.active)).toBe(true);
  });
});

// ===========================================================================
// quant-economy (Task 14.4) — POST /economy/subscription (economy:write) full
// matrix + GET /economy/wallet read.
// ===========================================================================
describe('seam: economy POST /economy/subscription (mutating, economy:write)', () => {
  const url = '/economy/subscription';
  const payload = { tier: 'Pro' };

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `economy:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['economy:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `economy:write` -> 201 and reaches the SubscriptionManager engine', async () => {
    const token = signToken(['economy:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    // Engine reached: the manager returned a subscription record.
    expect(body.data.subscription).toBeTruthy();
  });
});

describe('seam: economy GET /economy/wallet (read)', () => {
  const url = '/economy/wallet';

  it('unauthenticated request -> 401 UNAUTHORIZED (no PUBLIC_PATHS bypass)', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('authenticated request -> 200 and reaches the CoinWallet engine', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(body.data).toHaveProperty('balance');
    expect(Array.isArray(body.data.transactions)).toBe(true);
  });
});
