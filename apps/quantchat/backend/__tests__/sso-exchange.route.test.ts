// ============================================================================
// quantchat — POST /auth/sso/exchange route test
//
// The SSO handoff from QuantMail redirects back with a QuantMail-issued JWT
// (?token=...). That JWT is NOT valid for QuantChat's backend (different
// secret/issuer/audience), so storing it directly caused /auth/me 401s,
// fail-closed session clears, and a bounce back to /login on every SSO attempt.
//
// POST /auth/sso/exchange is the fix: it verifies the SSO token back-channel
// against QuantMail's /oauth/userinfo, upserts the user, and returns
// QuantChat-native tokens.
//
// These tests prove the route is registered, PUBLIC (no QuantChat auth needed),
// and fails closed on bad input / rejected tokens. Happy-path DB tests run in
// staging/integration where Postgres is available.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
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

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /auth/sso/exchange', () => {
  it('is public: does not 401 for missing Authorization (validates 400 on body instead)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: {},
    });
    // Public route: must NOT be rejected by the global auth hook (401).
    // Empty body -> 400 BAD_REQUEST from zod validation.
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } });
  });

  it('rejects a non-string ssoToken with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoToken: 12345 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a too-short ssoToken with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoToken: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 INVALID_SSO_TOKEN when QuantMail rejects the token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'invalid_token' }),
      }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoToken: 'eyJhbGciOiJIUzI1NiJ9.forged.token' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'INVALID_SSO_TOKEN' } });
  });

  it('returns 401 when QuantMail userinfo has no email', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { id: 'abc123' } }),
      }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoToken: 'eyJhbGciOiJIUzI1NiJ9.incomplete.token' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'INVALID_SSO_TOKEN' } });
  });

  it('returns 502 when QuantMail is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoToken: 'eyJhbGciOiJIUzI1NiJ9.unreachable.token' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'SSO_VERIFY_UNAVAILABLE' } });
  });
});
