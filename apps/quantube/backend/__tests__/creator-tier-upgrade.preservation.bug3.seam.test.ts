// @vitest-environment node
// ============================================================================
// Bug 3 — PRESERVATION BASELINE (quantube valid upgrades & auth/validation seams)
// engine-wiring-bugs-fix · Task 6 (Phase 2: observation-first baseline)
// ============================================================================
//
// METHODOLOGY (observation-first preservation baseline):
//   This suite records the EXISTING behavior of quantube's
//   POST /creator/tier/upgrade and the other /creator/* routes, and is EXPECTED
//   TO PASS on the CURRENT (unfixed) code. It locks in the behavior the Bug 3 fix
//   (Task 9 — translating the domain rejection into 403 at the route boundary)
//   must NOT regress. It is the `NOT isBugConditionBug3` half of the bug
//   condition: a valid eligible strictly-upward upgrade, auth failures, and an
//   invalid body — none of which trip the 500-instead-of-403 defect.
//
//   Design Property 6 (Preservation): _for any_ POST /creator/tier/upgrade
//   request where `isBugConditionBug3` does NOT hold, F'(X) = F(X) — a valid
//   eligible upward upgrade with `creator:write` -> 200 { success: true,
//   data: { tier } } with the engine mutated; unauth -> 401; missing scope ->
//   403; invalid body -> 400 VALIDATION_ERROR; and all other /creator/* routes
//   (dashboard, earnings, tier read, tip, credits) unchanged.
//
// **Validates: Requirements 3.5, 3.6**
//
// HARNESS (isolation rationale — lesson from Tasks 1-5, mirrors the Task 3
//   Bug 3 exploration harness and the Task 4/5 preservation baselines):
//   quantube's real `buildApp()` (and `@quant/server-core`'s `createApp()`)
//   transitively import the prisma plugin -> `@quant/database`, an unbuilt
//   build-output package whose `main` points at a missing `dist/index.js`
//   ("Failed to resolve entry for package '@quant/database'"). That is unrelated
//   module-resolution noise that would mask the Bug 3 / creator-seam signal.
//
//   So this harness composes the SAME seam `createApp()` installs, but from
//   server-core SOURCE plugins — exactly the Task 4/5 isolation pattern — wiring
//   together the real components whose interaction defines this seam:
//     1. the REAL error-handler plugin (../../../../packages/server-core/src/plugins/error-handler)
//        — owns the success/error envelope (ZodError -> 400 VALIDATION_ERROR,
//        AppError -> its statusCode/code, plain Error -> 500 INTERNAL_ERROR);
//     2. the REAL auth plugin (.../plugins/auth) — owns `requireAuth({ scopes })`
//        and the 401/403 envelopes. Unlike the Task 3 exploration shim (which
//        always authenticated to reach the handler), Task 6 must FAITHFULLY
//        reproduce the 401 (no/invalid bearer) and 403 (missing `creator:write`)
//        seam, so it composes the REAL auth plugin from source as Tasks 4/5 did;
//     3. `createApp()`'s EXACT global auth `onRequest` hook (replicated verbatim)
//        — enforces authentication on every non-public path (the GET /creator/*
//        reads have no route-level preHandler and rely on this hook to populate
//        `request.auth`, exactly as in production);
//     4. the REAL creator-economy engines via `createCreatorEconomyService()`
//        (TierService et al.) + the REAL `creatorRoutes` module at the production
//        `/creator` prefix — consumed AS-SHIPPED (no engine rewrites).
//
//   `creator.ts` imports only `@quant/creator-economy`, `zod`, and `fastify`
//   types (no `@quant/server-core` package entry), so no `vi.mock` of
//   `@quant/server-core` is needed here.
//
//   Scope evaluation: `createApp()` also registers `identity-permissions`, which
//   backs `requireAuth` scope checks. When that plugin is absent (as here) the
//   auth plugin falls back to EXACT-MATCH scope semantics (see auth.ts). For the
//   leaf scope `creator:write` the two paths are behaviorally identical (a token
//   either carries the exact scope or it does not), so the recorded 401/403/2xx
//   matrix is the same baseline production produces.
//
// PROPERTY-BASED APPROACH:
//   The bug condition (`isBugConditionBug3`, request already past Zod) is a
//   non-upward transition (indexOf(newTier) <= indexOf(current)) OR an ineligible
//   caller. The preservation property quantifies over the COMPLEMENT of that set,
//   restricted to two generated non-bug classes:
//     (a) upward & eligible — random (currentTier, newTier, earnings) triples
//         with newIdx > currentIdx and earnings >= threshold(newTier); and
//     (b) invalid body — random payloads that FAIL Zod (tier outside the enum or
//         absent).
//   The universally-quantified invariant: the response partitions EXACTLY as
//   { upward & eligible -> 200 (engine mutated), invalid body -> 400
//   VALIDATION_ERROR }, and HTTP 500 NEVER occurs for any generated input.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// REAL server-core plugins, imported from source (clean: no @quant/database chain).
import errorHandlerPlugin from '../../../../packages/server-core/src/plugins/error-handler';
import authPlugin from '../../../../packages/server-core/src/plugins/auth';

