// @vitest-environment node
// ============================================================================
// Bug 3 exploration test — quantube POST /creator/tier/upgrade
// (engine-wiring-bugs-fix spec, Task 3)
// ============================================================================
//
// PURPOSE (bug-condition / exploratory check, run on UNFIXED code):
//   Reproduce Bug 3 — a forbidden/ineligible creator-tier transition surfaces as
//   HTTP 500 / INTERNAL_ERROR instead of the correct 403 / FORBIDDEN.
//
//   `TierService.upgradeTier()` throws a PLAIN `new Error(...)` for a non-upward
//   transition (`Cannot upgrade from <current> to <new>`) and for an ineligible
//   upgrade (`Creator <id> is not eligible for tier <new>`). The quantube route
//   `POST /creator/tier/upgrade` (apps/quantube/backend/routes/creator.ts) calls
//   `upgradeTier` WITHOUT translating that domain rejection, so the @quant/server-core
//   error handler's final branch maps the plain Error to 500 / INTERNAL_ERROR.
//
//   This test asserts the EXPECTED (fixed) behavior — 403 / FORBIDDEN — for three
//   post-Zod bug-condition cases. On UNFIXED code it therefore FAILS (the route
//   returns 500). That failure is the SUCCESS outcome of this exploration step: it
//   confirms the bug and will validate the fix in Task 9.2.
//   ==> DO NOT "fix" this test or the handler here. Task 9 owns the fix.
//
// HARNESS (isolation rationale — lesson from Tasks 1 & 2):
//   quantube's real `buildApp()` (and `@quant/server-core`'s `createApp()`) transitively
//   import the prisma plugin, which imports `@quant/database` — a package whose
//   `package.json` `main` points at an unbuilt `dist/index.js`. In this workspace that
//   raises "Failed to resolve entry for package '@quant/database'", unrelated noise that
//   would mask the Bug 3 signal. So this test builds a MINIMAL Fastify harness that wires
//   together exactly the three real components whose interaction produces the bug:
//     1. the REAL route handler         — `creatorRoutes` (../routes/creator), as-shipped;
//     2. the REAL status-code mapper     — `@quant/server-core`'s error-handler plugin,
//        imported directly from source to avoid the @quant/database import chain;
//     3. the REAL domain engine          — `TierService` via `createCreatorEconomyService()`.
//   The caller is authenticated with the `creator:write` scope (the route's required
//   scope) through a minimal `requireAuth` decorator that mirrors server-core's contract
//   (returns a preHandler that populates `request.auth`). Auth is NOT the subject under
//   test here — the bug condition is evaluated POST-auth / POST-Zod — so a focused auth
//   shim is sufficient while the handler's real status-code mapping is exercised end to
//   end via Fastify `inject()`.
//
// Bug condition (design `isBugConditionBug3`, request already passed Zod):
//   non-upward transition (indexOf(newTier) <= indexOf(current))  OR  ineligible caller.
//
// Concrete counterexamples asserted (EXPECTED 403, ACTUAL 500 on unfixed code):
//   - pro -> starter  (downgrade)                       — Req 1.5
//   - pro -> pro      (same tier)                       — Req 1.5
//   - free -> starter with earnings 50 (threshold 100)  — Req 1.6 (ineligible)
//
// **Validates: Requirements 1.5, 1.6, 1.7**

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// Import the REAL server-core error-handler plugin from source directly. Importing it
// via the `@quant/server-core` package entry would evaluate `./app` -> prisma plugin ->
// `@quant/database` (unbuilt dist) and fail; the deep source import sidesteps that while
// still exercising the exact plugin that performs the 500-vs-403 status mapping.
import errorHandlerPlugin from '../../../../packages/server-core/src/plugins/error-handler';
import creatorRoutes, { createCreatorEconomyService } from '../routes/creator';

// Build the isolated Bug 3 harness: real error handler + real creator routes + real
// creator-economy engines, with a minimal auth shim granting the caller `creator:write`.
async function buildCreatorHarness(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // REAL status-code mapper under test (plain Error -> 500; AppError -> its statusCode/code).
  await app.register(errorHandlerPlugin);

  // Minimal requireAuth mirroring server-core's contract: a factory returning a preHandler
  // that authenticates the caller and attaches `request.auth`. The harness grants whatever
  // scopes the route requires (creator:write) so execution reaches the handler; the userId
  // is taken from a test header so each case can use an isolated creator identity.
  app.decorate('requireAuth', (opts?: { scopes?: string[] }) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      const userId = (request.headers['x-test-user'] as string | undefined) ?? 'user-123';
      (request as unknown as { auth: unknown }).auth = {
        userId,
        scopes: opts?.scopes ?? [],
        email: `${userId}@example.com`,
        role: 'user',
      };
    };
  });

  // REAL creator-economy engines (TierService et al.), wired exactly as quantube ships them.
  app.decorate('creatorEconomy', createCreatorEconomyService());

  // REAL route module, mounted at the production prefix.
  await app.register(creatorRoutes, { prefix: '/creator' });

  await app.ready();
  return app;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildCreatorHarness();
});

