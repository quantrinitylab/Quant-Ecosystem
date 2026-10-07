// @vitest-environment node
// ============================================================================
// Task 1.4 — Unit tests for redirect binding and auth-code replay (oauth.ts)
// quantmail-superhub · Phase 1 security HARD GATE
// ============================================================================
//
// Verifies the redirect-binding + single-use-code hardening added in Task 1.3:
//   1. redirect_uri rebinding at /oauth/token — the exchange redirect_uri MUST
//      equal the value bound to the code at authorize time; a mismatch is
//      rejected (400 invalid_grant) and issues NO tokens (V6: redirect rebind).
//   2. single-use codes — a second exchange of one code (deleteMany count === 0)
//      is rejected (400) and issues NO tokens (V7: auth-code replay).
//   3. non-allowlisted redirect_uri at /oauth/authorize — resolveRedirectUri
//      returns null when the client's Redirect_Allowlist does not contain the
//      requested URI, so the request is rejected (400 invalid_request,
//      "Invalid redirect_uri") and no code is minted (V4: open redirect).
//
// _Requirements: 1.4, 1.5, 1.6_
//
// HARNESS: registers the REAL `oauthRoutes` on a bare Fastify app and mocks only
// the deep @quant/auth specifiers it consumes (prisma, secure-random, secrets,
// token-service) — exactly as oauth-pkce-token-exchange.test.ts does. Example-based
// (not property-based) per the task. `authorizationCode.deleteMany` is mocked so
// the single-use guard (count === 1 first time, count === 0 on replay) can be
// driven deterministically.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

vi.mock('@quant/auth/lib/prisma', () => {
  const p = {
    oAuthClient: { findUnique: vi.fn(), create: vi.fn() },
    oAuthConsent: { findUnique: vi.fn(), upsert: vi.fn() },
    authorizationCode: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
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

const generateTokenPair = vi.fn(async () => ({
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 900,
}));

vi.mock('@quant/auth/services/token-service', () => {
  class MockTokenService {
    generateTokenPair = generateTokenPair;
    async validateAccessToken(token: string) {
      return token ? { id: 'user-1', sub: 'user-1', email: 'user@test.com' } : null;
    }
    async refreshToken() {
      return { access_token: 'a', refresh_token: 'r' };
    }
    async revokeToken() {
      return { revoked: true };
    }
  }
  return { TokenService: MockTokenService };
});

import { oauthRoutes } from '../routes/oauth';
import prismaDefaultImport from '@quant/auth/lib/prisma';

const db = vi.mocked(
  prismaDefaultImport as unknown as {
    oAuthClient: { findUnique: ReturnType<typeof vi.fn> };
    oAuthConsent: { findUnique: ReturnType<typeof vi.fn> };
    authorizationCode: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    user: { findUnique: ReturnType<typeof vi.fn> };
  },
);

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(oauthRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({
    id: 'user-1',
    email: 'user@test.com',
    username: 'tester',
    role: 'USER',
  } as never);
  db.oAuthClient.findUnique.mockResolvedValue({
    id: 'client-1',
    clientId: 'client_redirect',
    isConfidential: false,
    clientSecretHash: null,
  } as never);
});

const futureExpiry = () => new Date(Date.now() + 5 * 60 * 1000);
const BOUND_REDIRECT = 'https://app.example.com/callback';

async function exchange(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/oauth/token', payload });
}

// ----------------------------------------------------------------------------
// 1.4 (a) — redirect_uri rebinding at the token endpoint (Req 1.4)
// ----------------------------------------------------------------------------
describe('Task 1.4 — redirect_uri rebinding at /oauth/token (Req 1.4)', () => {
  it('rejects with NO tokens when the exchange redirect_uri differs from the bound value', async () => {
    db.authorizationCode.findUnique.mockResolvedValue({
      code: 'ac_rebind',
      clientId: 'client_redirect',
      userId: 'user-1',
      scopes: ['openid'],
      redirectUri: BOUND_REDIRECT,
      codeChallenge: null,
      codeChallengeMethod: null,
      expiresAt: futureExpiry(),
    } as never);
    db.authorizationCode.deleteMany.mockResolvedValue({ count: 1 } as never);

    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'ac_rebind',
      redirect_uri: 'https://attacker.example.com/callback', // not the bound value
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_grant' });
    // No tokens issued...
    expect(generateTokenPair).not.toHaveBeenCalled();
    // ...and the code is NOT consumed on a failed redirect check, so a legitimate
    // retry with the correct redirect_uri can still succeed.
    expect(db.authorizationCode.deleteMany).not.toHaveBeenCalled();
  });

  it('grants tokens when the exchange redirect_uri equals the bound value (positive control)', async () => {
    db.authorizationCode.findUnique.mockResolvedValue({
      code: 'ac_rebind_ok',
      clientId: 'client_redirect',
      userId: 'user-1',
      scopes: ['openid'],
      redirectUri: BOUND_REDIRECT,
      codeChallenge: null,
      codeChallengeMethod: null,
      expiresAt: futureExpiry(),
    } as never);
    db.authorizationCode.deleteMany.mockResolvedValue({ count: 1 } as never);

    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'ac_rebind_ok',
      redirect_uri: BOUND_REDIRECT,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ access_token: 'mock-access-token' });
    expect(generateTokenPair).toHaveBeenCalledTimes(1);
  });
});