// REAL route module + the REAL creator-economy engine factory, as quantube ships them.
import creatorRoutes, { createCreatorEconomyService } from '../routes/creator';

// ---------------------------------------------------------------------------
// Test JWT config — matches the claims the source auth plugin verifies.
// ---------------------------------------------------------------------------
const jwtSecret = 'test-secret-key-that-is-long-enough-for-hs256';
const jwtIssuer = 'quant-test';
const jwtAudience = 'quant-test-audience';

const PUBLIC_PATHS = ['/health', '/healthz', '/ready', '/readyz', '/live', '/livez', '/metrics'];

// Mirror of createApp()'s seam (error-handler + auth + the exact global auth
// onRequest hook), plus the creator-economy wiring buildApp() performs (engine
// decoration + route registration at the production `/creator` prefix).
async function buildCreatorSeamHarness(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // REAL envelope mapper (ZodError -> 400 VALIDATION_ERROR; AppError -> code;
  // plain Error -> 500 INTERNAL_ERROR).
  await app.register(errorHandlerPlugin);

  // REAL auth substrate (decorates requireAuth + request.auth, owns 401/403).
  await app.register(authPlugin, { jwtSecret, jwtIssuer, jwtAudience });

  // createApp()'s global auth enforcement hook — replicated VERBATIM so every
  // non-public path requires authentication exactly as in production. The
  // GET /creator/* reads have no route-level preHandler and depend on this hook
  // to populate `request.auth`.
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
      return;
    }
    await app.requireAuth()(request, reply);
    if (reply.sent) return;
  });

  // REAL creator-economy engines (TierService et al.), wired as quantube ships them.
  app.decorate('creatorEconomy', createCreatorEconomyService());

  // REAL route module at the production prefix (unchanged behavior/prefixes).
  await app.register(creatorRoutes, { prefix: '/creator' });

  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// HS256 JWT signing (mirrors the existing seam harnesses) — the source auth
// plugin verifies via `jose.jwtVerify(token, secret, { issuer, audience })`.
// ---------------------------------------------------------------------------
function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

let jtiCounter = 0;
function signToken(scopes: string[], sub: string): string {
  jtiCounter += 1;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: jwtIssuer,
      aud: jwtAudience,
      sub,
      jti: `seam-${jtiCounter}`,
      iat: now,
      exp: now + 3600,
      email: `${sub}@example.com`,
      username: sub,
      role: 'user',
      scopes,
      app: 'quantube',
    }),
  );
  const signature = base64url(
    createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

// A valid JWT carrying `creator:write` for the given subject (the scope the
// mutating /creator/* routes require).
function writerHeaders(sub: string): Record<string, string> {
  return { authorization: `Bearer ${signToken(['creator:write'], sub)}` };
}

// ---------------------------------------------------------------------------
// Deterministic seeded RNG (mulberry32) so generated samples are reproducible
// across runs — a failing sample is always reproducible.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x42_55_47_33); // "BUG3"

// Tier ladder + eligibility thresholds — MIRROR the engine's as-shipped
// TIER_ORDER / TIER_THRESHOLDS (packages/creator-economy/src/tiers/tier-service.ts)
// so the generators construct exactly the non-bug (upward & eligible) class.
const TIERS = ['free', 'starter', 'pro', 'enterprise'] as const;
type Tier = (typeof TIERS)[number];
const THRESHOLDS: Record<Tier, number> = { free: 0, starter: 100, pro: 1000, enterprise: 10000 };

interface UpwardEligibleCase {
  currentTier: Tier;
  newTier: Tier;
  earnings: number;
}

// Generate N (currentTier, newTier, earnings) triples in the UPWARD & ELIGIBLE
// non-bug class: newIdx > currentIdx (strictly upward) AND earnings >= the new
// tier's threshold (eligible).
function generateUpwardEligible(n: number): UpwardEligibleCase[] {
  const out: UpwardEligibleCase[] = [
    // Anchor: the explicit documented observation (free -> starter, earnings 200).
    { currentTier: 'free', newTier: 'starter', earnings: 200 },
  ];
  for (let i = 0; i < n; i += 1) {
    // currentIdx in 0..2 so there is at least one strictly-higher tier.
    const currentIdx = Math.floor(rand() * (TIERS.length - 1));
    // newIdx strictly above currentIdx, up to the top tier.
    const span = TIERS.length - 1 - currentIdx;
    const newIdx = currentIdx + 1 + Math.floor(rand() * span);
    const newTier = TIERS[newIdx] as Tier;
    // earnings >= threshold(newTier) (plus random headroom) => eligible.
    const earnings = THRESHOLDS[newTier] + Math.floor(rand() * 5000);
    out.push({ currentTier: TIERS[currentIdx] as Tier, newTier, earnings });
  }
  return out;
}

// Generate N payloads that FAIL the route's Zod `upgradeTierSchema` (tier outside
// the `free|starter|pro|enterprise` enum, or absent) — the invalid-body non-bug
// class. These must surface as 400 VALIDATION_ERROR regardless of engine state.
function generateInvalidBodies(n: number): unknown[] {
  const fixed: unknown[] = [
    {}, // missing tier (documented observation)
    { tier: 'platinum' }, // value outside the enum (documented observation)
    { tier: 'gold' },
    { tier: '' },
    { tier: 123 },
    { tier: null },
    { notTier: 'starter' },
  ];
  const junkTiers = ['diamond', 'silver', 'bronze', 'PRO', 'Starter', 'enterprise ', 'free!'];
  for (let i = 0; i < n; i += 1) {
    const t = junkTiers[Math.floor(rand() * junkTiers.length)];
    fixed.push({ tier: t });
  }
  return fixed;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildCreatorSeamHarness();
});

