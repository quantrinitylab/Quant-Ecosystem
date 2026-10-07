// @vitest-environment node
// ============================================================================
// quantube — Stage-5 engine seam tests (Task 13.3 / DoD-2 & DoD-4)
// ============================================================================
//
// Traverses the real integration seam for the Stage-5 engines wired into
// quantube in Tasks 13.1 / 13.2, using Fastify `inject()` against the app's
// REAL `buildApp()` (apps/quantube/backend/app.ts). No network, no mocked
// server-core: the global `onRequest` auth hook from `createApp()` and the
// decorated engines are exercised exactly as in production. The engines under
// test are:
//
//   - @quant/media            (13.1) — `fastify.media`, routes under `/media`.
//   - the feed stack          (13.1) — `@quant/recommendations`, `@quant/ranking`,
//     `@quant/ml-pipeline`, `@quant/ml-runtime`, `@quant/triton-client` composed
//     into `fastify.feed` (backend/lib/feed-engines.ts), routes under `/feed`.
//   - @quant/cross-publish    (13.1) — `fastify.crossPublish`, routes under
//     `/cross-publish`.
//   - @quant/creator-economy  (13.1/13.2) — `fastify.creatorEconomy` (non-payment
//     surfaces) under `/creator` + `fastify.payouts` (PayoutService money rails)
//     under `/payouts`.
//   - @quant/payments         (13.2) — `fastify.payments` (real StripeGateway)
//     under `/payments`, plus the signature-verified Stripe webhook.
//
// Like the quantneon harness (and UNLIKE quantai, whose `buildApp()` has
// phantom-package import breakage forcing a `createApp()` replication),
// quantube's `buildApp()` loads CLEANLY: every `@quant/*` it imports (media,
// recommendations, ranking, ml-pipeline, ml-runtime, triton-client,
// cross-publish, creator-economy, payments, api-client, server-core, …) is a
// real workspace package declared in apps/quantube/package.json. This test
// therefore builds the app via its OWN `buildApp()` and does NOT replicate the
// wiring. Confirmed by the `buildApp loads` assertion below (mirrors the
// quantneon / quantmeet templates).
//
// For each mutating surface we assert the states the design's Testing Strategy
// requires (DoD-2 / Requirement 5.2 & 5.6 / Property P7):
//   - unauthenticated (no Bearer)             -> 401 UNAUTHORIZED
//   - valid JWT WITHOUT the required scope     -> 403 FORBIDDEN
//   - valid JWT WITH the required scope         -> 2xx and the engine is reached
// For read routes (DoD-2): unauth -> 401, authed -> 2xx.
//
// JWTs are HS256-signed with Node's built-in `crypto` (matching the quantneon /
// quantmeet seam-test templates and server-core's identity-permissions test),
// so this adds no new dependency. The signed claims match the test AppConfig's
// jwtSecret/issuer/audience (env:'test').
//
// ---------------------------------------------------------------------------
// PUBLIC_PATHS prefix-collision check. createApp()'s allowlist is
//   ['/health','/healthz','/ready','/readyz','/live','/livez','/metrics']
// matched as `path === p || path.startsWith(p + '/')`. quantube's Stage-5 route
// prefixes are `/media`, `/feed`, `/cross-publish`, `/creator`, `/payments`,
// `/payouts` — NONE of which equal or are prefixed by an allowlist entry (in
// particular `/feed` does NOT collide with anything, and there is no `/live*`
// prefix among them). To PROVE no silent auth-bypass exists, the read surfaces
// (`/media/library`, `/feed`, `/payments/config`) are asserted to 401 when
// unauthenticated — if any prefix collided, the global hook would be bypassed
// and these would not be 401. No KNOWN BUG block is therefore needed.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

// The Stripe webhook secret MUST be set BEFORE `buildApp()` constructs the
// payments service (createPaymentsService reads it from env at boot). Setting it
// at module load — which runs before `beforeAll` — guarantees the gateway's
// `verifyWebhook` uses the SAME secret we sign test events with below. No live
// Stripe key is needed: signature verification is local crypto (Req 7.6).
const WEBHOOK_SECRET = 'whsec_test_seam_secret_value';
process.env['STRIPE_WEBHOOK_SECRET'] = WEBHOOK_SECRET;

