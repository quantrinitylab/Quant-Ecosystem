// @vitest-environment node
// ============================================================================
// Bug 2 — PRESERVATION BASELINE (quantmail OAuth/auth, E2EE, federation)
// engine-wiring-bugs-fix · Task 5 (Phase 2: observation-first baseline)
// ============================================================================
//
// METHODOLOGY (observation-first preservation baseline):
//   This suite records the EXISTING behavior of quantmail's OAuth/auth, E2EE,
//   and federation seams and is EXPECTED TO PASS on the CURRENT (unfixed) code.
//   It locks in the behavior the Bug 2 fix (Task 8 — adding the `exports` map to
//   `@quant/auth`) must NOT regress. It is the `NOT isBugConditionBug2` half of
//   the bug condition: ALL quantmail behavior OTHER than the failing deep-subpath
//   resolution.
//
//   Design Property 5 (Preservation): _for any_ quantmail request where
//   `isBugConditionBug2` does NOT hold, F'(X) = F(X) — the OAuth/auth endpoints
//   keep their responses (incl. the DB-sourced open-redirect-safe
//   `resolveRedirectUri` and the existing 400/401/409 paths), the four deep
//   `@quant/auth/*` specifiers still resolve to the SAME modules (the e2e
//   `vi.mock(...)` targets + `prisma` default/named imports intact), and the
//   E2EE `.strict()` 400 + scope seam and federation seam are unchanged.
//
// **Validates: Requirements 3.3, 3.4**
//
// HARNESS (isolation rationale — lesson from Tasks 1-4):
//   The real `buildApp()` cannot boot yet (Bug 2 unfixed), AND even the existing
//   `createApp()`-based engine-surface harness (`engine-surfaces.seam.test.ts`)
//   now fails to load in this environment: `createApp()`'s prisma plugin imports
//   `@quant/database`, an unbuilt build-output package whose `main` points at a
//   missing `dist/index.js` ("Failed to resolve entry for package
//   @quant/database"). The E2EE/federation route modules also
//   `import { createAppError } from '@quant/server-core'`, whose package entry
//   transitively evaluates that same prisma -> `@quant/database` chain. That is
//   unrelated module-resolution noise that would mask the OAuth/auth/E2EE/
//   federation seam signal.
//
//   So this harness mirrors the established Bug-1 isolation pattern
//   (`agent-seams.preservation.bug1.seam.test.ts`): it composes the SAME seam
//   `createApp()` installs, but from server-core SOURCE plugins —
//     1. the REAL error-handler plugin (../../../../packages/server-core/src/plugins/error-handler)
//        — owns the success/error envelope (ZodError -> 400 VALIDATION_ERROR, AppError -> code);
//     2. the REAL auth plugin (.../plugins/auth) — owns `requireAuth({ scopes })`
//        and the 401/403 envelopes (the E2EE/federation scope seam);
//     3. `createApp()`'s EXACT global auth `onRequest` hook (replicated verbatim)
//        — enforces authentication on every non-public path;
//     4. the REAL quantmail route modules (oauth, auth, e2ee, federation)
//        registered at their production prefixes + the REAL engines decorated.
//   `@quant/server-core` is `vi.mock`ed to re-export the REAL `createAppError`/
//   `isAppError` FROM SOURCE, so the E2EE/federation routes' import is satisfied
//   without ever loading the package entry (and thus `@quant/database`).
//
//   The four deep `@quant/auth/*` specifiers are `vi.mock`ed EXACTLY as the e2e
//   suites (`e2e-auth.test.ts` / `e2e-oauth.test.ts`) do — this is BOTH how the
//   unresolvable subpaths are satisfied on unfixed code AND a faithful model of
//   the seam (the routes consume `TokenService`, `getJwtSecret`/`...Refresh`,
//   `prisma`, `generateId`). The `prisma` mock exposes BOTH a `default` AND a
//   named `prisma` export off the SAME object, because `oauth.ts`/`auth.ts`
//   import the DEFAULT (`import prisma from '@quant/auth/lib/prisma'`) while the
//   e2e tests import the NAMED (`import { prisma } from '@quant/auth/lib/prisma'`)
//   — the Task 8 fix MUST keep both paths valid (asserted below).
//
//   Scope evaluation: `createApp()` also registers `identity-permissions`, which
//   backs `requireAuth` scope checks. When that plugin is absent (as here) the
//   auth plugin falls back to EXACT-MATCH scope semantics (see auth.ts). For the
//   leaf scopes used here (`encryption:*`, `federation:*`) the two paths are
//   behaviorally identical, so the recorded 401/403/2xx matrix is the same
//   baseline production produces.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// --- Isolate the @quant/server-core package entry (@quant/database noise) ---
// The e2ee/federation route modules import { createAppError } from
// '@quant/server-core'. Re-export the REAL implementation from the source
// error-handler plugin so behavior is identical while never evaluating the
// package entry -> app.ts -> prisma -> @quant/database.
vi.mock('@quant/server-core', async () => {
  const eh = await import('../../../../packages/server-core/src/plugins/error-handler');
  return { createAppError: eh.createAppError, isAppError: eh.isAppError };
});

