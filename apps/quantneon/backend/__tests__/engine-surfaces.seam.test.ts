// @vitest-environment node
// ============================================================================
// quantneon — Stage-4 engine seam tests (Task 12.3 / DoD-2 & DoD-4)
// ============================================================================
//
// Traverses the real integration seam for the Stage-4 engines wired into
// quantneon in Tasks 12.1 / 12.2, using Fastify `inject()` against the app's
// REAL `buildApp()`. No network, no mocked server-core: the global auth hook
// from `createApp()` and the decorated engines are exercised exactly as in
// production. The engines under test are:
//
//   - @quant/ar-lenses  (Task 12.1) — decorated as `fastify.arLenses`, routes
//     under the `/ar-lenses` prefix.
//   - @quant/federation (Task 12.2) — decorated as `fastify.federation`, SCOPED
//     routes under the `/federation` prefix.
//   - the feed stack    (Task 12.2) — `@quant/recommendations`, `@quant/ranking`,
//     `@quant/ml-pipeline`, `@quant/ml-runtime`, `@quant/triton-client` composed
//     into `fastify.feed` (see backend/lib/feed-engines.ts), routes under `/feed`.
//
// Unlike the quantai harness (whose `buildApp()` has phantom-package import
// breakage and forces a `createApp()` replication), quantneon's `buildApp()`
// loads cleanly — every `@quant/*` it imports (ar-lenses, federation,
// recommendations, ranking, ml-pipeline, ml-runtime, triton-client, api-client,
// server-core, …) is a real workspace package declared in
// apps/quantneon/package.json — so this test builds the app via its OWN
// `buildApp()` and does NOT replicate the wiring. Confirmed by the `buildApp
// loads` assertion below (mirrors the quantmeet template).
//
// For each scoped surface we assert the states the design's Testing Strategy
// requires (DoD-2 / Requirement 5.2 & 5.6 / Property P7):
//   - unauthenticated (no Bearer)            -> 401 UNAUTHORIZED
//   - valid JWT WITHOUT the required scope    -> 403 FORBIDDEN
//   - valid JWT WITH the required scope        -> 2xx and the engine is reached
// For read routes (DoD-2): unauth -> 401, authed -> 2xx.
//
// JWTs are HS256-signed with Node's built-in `crypto` (matching the quantmeet
// seam-test template and server-core's identity-permissions test), so this adds
// no new dependency. The signed claims match the test AppConfig's
// jwtSecret/issuer/audience (env:'test').
//
// ---------------------------------------------------------------------------
// PUBLIC_PATHS prefix-collision check (the `/live`-style bug observed in
// quantmeet): createApp()'s allowlist is
//   ['/health','/healthz','/ready','/readyz','/live','/livez','/metrics']
// matched as `path === p || path.startsWith(p + '/')`. quantneon's route
// prefixes are `/ar-lenses`, `/federation`, `/feed`, `/posts`, `/ai` — NONE of
// which equal or are prefixed by an allowlist entry (in particular `/feed` does
// NOT collide with anything, and there is no `/live*` prefix here). To PROVE no
// silent auth-bypass exists, every read surface below is asserted to 401 when
// unauthenticated — if any prefix collided, the global hook would be bypassed
// and these would not be 401. No KNOWN BUG block is therefore needed (contrast
// quantmeet's GET /live/sessions).
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

