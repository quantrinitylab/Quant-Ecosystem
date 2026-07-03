// ============================================================================
// quantchat — /auth/me fail-closed test (PR-A: OTP sign-in identity)
// ============================================================================
//
// GET /auth/me is the OIDC-style userinfo route the shared useAuth hook resolves
// via `/api/auth/userinfo`. It is NOT in publicPaths, so the global auth hook
// from createApp() must reject an unauthenticated request BEFORE the handler
// (and any DB read) runs. This proves the fail-closed contract without a live
// database. The authenticated happy path (a real user row) is covered in
// staging/integration where Postgres is available.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

describe('GET /auth/me', () => {
  it('rejects an unauthenticated request 401 (no publicPaths bypass, fail closed)', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('rejects a garbage bearer token 401 (signature verified server-side)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer not-a-real-jwt' },
    });
    expect(res.statusCode).toBe(401);
  });
});
