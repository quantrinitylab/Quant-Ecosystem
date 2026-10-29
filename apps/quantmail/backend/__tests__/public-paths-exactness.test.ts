/**
 * [auth-sso] regression: `matchesPublicPath()` in @quant/server-core treats
 * a plain STRING publicPaths entry as a PREFIX match (the path itself plus
 * any sub-path), while only the object form with `exact: true` is truly
 * exact. The old comment in `app.ts` claimed the opposite ("entries are
 * exact by default"), so a future string entry could silently expose
 * sub-routes (e.g. '/auth/login' also exposed '/auth/login/anything').
 *
 * This test boots the REAL `createApp()` auth hook with the REAL quantmail
 * `getConfig().publicPaths` and proves, for every single-endpoint entry
 * that was converted to the exact object form:
 *   (a) the exact path itself stays public, and
 *   (b) any sub-path under it is auth-gated again (401).
 * It also guards the entries that are intentionally prefix-shaped, so a
 * future "tightening" does not silently break them:
 *   - POST /auth/password-reset/confirm stays public (forgot-password flow),
 *   - GET /health/detailed stays public (detailed health is public by design).
 *
 * Stand-in handlers echo success; the defect under test is the hook's
 * 401 decision, not the handler, so stubs are enough — same pattern as
 * email-verification-public-paths.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@quant/server-core';
import { getConfig } from '../app';

const EXACT_PUBLIC_POSTS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/2fa/verify',
  '/oauth/token',
  '/oauth/revoke',
  '/oauth/register',
  '/sso/ticket/resolve',
  '/sso/ticket/exchange',
] as const;

describe('publicPaths: single endpoints are exact, intended prefixes stay prefix (auth-sso)', () => {
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

    for (const path of EXACT_PUBLIC_POSTS) {
      app.post(path, async () => ({ success: true }));
    }
    // Intentionally-prefix entries: the exact path AND a sub-path both stay public.
    app.post('/auth/password-reset', async () => ({ success: true }));
    app.post('/auth/password-reset/confirm', async () => ({ success: true }));
    app.get('/health/detailed', async () => ({ status: 'healthy' }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(EXACT_PUBLIC_POSTS)('guest POST %s reaches the handler (exact path stays public)', async (path) => {
    const res = await app.inject({ method: 'POST', url: path, payload: {} });
    expect(res.statusCode).toBe(200);
  });

  it.each(EXACT_PUBLIC_POSTS)(
    'guest POST %s/anything is auth-gated (no sub-path slips through)',
    async (path) => {
      const res = await app.inject({ method: 'POST', url: `${path}/anything`, payload: {} });
      expect(res.statusCode).toBe(401);
    },
  );

  it('guest POST /auth/password-reset/confirm stays public (intended prefix, forgot-password flow)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/confirm',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('guest GET /health/detailed stays public (intended prefix, detailed health by design)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/detailed' });
    expect(res.statusCode).toBe(200);
  });

  it('getConfig().publicPaths carries no plain-string entry for a converted single endpoint', () => {
    const entries = getConfig().publicPaths ?? [];
    for (const path of EXACT_PUBLIC_POSTS) {
      const stringEntry = entries.find((entry) => entry === path);
      expect(stringEntry).toBeUndefined();
      const exactEntry = entries.find(
        (entry) => typeof entry === 'object' && entry.path === path && entry.exact === true,
      );
      expect(exactEntry).toBeDefined();
    }
  });
});