// --- Mock the four deep @quant/auth specifiers (Bug 2: unresolvable on unfixed
//     code; also keeps the seam DB-free). Same targets the e2e suites mock. ---

// prisma: a single in-memory mock exposed as BOTH `default` and named `prisma`.
// oauth.ts/auth.ts import the DEFAULT; the e2e suites import the NAMED — both
// MUST keep resolving to the same module after the Task 8 exports-map fix.
vi.mock('@quant/auth/lib/prisma', () => {
  const p = {
    oAuthClient: { findUnique: vi.fn(), create: vi.fn() },
    oAuthConsent: { findUnique: vi.fn(), upsert: vi.fn() },
    authorizationCode: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  };
  return { default: p, prisma: p };
});

vi.mock('@quant/auth/crypto/secure-random', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}mock_${Math.random().toString(36).slice(2, 8)}`),
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: vi.fn(() => 'test-jwt-secret'),
  getJwtRefreshSecret: vi.fn(() => 'test-refresh-secret'),
}));

vi.mock('@quant/auth/services/token-service', () => {
  class MockTokenService {
    async generateTokenPair() {
      return {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 900,
      };
    }
    // Accept any non-empty bearer (the global JOSE hook has already verified the
    // real token); reject empty. Lets oauth.ts's own `requireAuth` preHandler
    // pass for an already-authenticated request.
    async validateAccessToken(token: string) {
      return token ? { id: 'user-1', sub: 'user-1', email: 'user@test.com' } : null;
    }
    async refreshToken(token: string) {
      if (token === 'good-refresh')
        return { access_token: 'new-access', refresh_token: 'new-refresh' };
      throw new Error('Invalid refresh token');
    }
    async revokeToken() {
      return { revoked: true };
    }
  }
  return { TokenService: MockTokenService };
});

vi.mock('argon2', () => ({
  hash: vi.fn(async (pw: string) => `hashed_${pw}`),
  verify: vi.fn(async (hash: string, pw: string) => hash === `hashed_${pw}`),
}));

// REAL server-core plugins, imported from source (clean: no @quant/database chain).
import errorHandlerPlugin from '../../../../packages/server-core/src/plugins/error-handler';
import authPlugin from '../../../../packages/server-core/src/plugins/auth';

// REAL quantmail route modules under test (oauth/auth consume the mocked
// @quant/auth specifiers; e2ee/federation consume the mocked @quant/server-core).
import { oauthRoutes } from '../routes/oauth';
import { authRoutes } from '../routes/auth';
import e2eeRoutes from '../routes/e2ee';
import federationRoutes, { createFederationService } from '../routes/federation';
import { InMemoryE2EERelay } from '../lib/e2ee-relay';

// The mocked prisma, imported back BOTH ways the codebase depends on it.
import prismaDefaultImport from '@quant/auth/lib/prisma';
import { prisma as prismaNamedImport } from '@quant/auth/lib/prisma';

const db = vi.mocked(
  prismaDefaultImport as unknown as {
    oAuthClient: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    oAuthConsent: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
    authorizationCode: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  },
);

// ---------------------------------------------------------------------------
// Test JWT config — matches the claims the source auth plugin verifies.
// ---------------------------------------------------------------------------
const jwtSecret = 'test-secret-key-that-is-long-enough-for-hs256';
const jwtIssuer = 'quant-test';
const jwtAudience = 'quant-test-audience';

const PUBLIC_PATHS = ['/health', '/healthz', '/ready', '/readyz', '/live', '/livez', '/metrics'];

// Mirror of createApp()'s seam (error-handler + auth + the exact global auth
// onRequest hook), plus the OAuth/auth + E2EE + federation wiring buildApp()
// performs (verbatim engine construction, decoration, and route prefixes).
async function buildBaselineHarness(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // REAL envelope mapper (ZodError -> 400 VALIDATION_ERROR; AppError -> code).
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

  // Auth + OAuth routes (registered WITHOUT a prefix, exactly as buildApp()).
  await app.register(authRoutes);
  await app.register(oauthRoutes);

  // encryption (E2EE) engine — decorated once + scoped routes under /e2ee.
  const e2eeRelay = new InMemoryE2EERelay();
  app.decorate('e2ee', e2eeRelay);
  app.addHook('onClose', async () => {
    e2eeRelay.shutdown();
  });
  await app.register(e2eeRoutes, { prefix: '/e2ee' });

  // federation engine — decorated once + scoped routes under /federation.
  app.decorate('federation', createFederationService());
  await app.register(federationRoutes, { prefix: '/federation' });

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
function signToken(scopes: string[], sub = 'user-1'): string {
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
      email: 'mail@example.com',
      username: 'mailuser',
      role: 'user',
      scopes,
      app: 'quantmail',
    }),
  );
  const signature = base64url(
    createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

// A valid JWT that passes the GLOBAL auth hook (no specific scope needed for the
// OAuth/auth routes, which carry no route-level scope requirement).
const authedHeaders = () => ({ authorization: `Bearer ${signToken([])}` });

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildBaselineHarness();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Harness sanity — the replicated seam app decorates the engines + registers
// the OAuth/auth/e2ee/federation surfaces. (buildApp() itself cannot load — the
// deep @quant/auth subpaths are unresolvable until Task 8.)
// ===========================================================================
describe('Bug 2 preservation baseline — harness sanity', () => {
  it('decorates the engines and registers the OAuth/auth/e2ee/federation surfaces', () => {
    expect(app).toBeTruthy();
    expect(app.e2ee).toBeTruthy();
    expect(app.federation).toBeTruthy();
    const routes = app.printRoutes({ commonPrefix: false });
    for (const path of [
      '/oauth/token',
      '/oauth/authorize',
      '/oauth/consent',
      '/oauth/revoke',
      '/oauth/register',
      '/auth/login',
      '/auth/register',
      '/e2ee/keys',
      '/federation/instances/block',
    ]) {
      expect(routes, `expected route list to contain ${path}`).toContain(path);
    }
  });
});

// ===========================================================================
// SEAM — the global auth hook protects every OAuth/auth path (Req 3.3 baseline).
// Unauthenticated -> 401 UNAUTHORIZED, for ALL OAuth/auth endpoints.
// ===========================================================================
describe('Bug 2 preservation baseline — OAuth/auth global auth seam (unauth -> 401)', () => {
  const PROTECTED = [
    { method: 'POST' as const, url: '/oauth/token' },
    { method: 'POST' as const, url: '/oauth/revoke' },
    { method: 'POST' as const, url: '/oauth/register' },
    { method: 'GET' as const, url: '/oauth/authorize' },
    { method: 'POST' as const, url: '/oauth/consent' },
    { method: 'POST' as const, url: '/auth/login' },
    { method: 'POST' as const, url: '/auth/register' },
  ];

  it.each(PROTECTED)(
    'unauthenticated $method $url -> 401 UNAUTHORIZED',
    async ({ method, url }) => {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
    },
  );
});

// ===========================================================================
// OAuth endpoints — handler behavior observed PAST the global hook (authed).
// Records existing 400 / invalid_grant / unsupported_grant_type / success paths
// and the DB-sourced open-redirect-safe resolveRedirectUri behavior (Req 3.3).
// ===========================================================================
describe('Bug 2 preservation baseline — POST /oauth/token', () => {
  it('no/unsupported grant_type -> 400 unsupported_grant_type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: authedHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'unsupported_grant_type' });
  });

  it('grant_type=refresh_token with an invalid refresh token -> 400 invalid_grant', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: authedHeaders(),
      payload: { grant_type: 'refresh_token', refresh_token: 'bad-refresh' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_grant' });
  });

  it('grant_type=authorization_code with an invalid/expired code -> 400 invalid_grant', async () => {
    db.authorizationCode.findUnique.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: authedHeaders(),
      payload: { grant_type: 'authorization_code', code: 'nope' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'invalid_grant',
      error_description: 'Authorization code expired or invalid',
    });
  });
});

describe('Bug 2 preservation baseline — POST /oauth/revoke', () => {
  it('missing token -> 400 invalid_request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/revoke',
      headers: authedHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('with token -> 200 { success: true } (revoke success path)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/revoke',
      headers: authedHeaders(),
      payload: { token: 'some-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true });
  });
});

describe('Bug 2 preservation baseline — POST /oauth/register', () => {
  it('missing name/redirect_uris -> 400 invalid_request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/register',
      headers: authedHeaders(),
      payload: { name: 'No URIs' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('valid registration -> 200 with client_id (DB-created)', async () => {
    db.oAuthClient.create.mockResolvedValue({
      clientId: 'client_mock_abc',
      name: 'Test App',
    } as never);
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/register',
      headers: authedHeaders(),
      payload: {
        name: 'Test App',
        redirect_uris: ['https://app.test.com/callback'],
        is_confidential: true,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ client_id: 'client_mock_abc', name: 'Test App' });
  });
});

describe('Bug 2 preservation baseline — GET /oauth/authorize (open-redirect-safe resolveRedirectUri)', () => {
  it('response_type != code -> 400 invalid_request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/oauth/authorize?response_type=token&client_id=c1&redirect_uri=https://app.test/cb',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('UNREGISTERED redirect_uri -> 400 invalid_request (open-redirect-safe: not echoed)', async () => {
    // The DB client only knows a safe URI; an attacker-supplied redirect_uri is rejected.
    db.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'c1',
      redirectUris: ['https://app.test/cb'],
    } as never);
    const res = await app.inject({
      method: 'GET',
      url: '/oauth/authorize?response_type=code&client_id=c1&redirect_uri=https://evil.com/steal',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid redirect_uri',
    });
  });

  it('REGISTERED redirect_uri + no prior consent -> 200 consent screen (HTML)', async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'c1',
      redirectUris: ['https://app.test/cb'],
    } as never);
    db.oAuthConsent.findUnique.mockResolvedValue(null);
    const res = await app.inject({
      method: 'GET',
      url: '/oauth/authorize?response_type=code&client_id=c1&redirect_uri=https://app.test/cb&scope=openid',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Authorize Application');
  });

  it('REGISTERED redirect_uri + existing consent -> 302 redirect to the DB-sourced URI with code', async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'c1',
      redirectUris: ['https://app.test/cb'],
    } as never);
    db.oAuthConsent.findUnique.mockResolvedValue({
      userId: 'user-1',
      clientId: 'c1',
      scopes: ['openid'],
    } as never);
    db.authorizationCode.create.mockResolvedValue({} as never);
    const res = await app.inject({
      method: 'GET',
      url: '/oauth/authorize?response_type=code&client_id=c1&redirect_uri=https://app.test/cb&state=xyz',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(302);
    // Redirect target is the DB-registered URI (never the request value), open-redirect safe.
    expect(res.headers.location).toMatch(/^https:\/\/app\.test\/cb\?code=/);
    expect(res.headers.location).toContain('state=xyz');
  });
});

describe('Bug 2 preservation baseline — POST /oauth/consent (open-redirect-safe)', () => {
  it('UNREGISTERED redirect_uri -> 400 invalid_request', async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'c1',
      redirectUris: ['https://app.test/cb'],
    } as never);
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      headers: authedHeaders(),
      payload: {
        action: 'approve',
        client_id: 'c1',
        redirect_uri: 'https://evil.com/x',
        user_id: 'user-1',
        scope: 'openid',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid redirect_uri',
    });
  });

  it('action=approve + REGISTERED redirect_uri -> 302 redirect to DB-sourced URI with code', async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'c1',
      redirectUris: ['https://app.test/cb'],
    } as never);
    db.oAuthConsent.upsert.mockResolvedValue({} as never);
    db.authorizationCode.create.mockResolvedValue({} as never);
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/consent',
      headers: authedHeaders(),
      payload: {
        action: 'approve',
        client_id: 'c1',
        redirect_uri: 'https://app.test/cb',
        user_id: 'user-1',
        scope: 'openid',
        state: 's1',
      },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/app\.test\/cb\?code=/);
    expect(res.headers.location).toContain('state=s1');
  });
});

// ===========================================================================
// auth endpoints — handler behavior observed PAST the global hook (authed).
// Records the existing 400 / 401 invalid_credentials / 409 conflict / 200
// success paths (Req 3.3).
// ===========================================================================
describe('Bug 2 preservation baseline — POST /auth/login', () => {
  it('missing email/password -> 400 standard error envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: authedHeaders(),
      payload: { email: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR', statusCode: 400 },
    });
  });

  it('non-existent user -> 401 INVALID_CREDENTIALS', async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: authedHeaders(),
      payload: { email: 'nobody@test.com', password: 'pw' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', statusCode: 401 },
    });
  });

  it('wrong password -> 401 INVALID_CREDENTIALS', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@test.com',
      username: 'a',
      passwordHash: 'hashed_correct',
      role: 'USER',
    } as never);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: authedHeaders(),
      payload: { email: 'a@test.com', password: 'WRONG' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', statusCode: 401 },
    });
  });

  it('valid credentials -> 200 { success, data: { user, accessToken } }', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@test.com',
      username: 'alice',
      displayName: 'Alice',
      passwordHash: 'hashed_right',
      role: 'USER',
    } as never);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: authedHeaders(),
      payload: { email: 'a@test.com', password: 'right' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      success: true,
      data: {
        userId: 'u1',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: { id: 'u1', email: 'a@test.com', username: 'alice' },
      },
    });
  });
});

describe('Bug 2 preservation baseline — POST /auth/register', () => {
  it('missing required fields -> 400 standard error envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: authedHeaders(),
      payload: { email: 'a@test.com' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR', statusCode: 400 },
    });
  });

  it('duplicate user -> 409 USER_EXISTS', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'existing', email: 'taken@test.com' } as never);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: authedHeaders(),
      payload: { email: 'taken@test.com', username: 'taken', password: 'pw' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'USER_EXISTS', statusCode: 409 },
    });
  });

  it('new user -> 200 { success, data: { user, accessToken } }', async () => {
    db.user.findFirst.mockResolvedValue(null);
    db.user.create.mockResolvedValue({
      id: 'u-new',
      email: 'new@test.com',
      username: 'newuser',
    } as never);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: authedHeaders(),
      payload: { email: 'new@test.com', username: 'newuser', password: 'pw' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      success: true,
      data: {
        userId: 'u-new',
        accessToken: 'mock-access-token',
        user: { id: 'u-new', email: 'new@test.com', username: 'newuser' },
      },
    });
  });
});

// ===========================================================================
// E2EE seam (Req 3.4) — .strict() ciphertext-only 400 rejection + the
// 401/403/2xx scope seam. Mirrors the existing engine-surfaces harness.
// ===========================================================================
const publicBundle = {
  identityKey: 'ik-pub',
  signedPreKey: 'spk-pub',
  signedPreKeySignature: 'spk-sig',
  oneTimePreKey: 'otp-pub',
  registrationId: 1,
};

describe('Bug 2 preservation baseline — E2EE POST /e2ee/keys (encryption:write)', () => {
  const url = '/e2ee/keys';
  const payload = { deviceId: 'device-1', bundle: publicBundle };

  it('unauthenticated -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking encryption:write -> 403 FORBIDDEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${signToken(['encryption:read'])}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with encryption:write -> 201 reaching the relay', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${signToken(['encryption:write'])}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      success: true,
      data: { bundle: { userId: 'user-1', deviceId: 'device-1' } },
    });
  });

  it('SECURITY (.strict()): a forbidden secret field (privateKey) is rejected 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${signToken(['encryption:write'])}` },
      payload: { deviceId: 'device-1', bundle: publicBundle, privateKey: 'LEAKED-SECRET' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('Bug 2 preservation baseline — E2EE GET /e2ee/keys/:userId (encryption:read)', () => {
  const url = '/e2ee/keys/peer-123';

  it('unauthenticated -> 401', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
  });

  it('valid JWT lacking encryption:read -> 403 FORBIDDEN', async () => {
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${signToken(['profile:read'])}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('valid JWT with encryption:read -> 200 reaching the relay', async () => {
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${signToken(['encryption:read'])}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true, data: { userId: 'peer-123' } });
    expect(Array.isArray(body.data.bundles)).toBe(true);
  });
});

