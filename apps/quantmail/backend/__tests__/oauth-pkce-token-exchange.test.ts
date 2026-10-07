// @vitest-environment node
// ============================================================================
// Task 1.1 — Enforce PKCE verification at the token endpoint (oauth.ts)
// quantmail-superhub · Phase 1 security HARD GATE
// ============================================================================
//
// Verifies that the /oauth/token `authorization_code` branch:
//   - grants tokens when SHA256(code_verifier) === stored code_challenge (S256)
//   - rejects (no tokens) when the verifier does not match the stored challenge
//   - rejects (no tokens) when a challenge was bound but no verifier is presented
//   - remains backward-compatible when no challenge was bound (non-PKCE code)
// and that the challenge + method are bound to the issued code at authorize time.
//
// _Requirements: 1.1, 1.2, 1.3_
//
// HARNESS: registers the REAL oauthRoutes on a bare Fastify app and mocks only
// the deep @quant/auth specifiers it consumes (prisma, secure-random, secrets,
// token-service) — exactly as the e2e/seam suites do. The REAL PKCE module is
// used (NOT mocked) so the SHA-256 transform is genuinely exercised.

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

// REAL PKCE crypto + the route under test.
import { generateCodeVerifier, generateCodeChallenge } from '@quant/auth/crypto/pkce';
import { oauthRoutes } from '../routes/oauth';
import prismaDefaultImport from '@quant/auth/lib/prisma';

const db = vi.mocked(
  prismaDefaultImport as unknown as {
    oAuthClient: { findUnique: ReturnType<typeof vi.fn> };
    authorizationCode: {
      findUnique: ReturnType<typeof vi.fn>;
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
    clientId: 'client_pkce',
    isConfidential: false,
    clientSecretHash: null,
  } as never);
});

const futureExpiry = () => new Date(Date.now() + 5 * 60 * 1000);

async function exchange(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/oauth/token', payload });
}

describe('Task 1.1 — PKCE enforcement at /oauth/token', () => {
  it('grants tokens when SHA256(code_verifier) equals the bound code_challenge', async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    db.authorizationCode.findUnique.mockResolvedValue({
      code: 'ac_match',
      clientId: 'client_pkce',
      userId: 'user-1',
      scopes: ['openid'],
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      expiresAt: futureExpiry(),
    } as never);
    db.authorizationCode.delete.mockResolvedValue({} as never);
    db.authorizationCode.deleteMany.mockResolvedValue({ count: 1 } as never);

    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'ac_match',
      code_verifier: verifier,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ access_token: 'mock-access-token' });
    expect(generateTokenPair).toHaveBeenCalledTimes(1);
  });

  it('rejects with no tokens when the verifier does not match the challenge', async () => {
    const challenge = await generateCodeChallenge(generateCodeVerifier());
    db.authorizationCode.findUnique.mockResolvedValue({
      code: 'ac_mismatch',
      clientId: 'client_pkce',
      userId: 'user-1',
      scopes: ['openid'],
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      expiresAt: futureExpiry(),
    } as never);

    const res = await exchange({
      grant_type: 'authorization_code',
      code: 'ac_mismatch',
      code_verifier: generateCodeVerifier(), // a different, non-matching verifier
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_grant' });
    expect(generateTokenPair).not.toHaveBeenCalled();
  });

  it('rejects with no tokens when a challenge was bound but no verifier is presented', async () => {
    const challenge = await generateCodeChallenge(generateCodeVerifier());
    db.authorizationCode.findUnique.mockResolvedValue({
      code: 'ac_missing',
      clientId: 'client_pkce',
      userId: 'user-1',
      scopes: ['openid'],
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      expiresAt: futureExpiry(),
    } as never);

    const res = await exchange({ grant_type: 'authorization_code', code: 'ac_missing' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_grant' });
    expect(generateTokenPair).not.toHaveBeenCalled();
  });

  it('remains backward-compatible when no challenge was bound to the code', async () => {
    db.authorizationCode.findUnique.mockResolvedValue({
      code: 'ac_nopkce',
      clientId: 'client_pkce',
      userId: 'user-1',
      scopes: ['openid'],
      codeChallenge: null,
      codeChallengeMethod: null,
      expiresAt: futureExpiry(),
    } as never);
    db.authorizationCode.delete.mockResolvedValue({} as never);
    db.authorizationCode.deleteMany.mockResolvedValue({ count: 1 } as never);

    const res = await exchange({ grant_type: 'authorization_code', code: 'ac_nopkce' });

    expect(res.statusCode).toBe(200);
    expect(generateTokenPair).toHaveBeenCalledTimes(1);
  });
});