afterAll(async () => {
  await app.close();
});

// Helper: POST /creator/tier/upgrade as `userId` (authenticated w/ creator:write).
function upgrade(userId: string, tier: string) {
  return app.inject({
    method: 'POST',
    url: '/creator/tier/upgrade',
    headers: { 'x-test-user': userId },
    payload: { tier },
  });
}

describe('Bug 3 exploration: POST /creator/tier/upgrade returns 403 for forbidden/ineligible transitions', () => {
  // EXPECTED (fixed) behavior is asserted below. On UNFIXED code each of these returns
  // 500 / INTERNAL_ERROR (TierService.upgradeTier throws a plain Error) — so the test
  // FAILS now, which CONFIRMS the bug. The recorded counterexample is the 500 response.

  it('pro -> starter (downgrade) -> 403 FORBIDDEN (Req 1.5)', async () => {
    const userId = 'bug3-downgrade-user';
    app.creatorEconomy.tiers.setTier(userId, 'pro');

    const res = await upgrade(userId, 'starter');

    // Counterexample on unfixed code: res.statusCode === 500, error.code === 'INTERNAL_ERROR'.
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('pro -> pro (same tier) -> 403 FORBIDDEN (Req 1.5)', async () => {
    const userId = 'bug3-same-tier-user';
    app.creatorEconomy.tiers.setTier(userId, 'pro');

    const res = await upgrade(userId, 'pro');

    // Counterexample on unfixed code: res.statusCode === 500, error.code === 'INTERNAL_ERROR'.
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('free -> starter with earnings 50 (threshold 100, ineligible) -> 403 FORBIDDEN (Req 1.6)', async () => {
    const userId = 'bug3-ineligible-user';
    // tier defaults to 'free'; earnings 50 is below the starter threshold (100).
    app.creatorEconomy.tiers.setEarnings(userId, 50);

    const res = await upgrade(userId, 'starter');

    // Counterexample on unfixed code: res.statusCode === 500, error.code === 'INTERNAL_ERROR'.
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });
});

// ===========================================================================
// Bug 3 FIX-CHECK extension — PROPERTY 3 (Expected Behavior), property-based.
// engine-wiring-bugs-fix · Task 9.2 (Phase 3: verify the fix generalizes).
// ===========================================================================
//
// The three cases above are the concrete fix-check counterexamples (re-run from
// Task 3, unchanged). This block GENERALIZES them: it quantifies over the WHOLE
// Bug 3 condition class and asserts the fixed handler maps EVERY such request to
// 403 FORBIDDEN — and that HTTP 500 NEVER occurs for these non-faulting inputs.
//
// Design Property 3 (Expected Behavior): _for any_ POST /creator/tier/upgrade
// request where `isBugConditionBug3(req)` holds, F'(X) = 403 FORBIDDEN. The bug
// condition (request already past Zod) is precisely:
//   non-upward  = TIER.indexOf(newTier) <= TIER.indexOf(currentTier)
//                 (a downgrade or a same-tier "upgrade"); OR
//   ineligible  = an upward transition (newIdx > currentIdx) whose caller earnings
//                 are below the new tier's threshold.
// Both sub-classes make `TierService.upgradeTier` throw a PLAIN Error; the FIXED
// route classifies them with the engine's own read predicates (getTier /
// checkEligibility) and re-issues a 403 FORBIDDEN AppError. Genuine-fault inputs
// (which would legitimately map to 500) are EXCLUDED by construction — the only
// two throw paths in `upgradeTier` are exactly these two bug-condition branches.
//
// fast-check is NOT installed in this workspace, so generation uses the same
// seeded mulberry32 RNG convention as the Task 6 preservation baseline
// (creator-tier-upgrade.preservation.bug3.seam.test.ts) — reproducible samples,
// reproducible failures. The harness is the SAME real-error-handler + real
// creatorRoutes + createCreatorEconomyService harness used by the three cases
// above (the real classification is exercised — nothing is mocked).
//
// **Validates: Requirements 2.5, 2.6, 2.7**

// Deterministic seeded RNG (mulberry32) — mirrors the Task 6 baseline convention.
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
// so the generators construct exactly the bug-condition (non-upward / ineligible) class.
const PBT_TIERS = ['free', 'starter', 'pro', 'enterprise'] as const;
type PbtTier = (typeof PBT_TIERS)[number];
const PBT_THRESHOLDS: Record<PbtTier, number> = {
  free: 0,
  starter: 100,
  pro: 1000,
  enterprise: 10000,
};

interface Bug3Case {
  currentTier: PbtTier;
  newTier: PbtTier;
  earnings: number;
  kind: 'non-upward' | 'ineligible';
}

// NON-UPWARD class: newIdx <= currentIdx (downgrade or same-tier). Earnings are
// drawn WIDELY (including amounts large enough to satisfy eligibility) to prove
// the non-upward classification dominates regardless of eligibility.
function generateNonUpward(n: number): Bug3Case[] {
  const out: Bug3Case[] = [];
  for (let i = 0; i < n; i += 1) {
    const currentIdx = Math.floor(rand() * PBT_TIERS.length); // 0..3
    const newIdx = Math.floor(rand() * (currentIdx + 1)); // 0..currentIdx => newIdx <= currentIdx
    const earnings = Math.floor(rand() * 15000); // wide range, often "eligible"
    out.push({
      currentTier: PBT_TIERS[currentIdx] as PbtTier,
      newTier: PBT_TIERS[newIdx] as PbtTier,
      earnings,
      kind: 'non-upward',
    });
  }
  return out;
}

// INELIGIBLE class: a strictly-upward transition (newIdx > currentIdx) whose
// earnings sit BELOW the new tier's threshold. currentIdx in 0..2 guarantees a
// strictly-higher target exists; the upward target is always >= 'starter' so its
// threshold is >= 100, and earnings in [0, threshold-1] make checkEligibility false.
function generateIneligible(n: number): Bug3Case[] {
  const out: Bug3Case[] = [];
  for (let i = 0; i < n; i += 1) {
    const currentIdx = Math.floor(rand() * (PBT_TIERS.length - 1)); // 0..2 (room above)
    const span = PBT_TIERS.length - 1 - currentIdx;
    const newIdx = currentIdx + 1 + Math.floor(rand() * span); // strictly upward
    const newTier = PBT_TIERS[newIdx] as PbtTier;
    const threshold = PBT_THRESHOLDS[newTier]; // >= 100 for any upward target
    const earnings = Math.floor(rand() * threshold); // 0..threshold-1 => ineligible
    out.push({
      currentTier: PBT_TIERS[currentIdx] as PbtTier,
      newTier,
      earnings,
      kind: 'ineligible',
    });
  }
  return out;
}

let pbtUid = 0;
const PBT_N = 30;

describe('Bug 3 fix-check (Property 3, PBT): FOR ALL bug-condition requests -> 403 FORBIDDEN, never 500', () => {
  it('FOR ALL non-upward transitions (downgrade or same-tier) -> 403 FORBIDDEN, never 500 (Req 2.5)', async () => {
    const cases = generateNonUpward(PBT_N);
    // Surface a few generated samples so coverage of the counter-class is visible.
    console.info(
      'Bug3 PBT non-upward samples:',
      cases
        .slice(0, 4)
        .map((c) => `${c.currentTier}->${c.newTier} @${c.earnings}`)
        .join(', '),
    );
    for (const c of cases) {
      pbtUid += 1;
      const userId = `bug3-pbt-nonupward-${pbtUid}`;
      app.creatorEconomy.tiers.setTier(userId, c.currentTier);
      app.creatorEconomy.tiers.setEarnings(userId, c.earnings);

      const res = await upgrade(userId, c.newTier);
      const label = `${c.currentTier}->${c.newTier} @${c.earnings}`;

      expect(res.statusCode, `[${label}] 500 must never occur`).not.toBe(500);
      expect(res.statusCode, `[${label}] expected 403`).toBe(403);
      expect(res.json(), `[${label}] forbidden envelope`).toMatchObject({
        success: false,
        error: { code: 'FORBIDDEN' },
      });
    }
  });

  it('FOR ALL ineligible upward transitions (earnings below threshold) -> 403 FORBIDDEN, never 500 (Req 2.6)', async () => {
    const cases = generateIneligible(PBT_N);
    console.info(
      'Bug3 PBT ineligible samples:',
      cases
        .slice(0, 4)
        .map(
          (c) => `${c.currentTier}->${c.newTier} @${c.earnings} (thr ${PBT_THRESHOLDS[c.newTier]})`,
        )
        .join(', '),
    );
    for (const c of cases) {
      pbtUid += 1;
      const userId = `bug3-pbt-ineligible-${pbtUid}`;
      app.creatorEconomy.tiers.setTier(userId, c.currentTier);
      app.creatorEconomy.tiers.setEarnings(userId, c.earnings);

      const res = await upgrade(userId, c.newTier);
      const label = `${c.currentTier}->${c.newTier} @${c.earnings} (thr ${PBT_THRESHOLDS[c.newTier]})`;

      expect(res.statusCode, `[${label}] 500 must never occur`).not.toBe(500);
      expect(res.statusCode, `[${label}] expected 403`).toBe(403);
      expect(res.json(), `[${label}] forbidden envelope`).toMatchObject({
        success: false,
        error: { code: 'FORBIDDEN' },
      });
    }
  });
});
