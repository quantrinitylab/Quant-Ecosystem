// ============================================================================
// quantchat — /settings route tests
//
// The settings page previously called GET|PUT /api/settings but no route
// existed, so saves 404'd silently. These tests lock in the new contract:
//   - all /settings endpoints are fail-closed (401 without a valid JWT)
//   - PUT validates the body (400) before touching the database
// The authenticated happy path (real user row + Postgres) is covered in
// staging/integration where a database is available.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

// jose is a dependency of @quant/server-core, not of the app itself — resolve
// it from server-core's install so the test signs tokens the same lib verifies.
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const requireServerCore = createRequire(path.join(repoRoot, 'packages', 'server-core', 'package.json'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jose = requireServerCore('jose') as { SignJWT: new (payload: Record<string, unknown>) => { setProtectedHeader(header: { alg: string }): any; setIssuer(issuer: string): any; setAudience(audience: string): any; setExpirationTime(expiration: string): any; sign(key: Uint8Array): Promise<string> } };

const JWT_SECRET = 'test-secret-key-that-is-long-enough-for-hs256';

const testConfig: AppConfig = {
  ...getConfig(),
  port: 3002,
  host: '0.0.0.0',
  logLevel: 'silent',
  jwtSecret: JWT_SECRET,
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

let app: FastifyInstance;
let authHeader: string;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();

  const token = await new jose.SignJWT({ sub: 'test-user-id' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('quant-test')
    .setAudience('quant-test-audience')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
  authHeader = `Bearer ${token}`;
});

afterAll(async () => {
  await app.close();
});

describe('GET /settings', () => {
  it('rejects an unauthenticated request 401 (fail closed)', async () => {
    const res = await app.inject({ method: 'GET', url: '/settings' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('rejects a garbage Bearer <redacted> 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { authorization: 'Bearer <redacted>' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('PUT /settings', () => {
  it('rejects an unauthenticated request 401 (fail closed)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { privacy: { showOnlineStatus: false } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid body 400 with a valid JWT (validation before DB)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      headers: { authorization: authHeader },
      payload: { privacy: { whoCanMessage: 'everyone-and-their-dog' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } });
  });

  it('rejects unknown top-level keys 400 (strict schema)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      headers: { authorization: authHeader },
      payload: { evil: 'injection' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /settings/blocked/:userId', () => {
  it('rejects an unauthenticated request 401 (fail closed)', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/settings/blocked/some-user' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /settings/export', () => {
  it('rejects an unauthenticated request 401 (fail closed)', async () => {
    const res = await app.inject({ method: 'POST', url: '/settings/export' });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /settings/account', () => {
  it('rejects an unauthenticated request 401 (fail closed)', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/settings/account' });
    expect(res.statusCode).toBe(401);
  });
});

describe('PUT /auth/profile', () => {
  it('rejects an unauthenticated request 401 (fail closed)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      payload: { displayName: 'New Name' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid body 400 with a valid JWT (validation before DB)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      headers: { authorization: authHeader },
      payload: { displayName: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an empty update 400 with a valid JWT', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/profile',
      headers: { authorization: authHeader },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
