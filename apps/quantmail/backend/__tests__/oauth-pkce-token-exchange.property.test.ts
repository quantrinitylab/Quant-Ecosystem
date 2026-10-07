// @vitest-environment node
// ============================================================================
// Task 1.2 — Property test: PKCE rejects mismatched verifier (oauth.ts)
// quantmail-superhub · Phase 1 security HARD GATE
// ============================================================================
//
// Feature: quantmail-superhub, Property 1: PKCE rejects mismatched verifier
//
// **Property P1 (PKCE soundness)** — for any random code_verifier/code_challenge
// pair where SHA256(verifier) != challenge, the token exchange is rejected and
// issues no tokens; for a matching pair (challenge == SHA256(verifier)) it
// succeeds and issues a token pair.
//
// **Validates: Requirements 1.2, 1.3**
//
// HARNESS: registers the REAL `oauthRoutes` on a bare Fastify app and mocks only
// the deep @quant/auth specifiers it consumes (prisma, secure-random, secrets,
// token-service) — exactly as the example-based suite (oauth-pkce-token-exchange.test.ts)
// does. The REAL PKCE module is used (NOT mocked) so the SHA-256 transform is
// genuinely exercised across randomized inputs. Library: fast-check, >= 100 runs
// per property (the ecosystem's JS property-testing tool).

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fc from 'fast-check';

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
import { generateCodeChallenge } from '@quant/auth/crypto/pkce';
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
    clientId: 'client_prop',
    isConfidential: false,
    clientSecretHash: null,
  } as never);
});

const futureExpiry = () => new Date(Date.now() + 5 * 60 * 1000);

async function exchange(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/oauth/token', payload });
}

// ----------------------------------------------------------------------------
// Generator — RFC 7636 §4.1 code_verifier: 43–128 chars from the unreserved set
// [A-Z a-z 0-9 - . _ ~]. Driven by fast-check (not crypto RNG) so counterexamples
// shrink. The route feeds the verifier straight into the REAL SHA-256 transform,
// so any string exercises the same code path; constraining to the legal alphabet
// keeps the inputs faithful to real PKCE clients.
// ----------------------------------------------------------------------------
const VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'.split(
  '',
);

const verifierArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...VERIFIER_CHARS), { minLength: 43, maxLength: 128 })
  .map((chars) => chars.join(''));

describe('Feature: quantmail-superhub, Property 1: PKCE rejects mismatched verifier', () => {
  it('rejects with NO tokens whenever SHA256(verifier) != bound challenge (Req 1.3)', async () => {
    await fc.assert(
      fc.asyncProperty(verifierArb, verifierArb, async (presented, bound) => {
        // Distinct verifiers => distinct SHA-256 challenges (collision-free in
        // practice), so the bound challenge cannot equal SHA256(presented).
        fc.pre(presented !== bound);

        const boundChallenge = await generateCodeChallenge(bound);
        const presentedChallenge = await generateCodeChallenge(presented);
        fc.pre(presentedChallenge !== boundChallenge);

        generateTokenPair.mockClear();
        db.authorizationCode.findUnique.mockResolvedValue({
          code: 'ac_mismatch',
          clientId: 'client_prop',
          userId: 'user-1',
          scopes: ['openid'],
          codeChallenge: boundChallenge,
          codeChallengeMethod: 'S256',
          expiresAt: futureExpiry(),
        } as never);
        db.authorizationCode.delete.mockResolvedValue({} as never);
        db.authorizationCode.deleteMany.mockResolvedValue({ count: 1 } as never);

        const res = await exchange({
          grant_type: 'authorization_code',
          code: 'ac_mismatch',
          code_verifier: presented,
        });

        // Rejected, and crucially NO tokens were issued.
        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ error: 'invalid_grant' });
        expect(generateTokenPair).not.toHaveBeenCalled();
      }),
      { numRuns: 150 },
    );
  });

  it('grants a token pair whenever SHA256(verifier) == bound challenge (Req 1.2)', async () => {
    await fc.assert(
      fc.asyncProperty(verifierArb, async (verifier) => {
        const challenge = await generateCodeChallenge(verifier);

        generateTokenPair.mockClear();
        db.authorizationCode.findUnique.mockResolvedValue({
          code: 'ac_match',
          clientId: 'client_prop',
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
      }),
      { numRuns: 100 },
    );
  });
});
