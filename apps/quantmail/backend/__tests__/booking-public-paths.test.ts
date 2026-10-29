/**
 * fix/qm-calendar-booking-routes regression: the invitee-facing booking-link
 * handlers are dual-registered in calendar.ts at BOTH /booking/links/:slug*
 * and /calendar/booking/:slug*, but only the /calendar/booking prefix was in
 * `publicPaths` — so a logged-out guest hitting the /booking/links duplicates
 * got 401 from the auth hook and the duplicates were dead registrations.
 *
 * Boots the REAL `createApp()` auth hook with the REAL quantmail
 * `getConfig().publicPaths`, so this test fails if any invitee shape is ever
 * dropped from the public list, or if a method-scoping change accidentally
 * exposes a host-only route (collection list/create, host delete).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@quant/server-core';
import { getConfig } from '../app';

describe('publicPaths: dual-registered public booking-link routes for logged-out guests (fix/qm-calendar-booking-routes)', () => {
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

    // Stand-ins for the real invitee handlers (apps/quantmail/backend/routes/calendar.ts).
    app.get('/booking/links/:slug', async () => ({ success: true, data: { slug: 'my-slug' } }));
    app.get('/booking/links/:slug/slots', async () => ({ success: true, data: [] }));
    app.post('/booking/links/:slug/lock', async () => ({ success: true, lockId: 'lock-1' }));
    app.post('/booking/links/:slug/book', async () => ({ success: true, data: {} }));
    app.get('/calendar/booking/:slug', async () => ({ success: true, data: { slug: 'my-slug' } }));
    app.post('/calendar/booking/:slug/lock', async () => ({ success: true, lockId: 'lock-1' }));
    app.get('/api/booking/links/:slug', async () => ({ success: true, data: { slug: 'my-slug' } }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('guest GET /booking/links/:slug is public (was 401 before the fix)', async () => {
    const res = await app.inject({ method: 'GET', url: '/booking/links/my-slug' });
    expect(res.statusCode).toBe(200);
  });

  it('guest GET /booking/links/:slug/slots is public', async () => {
    const res = await app.inject({ method: 'GET', url: '/booking/links/my-slug/slots?date=2026-10-27' });
    expect(res.statusCode).toBe(200);
  });

  it('guest POST /booking/links/:slug/lock is public', async () => {
    const res = await app.inject({ method: 'POST', url: '/booking/links/my-slug/lock', payload: {} });
    expect(res.statusCode).toBe(200);
  });

  it('guest POST /booking/links/:slug/book is public', async () => {
    const res = await app.inject({ method: 'POST', url: '/booking/links/my-slug/book', payload: {} });
    expect(res.statusCode).toBe(200);
  });

  it('guest GET /calendar/booking/:slug remains public (pre-existing behavior intact)', async () => {
    const res = await app.inject({ method: 'GET', url: '/calendar/booking/my-slug' });
    expect(res.statusCode).toBe(200);
  });

  it('guest POST /calendar/booking/:slug/lock is public (covered by the /calendar/booking prefix)', async () => {
    const res = await app.inject({ method: 'POST', url: '/calendar/booking/my-slug/lock', payload: {} });
    expect(res.statusCode).toBe(200);
  });

  it('guest GET /api/booking/links/:slug is public (mirrors the /api/calendar/booking convention)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/booking/links/my-slug' });
    expect(res.statusCode).toBe(200);
  });

  it('guest GET /booking/links (host collection list) stays auth-gated', async () => {
    const res = await app.inject({ method: 'GET', url: '/booking/links' });
    expect(res.statusCode).toBe(401);
  });

  it('guest POST /booking/links (host create) stays auth-gated', async () => {
    const res = await app.inject({ method: 'POST', url: '/booking/links', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('guest DELETE /booking/links/:id (host delete) stays auth-gated', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/booking/links/some-id' });
    expect(res.statusCode).toBe(401);
  });

  it('guest POST /booking/links/:slug (no POST on the bare slug shape) stays auth-gated', async () => {
    const res = await app.inject({ method: 'POST', url: '/booking/links/my-slug', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('guest GET /booking/links/:slug/unknown stays auth-gated (no such invitee shape)', async () => {
    const res = await app.inject({ method: 'GET', url: '/booking/links/my-slug/unknown' });
    expect(res.statusCode).toBe(401);
  });
});