// ----------------------------------------------------------------------------
// 1.4 (b) — single-use auth codes: double-exchange / replay (Req 1.6)
// ----------------------------------------------------------------------------
describe('Task 1.4 — single-use auth-code replay rejection (Req 1.6)', () => {
  it('first exchange succeeds and the replay of the same code is rejected with no tokens', async () => {
    db.authorizationCode.findUnique.mockResolvedValue({
      code: 'ac_replay',
      clientId: 'client_redirect',
      userId: 'user-1',
      scopes: ['openid'],
      redirectUri: BOUND_REDIRECT,
      codeChallenge: null,
      codeChallengeMethod: null,
      expiresAt: futureExpiry(),
    } as never);
    // First consumption wins the atomic delete (count === 1); the replay loses
    // the race and observes count === 0.
    db.authorizationCode.deleteMany
      .mockResolvedValueOnce({ count: 1 } as never)
      .mockResolvedValueOnce({ count: 0 } as never);

    // First exchange — succeeds, tokens issued.
    const first = await exchange({
      grant_type: 'authorization_code',
      code: 'ac_replay',
      redirect_uri: BOUND_REDIRECT,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ access_token: 'mock-access-token' });
    expect(generateTokenPair).toHaveBeenCalledTimes(1);

    // Replay of the SAME code — rejected, no second token pair issued.
    generateTokenPair.mockClear();
    const replay = await exchange({
      grant_type: 'authorization_code',
      code: 'ac_replay',
      redirect_uri: BOUND_REDIRECT,
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toMatchObject({ error: 'invalid_grant' });
    expect(generateTokenPair).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// 1.4 (c) — non-allowlisted redirect_uri at /oauth/authorize (Req 1.5)
// ----------------------------------------------------------------------------
describe('Task 1.4 — non-allowlisted redirect_uri at /oauth/authorize (Req 1.5)', () => {
  async function authorize(query: Record<string, unknown>) {
    return app.inject({
      method: 'GET',
      url: '/oauth/authorize',
      query: query as Record<string, string>,
      headers: { authorization: 'Bearer valid-access-token' },
    });
  }

  it('rejects a redirect_uri that is not in the client Redirect_Allowlist and mints no code', async () => {
    // Client is registered, but its allowlist does NOT contain the requested URI.
    db.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'client_abc',
      redirectUris: ['https://app.example.com/callback'],
    } as never);

    const res = await authorize({
      client_id: 'client_abc',
      redirect_uri: 'https://attacker.example.com/callback',
      response_type: 'code',
      scope: 'openid',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'invalid_request',
      error_description: 'Invalid redirect_uri',
    });
    // No authorization code is created for a non-allowlisted redirect.
    expect(db.authorizationCode.create).not.toHaveBeenCalled();
  });

  it('accepts an exact-match allowlisted redirect_uri (positive control)', async () => {
    db.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'client_abc',
      redirectUris: ['https://app.example.com/callback'],
    } as never);
    // No prior consent => render the consent screen rather than auto-approve.
    db.oAuthConsent.findUnique.mockResolvedValue(null as never);

    const res = await authorize({
      client_id: 'client_abc',
      redirect_uri: 'https://app.example.com/callback',
      response_type: 'code',
      scope: 'openid',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});
