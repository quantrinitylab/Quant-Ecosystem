/**
 * P0 [auth-sso] regression: unauthenticated callers must be able to POST
 * /auth/verify-email and /auth/resend-verification — the emailed 6-digit
 * code IS the credential, not a bearer token (a freshly-registered user
 * holds no tokens yet). Without the public-path entries these calls 401
 * inside the backend global auth hook even though the Next proxy allow-list
 * (backend/lib/routes-config.ts) already forwards them.
 *
 * Boots the REAL `createApp()` auth hook with the REAL quantmail
 * `getConfig().publicPaths`, so this test fails if either path is dropped
 * from the public list or if the POST-scoping is ever widened.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@quant/server-core';
import { getConfig } from '../app';

describe('publicPaths: email-verification code flow for logged-out users (P0 auth-sso)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    const config = getConfig();
    app = await createApp({
      ...config,
      port: 0,
      logLevel: 'silent',
      jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
      jwtIssuer: 'quant-test',
      jwtAudience: 'quant-test-audience',
      env: 'test',
    });

    // Stand-ins for the real handlers (apps/quantmail/backend/routes/auth.ts).
    // The defect under test is the hook's 401 decision, not the handler, so
    // stubs that echo success are enough to prove the request got through.
    app.post('/auth/verify-email', async () => ({
      success: true,
      data: { emailVerified: true },
    }));
    app.post('/auth/resend-verification', async () => ({
      success: true,
      data: { emailSent: true },
    }));
    // Sibling public path, for the no-collateral-change guard below.
    app.post('/auth/register', async () => ({ success: true }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('guest POST /auth/verify-email is public (code redemption reaches the handler)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { email: 'new@quantmail.in', code: '482916' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ emailVerified: true });
  });

  it('guest POST /auth/resend-verification is public (resend reaches the handler)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/resend-verification',
      payload: { email: 'new@quantmail.in' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ emailSent: true });
  });

  it('guest GET /auth/verify-email stays auth-gated (POST-only scoping)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/verify-email?token=whatever',
    });
    expect(res.statusCode).toBe(401);
  });

  it('guest GET /auth/resend-verification stays auth-gated (POST-only scoping)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/resend-verification',
    });
    expect(res.statusCode).toBe(401);
  });

  it('guest POST /auth/verify-email/extra is NOT public (exact-path scoping)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify-email/extra',
      payload: { email: 'new@quantmail.in', code: '482916' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('a sibling auth path that is public stays public (no collateral change)', async () => {
    // Covered by the same publicPaths list; guards against list rewrites
    // that would fix verification but break login/registration.
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'new@quantmail.in', password: 'x'.repeat(20) },
    });
    expect(res.statusCode).toBe(200);
  });
});