const testConfig: AppConfig = {
  ...getConfig(),
  port: 3006,
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
// Hand-roll an HS256 JWT the auth plugin's
// `jose.jwtVerify(token, secret, { issuer, audience })` accepts.
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
      email: 'tube@example.com',
      username: 'tubeuser',
      role: 'user',
      scopes,
      app: 'quantube',
    }),
  );
  const signature = base64url(
    createHmac('sha256', testConfig.jwtSecret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

// Build a Stripe `Stripe-Signature` header for a raw payload using the same
// scheme `stripe.webhooks.constructEvent` verifies: `t=<ts>,v1=<hmacSHA256 hex
// of "<ts>.<payload>">`. Uses the current timestamp so it is inside Stripe's
// default 300s tolerance. node:crypto only — no live key.
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

// ===========================================================================
// Harness sanity: confirm the app builds via its OWN buildApp() (no
// phantom-package breakage) and the Stage-5 engines are decorated.
// ===========================================================================
describe('quantube buildApp() seam harness', () => {
  it('buildApp loads and decorates the Stage-5 engines', () => {
    expect(app).toBeTruthy();
    expect(app.media).toBeTruthy();
    expect(app.feed).toBeTruthy();
    expect(app.crossPublish).toBeTruthy();
    expect(app.creatorEconomy).toBeTruthy();
    expect(app.payments).toBeTruthy();
    expect(app.payouts).toBeTruthy();
  });
});

// ===========================================================================
// media (Task 13.1) — POST /media/library full matrix (DoD-2/4) +
// GET /media/library read surface.
// ===========================================================================
describe('seam: media POST /media/library (mutating, media:write)', () => {
  const url = '/media/library';
  const payload = {
    type: 'video',
    url: 'https://cdn.example/clip.mp4',
    name: 'clip.mp4',
    size: 1024,
    mimeType: 'video/mp4',
    sourceApp: 'quantube',
  };

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `media:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['media:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `media:write` -> 201 and reaches the SharedMediaPicker engine', async () => {
    const token = signToken(['media:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    // Engine reached: the picker returned the registered media item.
    expect(body.data.item).toBeTruthy();
    expect(body.data.item).toMatchObject({ type: 'video', sourceApp: 'quantube' });
  });
});

describe('seam: media GET /media/library (read)', () => {
  const url = '/media/library?maxItems=10';

  it('unauthenticated request -> 401 UNAUTHORIZED (no PUBLIC_PATHS bypass)', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('authenticated request -> 200 and reaches the SharedMediaPicker engine', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    // Engine reached: the picker returned an items array + storage total.
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data).toHaveProperty('storage');
  });
});

// ===========================================================================
// feed stack (Task 13.1) — recommendations -> ranking -> ml-pipeline ->
// ml-runtime -> triton-client. Seed candidates (feed:write), drive the composed
// feed, the ml-pipeline inference surface, and the ml-runtime / triton reads.
// ===========================================================================
const feedId = 'tube-feed-1';
const candidate = (id: string, upvotes: number) => ({
  id,
  content: `video ${id}`,
  authorId: 'author-1',
  timestamp: Date.now(),
  upvotes,
  shares: 1,
  replies: 0,
  replyQuality: 0.5,
  authorReputation: 0.5,
});

describe('seam: feed POST /feed/candidates (mutating, feed:write)', () => {
  const url = '/feed/candidates';
  const payload = {
    feedId,
    items: [candidate('v1', 10), candidate('v2', 5), candidate('v3', 1)],
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
    // Seed first so the recommendation retrieval has a pool to order.
    const writeToken = signToken(['feed:write']);
    await app.inject({
      method: 'POST',
      url: '/feed/candidates',
      headers: { authorization: `Bearer ${writeToken}` },
      payload: {
        feedId,
        items: [candidate('v1', 10), candidate('v2', 5), candidate('v3', 1)],
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
    // Engine reached: ranking returned an algorithmUsed + paginated items, and
    // the recommendations retrieval count is surfaced by the composition.
    expect(body.data).toHaveProperty('algorithmUsed');
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(typeof body.data.retrievalCount).toBe('number');
    expect(body.data.retrievalCount).toBeGreaterThan(0);
  });
});

describe('seam: feed POST /feed/score (mutating, feed:write: ml-pipeline inference)', () => {
  const url = '/feed/score';
  const payload = { inputId: 'v1', features: [1, 0] };

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
    // Engine reached: the in-memory model performed a forward pass.
    expect(body.data).toHaveProperty('result');
  });
});

describe('seam: feed GET /feed/runtime/cache + /feed/triton/models (read: ml-runtime + triton-client)', () => {
  it('GET /feed/runtime/cache unauthenticated -> 401, authed -> 200 (ml-runtime ModelLoader reached)', async () => {
    const unauth = await app.inject({ method: 'GET', url: '/feed/runtime/cache' });
    expect(unauth.statusCode).toBe(401);

    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url: '/feed/runtime/cache',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(body.data).toHaveProperty('cache');
  });

  it('GET /feed/triton/models unauthenticated -> 401, authed -> 200 (triton-client registry reached)', async () => {
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
// cross-publish (Task 13.1) — POST /cross-publish/intents full matrix
// (cross-publish:write) + GET /cross-publish/intents read.
// ===========================================================================
describe('seam: cross-publish POST /cross-publish/intents (mutating, cross-publish:write)', () => {
  const url = '/cross-publish/intents';
  const payload = {
    contentId: 'content-1',
    contentType: 'video',
    title: 'My clip',
    description: 'a clip',
    surfaces: ['quantube', 'quantneon'],
    mediaUrl: 'https://cdn.example/clip.mp4',
    thumbnailUrl: 'https://cdn.example/clip.jpg',
  };

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `cross-publish:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['cross-publish:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `cross-publish:write` -> 201 and reaches the PublishIntent engine', async () => {
    const token = signToken(['cross-publish:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    // Engine reached: the intent service created an intent owned by the caller.
    expect(body.data.intent).toBeTruthy();
    expect(body.data.intent).toMatchObject({ userId: 'user-123', contentId: 'content-1' });
  });
});

describe('seam: cross-publish GET /cross-publish/intents (read)', () => {
  const url = '/cross-publish/intents';

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('authenticated request -> 200 and reaches the PublishIntent engine', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(Array.isArray(body.data.intents)).toBe(true);
  });
});

// ===========================================================================
// creator-economy (Task 13.1) — GET /creator/dashboard read +
// POST /creator/tier/upgrade full matrix (creator:write).
// ===========================================================================
describe('seam: creator-economy GET /creator/dashboard (read)', () => {
  const url = '/creator/dashboard';

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('authenticated request -> 200 and reaches the CreatorDashboard engine', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    // Engine reached: the dashboard returned an overview keyed by the caller.
    expect(body.data.overview).toMatchObject({ creatorId: 'user-123' });
  });
});

describe('seam: creator-economy POST /creator/credits/earn (mutating, creator:write)', () => {
  const url = '/creator/credits/earn';
  const payload = { amount: 50, source: 'watch-bonus' };

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `creator:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['creator:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `creator:write` -> 201 and reaches the QuantCredits engine', async () => {
    const token = signToken(['creator:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    // Engine reached: the credits ledger recorded an `earn` transaction.
    expect(body.data.transaction).toMatchObject({
      userId: 'user-123',
      amount: 50,
      type: 'earn',
      source: 'watch-bonus',
    });
  });
});

// ===========================================================================
// payments (Task 13.2) — sensitive money surfaces. POST /payments/intents is
// asserted only for 401/403 (reaching the live Stripe API is not possible in
// test mode without a live key — the engine-reached state surfaces as a 502
// gateway error, NOT a 2xx); GET /payments/config is the read 2xx surface.
// The webhook is signature-verified (valid sig -> accepted, bad/missing -> 400).
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
    // Engine reached: auth + scope passed, the route invoked the Stripe gateway,
    // which cannot reach the live API in test mode and is mapped to a 502
    // PAYMENT_GATEWAY_ERROR by the route's error mapper (NOT a 401/403).
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'PAYMENT_GATEWAY_ERROR' },
    });
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
    // Engine reached: the service reports test mode (no live key present).
    expect(body.data).toHaveProperty('testMode');
    expect(body.data.testMode).toBe(true);
  });
});

describe('seam: payments POST /payments/webhook (Stripe signature verification, Req 7.6)', () => {
  const url = '/payments/webhook';
  // A minimal but valid Stripe event payload `constructEvent` will parse.
  const eventPayload = JSON.stringify({
    id: 'evt_test_seam_1',
    object: 'event',
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_test_seam_1' } },
  });

  it('unauthenticated request -> 401 (webhook stays behind the global auth hook; PUBLIC_PATHS unchanged, Req 7.3)', async () => {
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

  it('valid JWT + VALID Stripe signature -> 200 accepted (event verified against the raw body)', async () => {
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
    const body = res.json();
    expect(body).toMatchObject({
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
// creator-economy PAYOUT money rails (Task 13.2) — POST /payouts/request
// (payments:write). 2xx requires available balance, so we seed the decorated
// PayoutService's in-memory ledger directly for the caller (engine setup), then
// drive the route end to end.
// ===========================================================================
describe('seam: payouts POST /payouts/request (mutating, payments:write)', () => {
  const url = '/payouts/request';
  const payload = { amount: 100, method: 'bank_transfer' };

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

  it('valid JWT with `payments:write` -> 201 and reaches the PayoutService engine', async () => {
    // Seed the decorated engine's in-memory ledger for the caller so a payout is
    // withdrawable (there is no public route to add balance; this is engine
    // setup, the engine logic itself stays real).
    app.payouts.addBalance('user-123', 1000);

    const token = signToken(['payments:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    // Engine reached: the PayoutService issued a pending payout for the caller.
    expect(body.data.payout).toMatchObject({
      creatorId: 'user-123',
      amount: 100,
      method: 'bank_transfer',
      status: 'pending',
    });
  });
});
