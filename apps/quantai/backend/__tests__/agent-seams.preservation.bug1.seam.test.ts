// @vitest-environment node
// ============================================================================
// Bug 1 — PRESERVATION BASELINE (quantai agent seams & resolvable routes)
// engine-wiring-bugs-fix · Task 4 (Phase 2: observation-first baseline)
// ============================================================================
//
// METHODOLOGY (observation-first preservation baseline):
//   This suite records the EXISTING auth-seam behavior of the six already-wired
//   quantai agent surfaces and is EXPECTED TO PASS on the CURRENT (unfixed) code.
//   It locks in the behavior the Bug 1 fix (Task 7) must NOT regress. It is the
//   `NOT isBugConditionBug1` half of the bug condition: the agent surfaces and
//   every route whose `@quant/*` dependency already resolves.
//
//   Design Property 4 (Preservation): _for any_ request to a quantai surface
//   where `isBugConditionBug1` does NOT hold, F'(X) = F(X) — unauthenticated
//   -> 401; valid JWT lacking `agents:execute` -> 403; valid JWT with the scope
//   -> 2xx reaching the decorated engine; existing prefixes/behavior unchanged.
//
// **Validates: Requirements 3.1, 3.2**
//
// HARNESS (isolation rationale — lesson from Tasks 1-3):
//   The real `buildApp()` cannot boot yet (Bug 1 unfixed), and even the existing
//   `createApp()`-based seam harness (`agent-surfaces.seam.test.ts`) fails to load
//   because the agent route modules `import { createAppError } from '@quant/server-core'`,
//   whose package entry transitively evaluates the prisma plugin -> `@quant/database`
//   (an unbuilt build-output package whose `main` points at a missing `dist/index.js`).
//   That is unrelated module-resolution noise that would mask the agent seam signal.
//
//   So this harness mirrors the established isolation pattern: it composes the
//   SAME seam `createApp()` installs, but from server-core SOURCE plugins —
//     1. the REAL auth plugin            (../../../../packages/server-core/src/plugins/auth)
//        — owns `requireAuth({ scopes })` and the 401/403 envelopes;
//     2. the REAL error-handler plugin   (.../plugins/error-handler)
//        — owns the success/error envelope mapping;
//     3. `createApp()`'s EXACT global auth `onRequest` hook (replicated verbatim)
//        — enforces authentication on every non-public path;
//     4. the six REAL engines decorated + the six REAL route modules registered
//        at their production prefixes — the real route+auth+engine seam.
//   `@quant/server-core` is `vi.mock`ed to re-export the REAL `createAppError`/
//   `isAppError` FROM SOURCE, so the route modules' `createAppError` import is
//   satisfied without ever loading the package entry (and thus `@quant/database`).
//
//   Scope evaluation: `createApp()` also registers `identity-permissions`, which
//   backs `requireAuth` scope checks. When that plugin is absent (as here) the
//   auth plugin falls back to EXACT-MATCH scope semantics (see auth.ts). For the
//   leaf scope `agents:execute` the two paths are behaviorally identical (a token
//   either carries the exact scope or it does not), so the recorded 401/403/2xx
//   matrix is the same baseline production produces.
//
// PROPERTY-BASED APPROACH:
//   The input domain is the finite cartesian product { agent surface } x
//   { auth state }. Auth states are GENERATED: random invalid bearer tokens
//   (unauth), random scope-sets drawn from a pool that EXCLUDES `agents:execute`
//   (insufficient), and random scope-sets that INCLUDE `agents:execute` plus
//   noise (sufficient). The universally-quantified invariant (the seam matrix)
//   is asserted to hold for every generated (surface, auth-state) sample.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// --- Isolate the @quant/server-core package entry (Bug-1 / @quant/database noise) ---
// Route modules import { createAppError } from '@quant/server-core'. Re-export the
// REAL implementation from the source error-handler plugin so behavior is identical
// while never evaluating the package entry -> app.ts -> prisma -> @quant/database.
vi.mock('@quant/server-core', async () => {
  const eh = await import('../../../../packages/server-core/src/plugins/error-handler');
  return { createAppError: eh.createAppError, isAppError: eh.isAppError };
});

// REAL server-core plugins, imported from source (clean: no @quant/database chain).
import errorHandlerPlugin from '../../../../packages/server-core/src/plugins/error-handler';
import authPlugin from '../../../../packages/server-core/src/plugins/auth';