// ===========================================================================
// federation seam (Req 3.4) — 401/403/2xx scope seam. Mirrors the existing
// engine-surfaces harness.
// ===========================================================================
describe('Bug 2 preservation baseline — federation POST /federation/instances/block (federation:write)', () => {
  const url = '/federation/instances/block';

  it('unauthenticated -> 401', async () => {
    const res = await app.inject({ method: 'POST', url, payload: { domain: 'spam.example' } });
    expect(res.statusCode).toBe(401);
  });

  it('valid JWT lacking federation:write -> 403 FORBIDDEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${signToken(['federation:read'])}` },
      payload: { domain: 'spam.example' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('valid JWT with federation:write -> 201 reaching the moderation engine', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${signToken(['federation:write'])}` },
      payload: { domain: 'spam.example' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      success: true,
      data: { domain: 'spam.example', blocked: true },
    });
  });
});

describe('Bug 2 preservation baseline — federation GET /federation/instances/:domain (federation:read)', () => {
  const url = '/federation/instances/peer.example';

  it('unauthenticated -> 401', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
  });

  it('valid JWT with federation:read -> 200 reaching the moderation engine', async () => {
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${signToken(['federation:read'])}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true, data: { domain: 'peer.example' } });
    expect(body.data).toHaveProperty('blocked');
    expect(body.data).toHaveProperty('allowed');
  });
});

// ===========================================================================
// CRITICAL FOR THE FIX — deep @quant/auth specifier dependencies.
// Documents the EXACT contract Task 8 (the exports map) must preserve: the four
// deep specifiers are the e2e `vi.mock(...)` targets AND both the default and
// named `prisma` imports are depended upon. A regression (renamed specifier or a
// dropped default/named prisma export) is caught here.
// ===========================================================================
describe('Bug 2 preservation baseline — deep @quant/auth specifier dependency contract', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '../../../..');
  const read = (p: string) => readFileSync(resolve(here, p), 'utf8');
  const readRepo = (p: string) => readFileSync(resolve(repoRoot, p), 'utf8');

  // The four deep subpaths Task 8's exports map must keep valid (-> same modules).
  const DEEP_SPECIFIERS = [
    '@quant/auth/services/token-service',
    '@quant/auth/lib/secrets',
    '@quant/auth/lib/prisma',
    '@quant/auth/crypto/secure-random',
  ] as const;

  it('oauth.ts imports all four deep @quant/auth specifiers (route dependency)', () => {
    const src = read('../routes/oauth.ts');
    for (const spec of DEEP_SPECIFIERS) {
      expect(src, `oauth.ts must import ${spec}`).toContain(spec);
    }
  });

  it('auth.ts depends on prisma (default), secure-random, token-service, and secrets', () => {
    const src = read('../routes/auth.ts');
    for (const spec of [
      '@quant/auth/lib/prisma',
      '@quant/auth/crypto/secure-random',
      '@quant/auth/services/token-service',
      '@quant/auth/lib/secrets',
    ]) {
      expect(src, `auth.ts must import ${spec}`).toContain(spec);
    }
  });

  it('oauth.ts and auth.ts import prisma as a DEFAULT import', () => {
    expect(read('../routes/oauth.ts')).toContain("import prisma from '@quant/auth/lib/prisma'");
    expect(read('../routes/auth.ts')).toContain("import prisma from '@quant/auth/lib/prisma'");
  });

  it('the e2e suites vi.mock all four deep specifiers and import prisma as a NAMED import', () => {
    const eAuth = read('e2e-auth.test.ts');
    const eOauth = read('e2e-oauth.test.ts');
    // Both e2e suites mock the prisma + token-service + secrets + secure-random subpaths.
    for (const spec of DEEP_SPECIFIERS) {
      const mockedSomewhere =
        eAuth.includes(`vi.mock('${spec}'`) || eOauth.includes(`vi.mock('${spec}'`);
      expect(mockedSomewhere, `an e2e suite must vi.mock('${spec}')`).toBe(true);
    }
    // The e2e suites consume the NAMED prisma export.
    expect(eAuth).toContain("import { prisma } from '@quant/auth/lib/prisma'");
    expect(eOauth).toContain("import { prisma } from '@quant/auth/lib/prisma'");
  });

  it('@quant/auth/lib/prisma exposes BOTH a named `prisma` and a default export (source contract)', () => {
    const prismaSrc = readRepo('packages/auth/src/lib/prisma.ts');
    expect(prismaSrc, 'source must export const prisma (named)').toMatch(/export\s+const\s+prisma/);
    expect(prismaSrc, 'source must export default prisma').toMatch(/export\s+default\s+prisma/);
  });

  it('default and named prisma imports resolve to the SAME module object (both styles backed)', () => {
    // The default import (used by oauth.ts/auth.ts) and the named import (used by
    // the e2e suites) must reference the same module instance — Task 8 must not
    // split these into divergent resolutions.
    expect(prismaDefaultImport).toBe(prismaNamedImport);
    expect(prismaDefaultImport).toBeTruthy();
  });
});
