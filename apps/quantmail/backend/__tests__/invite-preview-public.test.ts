/**
 * QM-SCREEN-018 regression: logged-out invitees must be able to load the group
 * join-link preview (GET /contact-groups/invite/:token) while the actual join
 * (POST /contact-groups/join) stays authenticated.
 *
 * Boots the REAL `createApp()` auth hook with the REAL quantmail
 * `getConfig().publicPaths`, so this test fails if the preview path is ever
 * dropped from the public list or if a method-scoping change accidentally
 * exposes the join endpoint.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@quant/server-core';
import { getConfig } from '../app';

describe('publicPaths: group invite preview for logged-out invitees (QM-SCREEN-018)', () => {
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

    // Stand-ins for the real routes (apps/quantmail/backend/routes/contact-groups.ts).
    app.get('/contact-groups/invite/:token', async () => ({
      success: true,
      data: { groupName: 'Family', memberCount: 2, ownerName: 'Ada L.' },
    }));
    app.post('/contact-groups/join', async () => ({ success: true, joined: true }));
    app.get('/public/invites/:token', async () => ({
      success: true,
      data: { kind: 'workspace', token: 'abc' },
    }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('guest GET /contact-groups/invite/:token is public (preview renders logged-out)', async () => {
    const res = await app.inject({ method: 'GET', url: '/contact-groups/invite/tok-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ groupName: 'Family', memberCount: 2, ownerName: 'Ada L.' });
  });

  it('guest POST /contact-groups/join still requires auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/contact-groups/join',
      payload: { token: 'tok-1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('guest POST /contact-groups/invite/:token stays auth-gated (GET-only scoping)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/contact-groups/invite/tok-1',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('guest GET /public/invites/:token remains public (pre-existing behavior intact)', async () => {
    const res = await app.inject({ method: 'GET', url: '/public/invites/abc' });
    expect(res.statusCode).toBe(200);
  });

  it('the invite public rule does not leak to adjacent /contact-groups routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/contact-groups/invite-other' });
    // '/contact-groups/invite-other' is NOT under '/contact-groups/invite/',
    // so the public rule must not match: the auth hook rejects it with 401.
    expect(res.statusCode).toBe(401);
  });
});