// REAL engines (all clean — verified to not transitively import @quant/database).
import { Orchestrator } from '@quant/agent-runtime';
import { SwarmOrchestrator } from '@quant/agent-swarm';
import { CrossAppOrchestrator, allTools } from '@quant/quant-tools';
import { SessionManager } from '@quant/browser-agent';
import { CodeAnalyzer } from '@quant/code-agent';
import { ModelRegistry } from '@quant/user-owned-ai';

// REAL route modules (the surfaces under test), as shipped.
import agentRuntimeRoutes from '../routes/agent-runtime';
import agentSwarmRoutes from '../routes/agent-swarm';
import quantToolsRoutes from '../routes/quant-tools';
import browserAgentRoutes from '../routes/browser-agent';
import codeAgentRoutes from '../routes/code-agent';
import userOwnedAiRoutes from '../routes/user-owned-ai';

// ---------------------------------------------------------------------------
// Test JWT config — matches the claims the source auth plugin verifies.
// ---------------------------------------------------------------------------
const jwtSecret = 'test-secret-key-that-is-long-enough-for-hs256';
const jwtIssuer = 'quant-test';
const jwtAudience = 'quant-test-audience';

const PUBLIC_PATHS = ['/health', '/healthz', '/ready', '/readyz', '/live', '/livez', '/metrics'];

// Mirror of createApp()'s seam (error-handler + auth + the exact global auth
// onRequest hook), plus the agent engine wiring + route registration that
// buildApp() performs. This reproduces the production seam the surfaces sit on.
async function buildAgentSeamHarness(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // REAL envelope mapper.
  await app.register(errorHandlerPlugin);

  // REAL auth substrate (decorates requireAuth + request.auth).
  await app.register(authPlugin, { jwtSecret, jwtIssuer, jwtAudience });

  // createApp()'s global auth enforcement hook — replicated VERBATIM so every
  // non-public path requires authentication exactly as in production.
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))) {
      return;
    }
    await app.requireAuth()(request, reply);
    if (reply.sent) return;
  });

  // The six agent engines, constructed + decorated exactly as buildApp() does.
  // The Orchestrator's only construction dependency is an AI inference adapter
  // (an external I/O boundary); a stub is supplied because the agent-runtime
  // happy path's engine call (`executeTask`) is spied per the design's Testing
  // Strategy (spy ONLY the external boundary; keep the auth+route+engine seam real).
  const agentRuntime = new Orchestrator({ infer: async (prompt: string) => prompt });
  app.decorate('agentRuntime', agentRuntime);
  app.decorate('agentSwarm', new SwarmOrchestrator());
  app.decorate('quantTools', new CrossAppOrchestrator(allTools));
  app.decorate('browserAgent', new SessionManager());
  app.decorate('codeAgent', new CodeAnalyzer());
  app.decorate('userOwnedAi', new ModelRegistry());

  // The six route modules at their production prefixes (unchanged behavior/prefixes).
  await app.register(agentRuntimeRoutes, { prefix: '/agents' });
  await app.register(agentSwarmRoutes, { prefix: '/agents/swarm' });
  await app.register(quantToolsRoutes, { prefix: '/tools' });
  await app.register(browserAgentRoutes, { prefix: '/agents/browser' });
  await app.register(codeAgentRoutes, { prefix: '/agents/code' });
  await app.register(userOwnedAiRoutes, { prefix: '/agents/owned' });

  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// HS256 JWT signing (mirrors the existing seam harness) — the source auth
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
function signToken(scopes: string[]): string {
  jtiCounter += 1;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: jwtIssuer,
      aud: jwtAudience,
      sub: 'user-123',
      jti: `seam-${jtiCounter}`,
      iat: now,
      exp: now + 3600,
      email: 'agent@example.com',
      username: 'agentuser',
      role: 'user',
      scopes,
      app: 'quantai',
    }),
  );
  const signature = base64url(
    createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

// ---------------------------------------------------------------------------
// Deterministic seeded RNG (mulberry32) so the generated samples are
// reproducible across runs — a failing sample is always reproducible.
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
const rand = mulberry32(0x51_4a_4f_42);

const REQUIRED_SCOPE = 'agents:execute';
// A pool of plausible OTHER scopes that do NOT grant `agents:execute`.
const OTHER_SCOPES = [
  'profile:read',
  'profile:write',
  'email:send',
  'email:read',
  'calendar:read',
  'agents:read',
  'tools:read',
  'storage:read',
] as const;

function sample<T>(items: readonly T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i += 1) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool.splice(idx, 1)[0] as T);
  }
  return out;
}