afterAll(async () => {
  await app.close();
});

// Helper: POST /creator/tier/upgrade as `sub` (authenticated w/ creator:write).
function upgrade(sub: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: '/creator/tier/upgrade',
    headers: writerHeaders(sub),
    payload: payload as Record<string, unknown>,
  });
}

let uid = 0;
function freshUser(label: string): string {
  uid += 1;
  return `bug3-pres-${label}-${uid}`;
}

// ===========================================================================
// DOCUMENTED OBSERVATIONS (concrete) — the explicit non-bug cases recorded in
// the task, asserted on the CURRENT handler (all EXPECTED to PASS now).
// ===========================================================================
describe('Bug 3 preservation baseline — documented observations (Req 3.5, 3.6)', () => {
  it('free -> starter with earnings 200 (eligible, upward) -> 200 { success, data:{ tier:"starter" } } + engine mutated', async () => {
    const sub = freshUser('eligible-upward');
    app.creatorEconomy.tiers.setEarnings(sub, 200); // >= starter threshold (100)

    const res = await upgrade(sub, { tier: 'starter' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { tier: 'starter' } });
    // Engine state mutated (the success path persists the new tier).
    expect(app.creatorEconomy.tiers.getTier(sub)).toBe('starter');
  });

  it('unauthenticated -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/creator/tier/upgrade',
      payload: { tier: 'starter' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('authenticated WITHOUT creator:write scope -> 403 FORBIDDEN', async () => {
    const sub = freshUser('missing-scope');
    app.creatorEconomy.tiers.setEarnings(sub, 200); // eligible — proves it is the SCOPE, not eligibility
    const res = await app.inject({
      method: 'POST',
      url: '/creator/tier/upgrade',
      headers: { authorization: `Bearer ${signToken(['creator:read'], sub)}` },
      payload: { tier: 'starter' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('invalid body {} -> 400 VALIDATION_ERROR (ZodError path)', async () => {
    const sub = freshUser('invalid-empty');
    const res = await upgrade(sub, {});
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('invalid body { tier: "platinum" } -> 400 VALIDATION_ERROR (ZodError path)', async () => {
    const sub = freshUser('invalid-platinum');
    const res = await upgrade(sub, { tier: 'platinum' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });
});

// ===========================================================================
// PROPERTY 6 (Preservation) — POST /creator/tier/upgrade response partition.
// FOR ALL generated non-bug requests:
//   upward & eligible -> 200 (engine mutated);  invalid body -> 400;  never 500.
// ===========================================================================
const N = 24;

describe('Bug 3 preservation baseline — POST /creator/tier/upgrade non-bug partition (Property 6)', () => {
  it('FOR ALL upward & eligible (currentTier,newTier,earnings) triples -> 200 with engine mutated, never 500', async () => {
    for (const c of generateUpwardEligible(N)) {
      const sub = freshUser('pbt-upward');
      app.creatorEconomy.tiers.setTier(sub, c.currentTier);
      app.creatorEconomy.tiers.setEarnings(sub, c.earnings);

      const res = await upgrade(sub, { tier: c.newTier });
      const label = `${c.currentTier}->${c.newTier} @${c.earnings}`;

      expect(res.statusCode, `[${label}] 500 must never occur`).not.toBe(500);
      expect(res.statusCode, `[${label}] expected 200`).toBe(200);
      expect(res.json(), `[${label}] success envelope`).toMatchObject({
        success: true,
        data: { tier: c.newTier },
      });
      // Engine state mutated to the new tier.
      expect(app.creatorEconomy.tiers.getTier(sub), `[${label}] engine mutated`).toBe(c.newTier);
    }
  });

  it('FOR ALL invalid bodies (tier outside enum or absent) -> 400 VALIDATION_ERROR, never 500', async () => {
    for (const body of generateInvalidBodies(N)) {
      const sub = freshUser('pbt-invalid');
      const res = await upgrade(sub, body);
      const label = JSON.stringify(body);

      expect(res.statusCode, `[${label}] 500 must never occur`).not.toBe(500);
      expect(res.statusCode, `[${label}] expected 400`).toBe(400);
      expect(res.json(), `[${label}] validation envelope`).toMatchObject({
        success: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    }
  });
});

// ===========================================================================
// OTHER /creator/* ROUTES — dashboard, earnings, tier read, tip, credits behave
// unchanged (Req 3.6). Records the auth seam + happy-path envelopes the fix must
// preserve. (Bug 3's fix touches ONLY the /tier/upgrade handler.)
// ===========================================================================
describe('Bug 3 preservation baseline — other /creator/* routes unchanged (Req 3.6)', () => {
  // --- read routes (no route-level scope; protected by the global auth hook) ---
  it('GET /creator/dashboard (authed) -> 200 { success, data:{ overview } }', async () => {
    const sub = freshUser('dashboard');
    const res = await app.inject({
      method: 'GET',
      url: '/creator/dashboard',
      headers: writerHeaders(sub),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { overview: expect.anything() } });
  });

  it('GET /creator/earnings (authed) -> 200 { success, data:{ breakdown } }', async () => {
    const sub = freshUser('earnings');
    const res = await app.inject({
      method: 'GET',
      url: '/creator/earnings',
      headers: writerHeaders(sub),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { breakdown: expect.anything() } });
  });

  it('GET /creator/tier (authed) -> 200 { success, data:{ tier:"free", benefits } } for a fresh creator', async () => {
    const sub = freshUser('tier-read');
    const res = await app.inject({
      method: 'GET',
      url: '/creator/tier',
      headers: writerHeaders(sub),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { tier: 'free', benefits: { tier: 'free' } },
    });
  });

  it('GET /creator/credits (authed) -> 200 { success, data:{ balance, transactions } }', async () => {
    const sub = freshUser('credits-read');
    const res = await app.inject({
      method: 'GET',
      url: '/creator/credits',
      headers: writerHeaders(sub),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true, data: { balance: expect.any(Number) } });
    expect(Array.isArray(body.data.transactions)).toBe(true);
  });

  // --- mutating routes (require creator:write) — the auth seam is unchanged ---
  it('POST /creator/monetization/tip (creator:write) -> 201 { success, data:{ event } }', async () => {
    const sub = freshUser('tip');
    const res = await app.inject({
      method: 'POST',
      url: '/creator/monetization/tip',
      headers: writerHeaders(sub),
      payload: { toCreator: 'creator-xyz', amount: 5 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ success: true, data: { event: expect.anything() } });
  });

  it('POST /creator/credits/earn (creator:write) -> 201 { success, data:{ transaction } }', async () => {
    const sub = freshUser('credits-earn');
    const res = await app.inject({
      method: 'POST',
      url: '/creator/credits/earn',
      headers: writerHeaders(sub),
      payload: { amount: 25, source: 'referral' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ success: true, data: { transaction: expect.anything() } });
  });

  // --- the auth seam on the other /creator/* routes (Req 3.6) ---
  it('unauthenticated GET /creator/dashboard -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'GET', url: '/creator/dashboard' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('POST /creator/monetization/tip WITHOUT creator:write -> 403 FORBIDDEN', async () => {
    const sub = freshUser('tip-noscope');
    const res = await app.inject({
      method: 'POST',
      url: '/creator/monetization/tip',
      headers: { authorization: `Bearer ${signToken(['creator:read'], sub)}` },
      payload: { toCreator: 'creator-xyz', amount: 5 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('POST /creator/credits/earn WITHOUT creator:write -> 403 FORBIDDEN', async () => {
    const sub = freshUser('earn-noscope');
    const res = await app.inject({
      method: 'POST',
      url: '/creator/credits/earn',
      headers: { authorization: `Bearer ${signToken(['creator:read'], sub)}` },
      payload: { amount: 25, source: 'referral' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });
});
