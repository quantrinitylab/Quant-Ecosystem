// ============================================================================
// quantchat — POST /auth/refresh route test
//
// The web apiClient has always redeemed refresh tokens at /auth/refresh,
// but the route never existed (every refresh 404'd and sessions died at
// access-token expiry). These tests prove the route is registered, PUBLIC
// (self-authenticating via the refresh token, so it must not be stopped by
// the global auth hook), and fails closed: bad input 400, garbage/access/
// expired tokens 401 INVALID_REFRESH_TOKEN — an ACCESS token must never be
// redeemable as a refresh token. The user-exists happy path runs in
// staging/integration where Postgres is available (same convention as the
// sso-exchange route tests); here a VALID refresh token is asserted to get
// PAST token verification (no 401 — it only stops at the DB lookup, which
// has no database in this environment and honestly returns 503).
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import { SessionTokenIssuer } from '../lib/session-tokens';
import type { AppConfig } from '@quant/server-core';

const testConfig: AppConfig = {
  ...getConfig(),
  port: 3002,
  host: '0.0.0.0',
  logLevel: 'silent',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

const issuer = new SessionTokenIssuer({
  jwtSecret: testConfig.jwtSecret,
  jwtIssuer: testConfig.jwtIssuer,
  jwtAudience: testConfig.jwtAudience,
});

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('POST /auth/refresh', () => {
  it('is public: empty body validates 400 instead of being stopped by the auth hook', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/refresh', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } });
  });

  it('rejects a non-string refreshToken with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 12345 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a garbage refresh token with 401 INVALID_REFRESH_TOKEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'aaaa.bbbb.ccccdddd' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_REFRESH_TOKEN' },
    });
  });

  it('rejects an ACCESS token presented as a refresh token (kind check)', async () => {
    const tokens = await issuer.issue({ userId: 'user-1', username: 'alice' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.accessToken },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_REFRESH_TOKEN' },
    });
  });

  it('rejects an EXPIRED refresh token with 401', async () => {
    const expiredIssuer = new SessionTokenIssuer({
      jwtSecret: testConfig.jwtSecret,
      jwtIssuer: testConfig.jwtIssuer,
      jwtAudience: testConfig.jwtAudience,
      refreshTtlSec: -10,
    });
    const tokens = await expiredIssuer.issue({ userId: 'user-1', username: 'alice' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_REFRESH_TOKEN' },
    });
  });

  it('a VALID refresh token passes verification (stops only at the DB lookup: 503, never 401)', async () => {
    const tokens = await issuer.issue({ userId: 'user-1', username: 'alice' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    });
    // No Postgres in this environment: the honest outcome is 503
    // UPSTREAM_UNAVAILABLE from the user lookup — crucially NOT a 401,
    // which would mean the valid token was rejected.
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'UPSTREAM_UNAVAILABLE' },
    });
  });
});
