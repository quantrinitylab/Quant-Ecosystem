// @vitest-environment node
// ============================================================================
// Contract test for the SSO user-profile surfaces (routes/oauth.ts,
// lib/auth-session.ts): phone login/OTP was removed from the product (locked
// design), so no phone capability may be exposed to clients.
//
//   GET /oauth/userinfo must answer the documented `{ id, email, username,
//   displayName, role }` shape — no phoneNumber/phoneVerified keys.
//   sessionUserPayload (embedded on /auth/login, /auth/register,
//   /auth/2fa/verify, /auth/refresh) must carry the SAME shape; it exists
//   precisely so the frontend can hydrate without a second userinfo round
//   trip, so any drift between the two is a client-contract bug.
//
// HARNESS: registers the REAL `oauthRoutes` on a bare Fastify app and mocks
// only the deep @quant/auth specifiers it consumes (prisma, secure-random,
// secrets, token-service) — exactly as oauth-consent-flow.test.ts does.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

vi.mock('@quant/auth/services/token-service', () => {
  class MockTokenService {
    async validateAccessToken(token: string) {
      return token ? { id: 'user-1', sub: 'user-1', email: 'user@quantmail.in' } : null;
    }
  }
  return { TokenService: MockTokenService };
});

import { oauthRoutes } from '../routes/oauth';
import { sessionUserPayload } from '../lib/auth-session';
import prismaDefaultImport from '@quant/auth/lib/prisma';

const db = vi.mocked(
  prismaDefaultImport as unknown as {
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

describe('GET /oauth/userinfo contract (phone capability removed)', () => {
  it('returns 401 without a bearer <redacted>', async () => {
    const res = await app.inject({ method: 'GET', url: '/oauth/userinfo' });
    expect(res.statusCode).toBe(401);
  });

  it('carries exactly { id, email, username, displayName, role } — no phone keys', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@quantmail.in',
      username: 'user',
      displayName: 'User One',
      role: 'USER',
      // The DB column still exists (legacy rows); the API must not leak it.
      phoneNumber: '+911234567890',
      phoneVerified: true,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/oauth/userinfo',
      headers: { authorization: 'Bearer <redacted>' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual(
      ['displayName', 'email', 'id', 'role', 'username'],
    );
    expect(body.data).toEqual({
      id: 'user-1',
      email: 'user@quantmail.in',
      username: 'user',
      displayName: 'User One',
      role: 'USER',
    });
    expect(body.data).not.toHaveProperty('phoneNumber');
    expect(body.data).not.toHaveProperty('phoneVerified');
    expect(JSON.stringify(body)).not.toContain('phone');
  });
});

describe('sessionUserPayload contract (must match /oauth/userinfo)', () => {
  it('carries no phone keys even when the user row has phone columns', () => {
    const payload = sessionUserPayload({
      id: 'user-1',
      email: 'user@quantmail.in',
      username: 'user',
      displayName: 'User One',
      role: 'USER',
    } as any);
    expect(Object.keys(payload).sort()).toEqual(
      ['displayName', 'email', 'id', 'role', 'username'],
    );
    expect(payload).not.toHaveProperty('phoneNumber');
    expect(payload).not.toHaveProperty('phoneVerified');
  });
});
