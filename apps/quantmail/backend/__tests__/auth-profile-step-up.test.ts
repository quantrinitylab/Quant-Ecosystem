// @vitest-environment node
/**
 * Step-up coverage for PATCH /auth/profile — the settings-update surface named
 * by the spec (settings-api.md: "settings.update may require recent
 * authentication"). Stale sessions get 401 STEP_UP_REQUIRED; fresh ones pass.
 */

import Fastify from 'fastify';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as jose from 'jose';

vi.mock('@quant/auth/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(async () => null),
      update: vi.fn(async ({ where, data }: any) => ({
        id: where.id,
        email: 'user1@example.com',
        username: 'user1',
        displayName: data.displayName,
        role: 'user',
      })),
    },
    emailFolder: { createMany: vi.fn(async () => ({})) },
    refreshToken: { findFirst: vi.fn(async () => null), updateMany: vi.fn(async () => ({})) },
    twoFactorBackupCode: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
  },
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret-that-is-long-enough',
  getJwtRefreshSecret: () => 'test-refresh-secret-that-is-long-enough',
}));

import { authPlugin } from '@quant/server-core';
import { authRoutes } from '../routes/auth';

const JWT_SECRET = 'test-secret-key-that-is-long-enough-for-hs256';

describe('PATCH /auth/profile step-up (K6)', () => {
  const signToken = async (lastStrongAuthAt?: number) => {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const claims: Record<string, unknown> = {
      email: 'user1@example.com',
      username: 'user1',
      role: 'user',
      scopes: [],
      app: 'quantmail',
    };
    if (lastStrongAuthAt !== undefined) claims['lastStrongAuthAt'] = lastStrongAuthAt;
    return new jose.SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .setIssuer('quantmail')
      .setAudience('quant-ecosystem')
      .setJti(`profile-test-${Math.random().toString(36).slice(2)}`)
      .setSubject('user-1')
      .sign(secret);
  };

  const build = async () => {
    const app = Fastify();
    await app.register(authPlugin, {
      jwtSecret: JWT_SECRET,
      jwtIssuer: 'quantmail',
      jwtAudience: 'quant-ecosystem',
    });
    // Mirror production: global hook authenticates and populates request.auth.
    app.addHook('onRequest', async (request, reply) => {
      await app.requireAuth()(request, reply);
    });
    await app.register(authRoutes);
    await app.ready();
    return app;
  };

  beforeEach(() => vi.restoreAllMocks());

  it('updates the display name when the last strong auth is fresh', async () => {
    const app = await build();
    const token = await signToken(Math.floor(Date.now() / 1000) - 60);
    const response = await app.inject({
      method: 'PATCH',
      url: '/auth/profile',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'New Name' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.displayName).toBe('New Name');
    await app.close();
  });

  it('rejects with 401 STEP_UP_REQUIRED when the last strong auth is stale', async () => {
    const app = await build();
    const token = await signToken(Math.floor(Date.now() / 1000) - 3600);
    const response = await app.inject({
      method: 'PATCH',
      url: '/auth/profile',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'New Name' },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('STEP_UP_REQUIRED');
    expect(body.stepUp.required).toBe(true);
    expect(body.stepUp.howTo).toEqual(
      expect.arrayContaining([expect.stringContaining('/auth/login')]),
    );
    await app.close();
  });

  it('rejects with 401 STEP_UP_REQUIRED when the claim is missing (fail closed)', async () => {
    const app = await build();
    const token = await signToken(undefined);
    const response = await app.inject({
      method: 'PATCH',
      url: '/auth/profile',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'New Name' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('STEP_UP_REQUIRED');
    await app.close();
  });

  it('still returns 401 UNAUTHORIZED with no token at all', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'PATCH',
      url: '/auth/profile',
      payload: { displayName: 'New Name' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
    await app.close();
  });
});