// Generate N scope-sets that LACK the required scope (incl. the empty set).
function generateInsufficientScopeSets(n: number): string[][] {
  const sets: string[][] = [[]];
  for (let i = 0; i < n; i += 1) {
    const size = Math.floor(rand() * (OTHER_SCOPES.length + 1));
    sets.push(sample(OTHER_SCOPES, size));
  }
  return sets;
}

// Generate N scope-sets that INCLUDE the required scope (plus random noise).
function generateSufficientScopeSets(n: number): string[][] {
  const sets: string[][] = [[REQUIRED_SCOPE]];
  for (let i = 0; i < n; i += 1) {
    const size = Math.floor(rand() * OTHER_SCOPES.length);
    sets.push([...sample(OTHER_SCOPES, size), REQUIRED_SCOPE]);
  }
  return sets;
}

// Generate N malformed/invalid bearer tokens (the "unauthenticated" class).
function generateInvalidTokens(n: number): string[] {
  const out: string[] = ['', 'not-a-jwt', 'a.b.c'];
  for (let i = 0; i < n; i += 1) {
    out.push(`${base64url(`${rand()}`)}.${base64url(`${rand()}`)}.${base64url(`${rand()}`)}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The agent surfaces. `scoped` surfaces require `agents:execute` for their
// state-changing entry point; `user-owned-ai` is a read-only catalog (no extra
// scope) so it only spans the unauth/authed states (no insufficient-scope case).
// `reach` proves the decorated engine was actually reached on the happy path.
// ---------------------------------------------------------------------------
interface AgentSurface {
  name: string;
  method: 'POST' | 'GET';
  url: string;
  body?: Record<string, unknown>;
  scoped: boolean;
  okStatus: number;
  // Optional: install/cleanup a spy on the external engine boundary; returns the
  // spy so the test can assert the route reached the decorated engine.
  installEngineSpy?: (app: FastifyInstance) => { assertReached: () => void; restore: () => void };
}

const SURFACES: AgentSurface[] = [
  {
    name: 'agent-runtime POST /agents/runtime/tasks',
    method: 'POST',
    url: '/agents/runtime/tasks',
    body: { task: 'Organize my inbox' },
    scoped: true,
    okStatus: 201,
    installEngineSpy: (app) => {
      const canned = {
        id: 'task-seam-1',
        description: 'Organize my inbox',
        status: 'completed' as const,
        subtasks: [],
        startedAt: Date.now(),
        completedAt: Date.now(),
      };
      const spy = vi.spyOn(app.agentRuntime, 'executeTask').mockResolvedValue(canned);
      return {
        assertReached: () => expect(spy).toHaveBeenCalled(),
        restore: () => spy.mockRestore(),
      };
    },
  },
  {
    name: 'agent-swarm POST /agents/swarm/goals',
    method: 'POST',
    url: '/agents/swarm/goals',
    body: {
      description: 'Plan a launch',
      budget: { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 },
    },
    scoped: true,
    okStatus: 201,
  },
  {
    name: 'quant-tools POST /tools/orchestrator/execute',
    method: 'POST',
    url: '/tools/orchestrator/execute',
    body: { input: 'summarize my unread email', dryRun: true },
    scoped: true,
    okStatus: 201,
  },
  {
    name: 'browser-agent POST /agents/browser/sessions',
    method: 'POST',
    url: '/agents/browser/sessions',
    body: { siteUrl: 'https://example.com' },
    scoped: true,
    okStatus: 201,
  },
  {
    name: 'code-agent POST /agents/code/analyze',
    method: 'POST',
    url: '/agents/code/analyze',
    body: { paths: ['src/index.ts', 'package.json'] },
    scoped: true,
    okStatus: 200,
  },
  {
    name: 'user-owned-ai GET /agents/owned/models',
    method: 'GET',
    url: '/agents/owned/models',
    scoped: false,
    okStatus: 200,
  },
];

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildAgentSeamHarness();
});

afterAll(async () => {
  await app.close();
});

function inject(surface: AgentSurface, headers: Record<string, string> = {}) {
  return app.inject({
    method: surface.method,
    url: surface.url,
    headers,
    ...(surface.body !== undefined ? { payload: surface.body } : {}),
  });
}

// Sample sizes for the generated auth-state classes (kept modest so the suite
// stays fast while still exercising many randomized scope-sets per surface).
const N = 12;

describe('Bug 1 preservation baseline — agent-surface auth seam matrix (Property 4)', () => {
  // -------------------------------------------------------------------------
  // PROPERTY 4a — Unauthenticated -> 401 UNAUTHORIZED, for ALL surfaces and ALL
  // generated invalid/absent bearer tokens.
  // -------------------------------------------------------------------------
  describe.each(SURFACES)('surface: $name', (surface) => {
    it('FOR ALL unauthenticated requests -> 401 UNAUTHORIZED', async () => {
      // No Authorization header at all.
      const noHeader = await inject(surface);
      expect(noHeader.statusCode).toBe(401);
      expect(noHeader.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });

      // Random malformed/invalid bearer tokens.
      for (const bad of generateInvalidTokens(N)) {
        const res = await inject(surface, { authorization: `Bearer ${bad}` });
        expect(res.statusCode, `invalid token sample: ${JSON.stringify(bad)}`).toBe(401);
        expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
      }
    });
  });

  // -------------------------------------------------------------------------
  // PROPERTY 4b — Valid JWT WITHOUT `agents:execute` -> 403 FORBIDDEN, for ALL
  // scoped surfaces and ALL generated insufficient scope-sets.
  // (user-owned-ai is read-only / unscoped, so it has no insufficient case.)
  // -------------------------------------------------------------------------
  describe.each(SURFACES.filter((s) => s.scoped))('scoped surface: $name', (surface) => {
    it('FOR ALL valid JWTs lacking `agents:execute` -> 403 FORBIDDEN', async () => {
      for (const scopes of generateInsufficientScopeSets(N)) {
        const token = signToken(scopes);
        const res = await inject(surface, { authorization: `Bearer ${token}` });
        expect(res.statusCode, `scope-set: ${JSON.stringify(scopes)}`).toBe(403);
        expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
      }
    });
  });

  // -------------------------------------------------------------------------
  // PROPERTY 4c — Valid JWT WITH `agents:execute` -> 2xx reaching the decorated
  // engine, for ALL scoped surfaces and ALL generated sufficient scope-sets.
  // -------------------------------------------------------------------------
  describe.each(SURFACES.filter((s) => s.scoped))('scoped surface: $name', (surface) => {
    it('FOR ALL valid JWTs with `agents:execute` -> 2xx and reaches the engine', async () => {
      for (const scopes of generateSufficientScopeSets(N)) {
        const spy = surface.installEngineSpy?.(app);
        try {
          const token = signToken(scopes);
          const res = await inject(surface, { authorization: `Bearer ${token}` });
          expect(res.statusCode, `scope-set: ${JSON.stringify(scopes)}`).toBe(surface.okStatus);
          expect(res.json()).toMatchObject({ success: true });
          expect(res.json()).toHaveProperty('data');
          spy?.assertReached();
        } finally {
          spy?.restore();
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 4 (read-only surface) — user-owned-ai catalog: unauth -> 401;
// valid JWT (ANY scope-set, including none) -> 200 reaching the engine.
// ---------------------------------------------------------------------------
describe('Bug 1 preservation baseline — user-owned-ai read-only catalog seam', () => {
  const surface = SURFACES.find((s) => !s.scoped)!;

  it('unauthenticated -> 401 UNAUTHORIZED', async () => {
    const res = await inject(surface);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('FOR ALL valid JWTs (any scope-set) -> 200 and reaches the engine', async () => {
    const scopeSets = [[], ...generateInsufficientScopeSets(4), ...generateSufficientScopeSets(4)];
    for (const scopes of scopeSets) {
      const token = signToken(scopes);
      const res = await inject(surface, { authorization: `Bearer ${token}` });
      expect(res.statusCode, `scope-set: ${JSON.stringify(scopes)}`).toBe(200);
      expect(res.json()).toMatchObject({ success: true, data: { models: expect.any(Array) } });
    }
  });
});

// ---------------------------------------------------------------------------
// PROPERTY 4 (prefixes) — the already-resolvable agent route modules register
// at their EXISTING production prefixes with unchanged behavior. Records the
// prefix surface that the Bug 1 fix must preserve.
// ---------------------------------------------------------------------------
describe('Bug 1 preservation baseline — agent route prefixes unchanged', () => {
  const EXPECTED_PREFIXES = [
    '/agents/runtime/tasks',
    '/agents/swarm/goals',
    '/tools/orchestrator/execute',
    '/agents/browser/sessions',
    '/agents/code/analyze',
    '/agents/owned/models',
  ] as const;

  it('registers every agent surface at its existing prefix', () => {
    // `commonPrefix: false` prints flat, fully-qualified paths (one per line)
    // instead of the default compressed radix tree, so multi-segment prefixes
    // can be matched directly.
    const routes = app.printRoutes({ commonPrefix: false });
    for (const prefix of EXPECTED_PREFIXES) {
      expect(routes, `expected route list to contain ${prefix}`).toContain(prefix);
    }
  });
});
