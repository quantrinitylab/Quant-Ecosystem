// @vitest-environment node
// ===========================================================================
// QuantGit cookie-auth seam tests (fix/qm-quantgit-repos-401-cookie-3).
// ===========================================================================
//
// The 2026-10-19 P1: /api/repos returns 401 on a cookie-authenticated
// session, so signed-in /quantgit renders "0 ACTIVE / No repositories yet".
//
// These tests traverse the REAL production wiring (buildApp + the global
// auth hook from @quant/server-core + routes/repos), exactly like the
// engine-surfaces seam suite, and pin down which credential shapes the
// hook accepts:
//
//   - no credential            -> 401 UNAUTHORIZED (baseline)
//   - quantmail_refresh cookie -> 401 (the browser's ONLY durable credential
//     after login; a refresh credential must NEVER double as an access
//     credential, so this 401 is correct and must stay)
//   - quant_access_token cookie (valid JWT) -> auth passes (handler reached)
//   - Bearer valid JWT         -> auth passes (control)
//
// The access-cookie case passing while no login flow writes that cookie is
// the gap: the hook advertises a cookie path no session issuance provides.
// The fix completes issuance (login/register/2FA/refresh set the cookie);
// these tests pin the hook side of the contract.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '@quant/server-core';
import { buildApp } from '../app';

process.env.SYNC_CURSOR_SECRET ??= 'test-secret-32-bytes-long-for-tests!';

const testConfig: AppConfig = {
  port: 3010,
  host: '0.0.0.0',
  logLevel: 'silent',
  corsOrigins: ['http://localhost:3000'],
  rateLimitMax: 1000,
  rateLimitWindow: '1 minute',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
  // Mirror production getConfig() for the one public path this suite
  // exercises: /auth/refresh bypasses the global hook (its handler enforces
  // the trusted-origin + refresh-cookie checks itself).
  publicPaths: ['/auth/refresh'],
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

let jtiCounter = 0;
function signToken(sub = 'user-123'): string {
  jtiCounter += 1;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: testConfig.jwtIssuer,
      aud: testConfig.jwtAudience,
      sub,
      jti: `qg-cookie-${jtiCounter}`,
      iat: now,
      exp: now + 3600,
      email: 'mail@example.com',
      username: 'mailuser',
      role: 'user',
      scopes: [],
      app: 'quantmail',
    }),
  );
  const signature = base64url(
    createHmac('sha256', testConfig.jwtSecret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('QuantGit /api/repos cookie-auth seam', () => {
  it('no credential -> 401 UNAUTHORIZED "Missing or invalid authorization header"', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/repos' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
    });
  });

  it('refresh-cookie-only -> still 401 (a refresh credential is not an access credential)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/repos',
      headers: { cookie: 'quantmail_refresh=some-refresh-token-value' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('quant_access_token cookie with a valid JWT -> auth passes (handler reached, not 401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/repos',
      headers: { cookie: `quant_access_token=${signToken()}` },
    });
    expect(res.statusCode).not.toBe(401);
    expect(res.json().error?.code).not.toBe('UNAUTHORIZED');
  });

  it('Bearer valid JWT -> auth passes (control)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/repos',
      headers: { authorization: `Bearer ${signToken()}` },
    });
    expect(res.statusCode).not.toBe(401);
    expect(res.json().error?.code).not.toBe('UNAUTHORIZED');
  });

  it('bodyless POST /auth/refresh with JSON content-type reaches the handler (backend tolerates the proxy shape)', async () => {
    // The Next proxy re-adds Content-Type: application/json to bodyless
    // refresh/logout calls. QuantMail's buildApp replaces Fastify's JSON
    // parser with one that maps an empty body to {} (see app.ts), so this
    // request must reach the handler and answer REFRESH_REQUIRED — not
    // die in the parser, and not 401 at the global hook (public path).
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'REFRESH_REQUIRED' },
    });
  });
});