const testConfig: AppConfig = {
  ...getConfig(),
  port: 3012,
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
      email: 'neon@example.com',
      username: 'neonuser',
      role: 'user',
      scopes,
      app: 'quantneon',
    }),
  );
  const signature = base64url(
    createHmac('sha256', testConfig.jwtSecret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
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
// Harness sanity: confirm the app builds via its own buildApp() (no
// phantom-package breakage) and the Stage-4 engines are decorated.
// ===========================================================================
describe('quantneon buildApp() seam harness', () => {
  it('buildApp loads and decorates the Stage-4 engines', () => {
    expect(app).toBeTruthy();
    expect(app.arLenses).toBeTruthy();
    expect(app.federation).toBeTruthy();
    expect(app.feed).toBeTruthy();
  });
});

// ===========================================================================
// ar-lenses (Task 12.1) — POST /ar-lenses/lenses/generate full matrix (DoD-2/4)
// + GET /ar-lenses/capabilities read surface.
// ===========================================================================
describe('seam: ar-lenses POST /ar-lenses/lenses/generate (mutating, ar-lenses:write)', () => {
  const url = '/ar-lenses/lenses/generate';

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload: { prompt: 'neon cat ears' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `ar-lenses:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['profile:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { prompt: 'neon cat ears' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `ar-lenses:write` -> 201 and reaches the PromptToLens engine', async () => {
    const token = signToken(['ar-lenses:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { prompt: 'neon cat ears', style: 'glam', intensity: 0.7 },
    });
    expect(res.statusCode).toBe(201);
    // Engine reached: the route returns the engine-produced lens definition.
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(body.data).toBeTruthy();
  });
});

describe('seam: ar-lenses GET /ar-lenses/capabilities (read)', () => {
  const url = '/ar-lenses/capabilities?target=quant_neon';

  it('unauthenticated request -> 401 UNAUTHORIZED (no PUBLIC_PATHS bypass)', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('authenticated request -> 200 and reaches the CrossAppDistributor engine', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    // Engine reached: the distributor returned a capability matrix for the target.
    expect(body.data).toHaveProperty('capabilities');
  });
});

// ===========================================================================
// federation (Task 12.2) — SCOPED routes. Mutating POST /federation/instances/block
// (federation:write) full matrix + read GET /federation/instances/:domain
// (federation:read).
// ===========================================================================
describe('seam: federation POST /federation/instances/block (mutating, federation:write)', () => {
  const url = '/federation/instances/block';

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload: { domain: 'spam.example' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `federation:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['federation:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { domain: 'spam.example' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `federation:write` -> 201 and reaches the FederationModeration engine', async () => {
    const token = signToken(['federation:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { domain: 'spam.example' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    // Engine reached: the moderation engine recorded the block.
    expect(body).toMatchObject({ success: true, data: { domain: 'spam.example', blocked: true } });
  });
});

describe('seam: federation GET /federation/instances/:domain (read, federation:read)', () => {
  const url = '/federation/instances/peer.example';

  it('unauthenticated request -> 401 UNAUTHORIZED (no PUBLIC_PATHS bypass)', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `federation:read` -> 403 FORBIDDEN', async () => {
    const token = signToken(['profile:read']);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `federation:read` -> 200 and reaches the moderation engine', async () => {
    const token = signToken(['federation:read']);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true, data: { domain: 'peer.example' } });
    // Engine reached: moderation reported block/allow state for the domain.
    expect(body.data).toHaveProperty('blocked');
    expect(body.data).toHaveProperty('allowed');
  });
});

// ===========================================================================
// feed stack (Task 12.2) — recommendations -> ranking -> ml-pipeline ->
// ml-runtime -> triton-client. We seed candidates (mutating, feed:write), then
// drive the composed feed (recommendations -> ranking) and the ml-pipeline
// inference surface, asserting each engine is genuinely reached.
// ===========================================================================
const feedId = 'neon-feed-1';
const candidate = (id: string, upvotes: number) => ({
  id,
  content: `post ${id}`,
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
    items: [candidate('p1', 10), candidate('p2', 5), candidate('p3', 1)],
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

  it('authenticated request -> 200 and traverses recommendations -> ranking', async () => {
    // Seed first so the recommendation retrieval has a pool to order.
    const writeToken = signToken(['feed:write']);
    await app.inject({
      method: 'POST',
      url: '/feed/candidates',
      headers: { authorization: `Bearer ${writeToken}` },
      payload: {
        feedId,
        items: [candidate('p1', 10), candidate('p2', 5), candidate('p3', 1)],
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

describe('seam: feed GET /feed/recommendations (read: recommendations engine)', () => {
  const url = `/feed/recommendations?feedId=${feedId}&k=5`;

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('authenticated request -> 200 and reaches the RecommendationPipeline', async () => {
    // Ensure the pool is seeded for this feed.
    const writeToken = signToken(['feed:write']);
    await app.inject({
      method: 'POST',
      url: '/feed/candidates',
      headers: { authorization: `Bearer ${writeToken}` },
      payload: { feedId, items: [candidate('p1', 10), candidate('p2', 5)], replace: true },
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
    expect(Array.isArray(body.data.candidates)).toBe(true);
  });
});

describe('seam: feed POST /feed/score (mutating, feed:write: ml-pipeline inference)', () => {
  const url = '/feed/score';
  const payload = { inputId: 'p1', features: [1, 0] };

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

describe('seam: feed GET /feed/triton/models + /feed/runtime/cache (read: triton-client + ml-runtime)', () => {
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
});
