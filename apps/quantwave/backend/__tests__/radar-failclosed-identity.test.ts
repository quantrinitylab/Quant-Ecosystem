// ============================================================================
// Route Tests: Radar identity is fail-closed (P0 security)
// ============================================================================
//
// apps/quantwave/backend/routes/radar.ts used to accept a client-supplied
// `x-user-id` header as identity when `request.auth` was absent — any caller
// could impersonate any user on GET /radar/nearby and POST /radar/swipe.
// These tests prove the fail-closed behaviour: identity comes ONLY from the
// verified auth context, and a missing session answers 401 UNAUTHORIZED.

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import radarRoutes from '../routes/radar';

// Simulates the verified identity installed by the global auth hook in
// @quant/server-core (verified JWT -> request.auth.userId). Leaving it
// undefined simulates a request with no valid session.
let verifiedUserId: string | undefined;

function buildTestApp(): FastifyInstance {
  const app = Fastify();
  // Declare the request decoration with the default value (undefined).
  // NOTE: do NOT pass `undefined` as the value — fastify's typed
  // decorateRequest overload requires a GetterSetter value for the augmented
  // `auth` key, so `decorateRequest('auth', undefined as unknown)` fails
  // typecheck (TS2345). The single-arg form is identical at runtime: fastify
  // initialises request.auth to undefined either way.
  app.decorateRequest('auth');
  app.addHook('onRequest', (request, _reply, done) => {
    if (verifiedUserId !== undefined) {
      (request as { auth?: { userId?: string } }).auth = { userId: verifiedUserId };
    }
    done();
  });
  app.register(radarRoutes, { prefix: '/radar' });
  return app;
}

describe('radar routes fail closed without a verified session', () => {
  beforeEach(() => {
    verifiedUserId = undefined;
  });

  it('GET /radar/nearby answers 401 UNAUTHORIZED with no session', async () => {
    const app = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/radar/nearby?lat=28.6139&lon=77.209&radiusKm=25',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message ?? '').toMatch(/Authentication required/);
  });

  it('a bare x-user-id header no longer grants identity (no impersonation)', async () => {
    const app = buildTestApp();
    const nearby = await app.inject({
      method: 'GET',
      url: '/radar/nearby?lat=28.6139&lon=77.209&radiusKm=25',
      headers: { 'x-user-id': 'attacker_chosen_user_id' },
    });
    expect(nearby.statusCode).toBe(401);

    const swipe = await app.inject({
      method: 'POST',
      url: '/radar/swipe',
      headers: { 'x-user-id': 'attacker_chosen_user_id' },
      payload: { targetUserId: 'victim_id', action: 'like' },
    });
    expect(swipe.statusCode).toBe(401);
  });

  it('a request.auth identity still works (verified session, no header)', async () => {
    verifiedUserId = 'user_real';
    const app = buildTestApp();

    const nearby = await app.inject({
      method: 'GET',
      url: '/radar/nearby?lat=28.6139&lon=77.209&radiusKm=25',
    });
    expect(nearby.statusCode).toBe(200);
    expect(nearby.json().success).toBe(true);

    const swipe = await app.inject({
      method: 'POST',
      url: '/radar/swipe',
      payload: { targetUserId: 'user_other', action: 'like' },
    });
    expect(swipe.statusCode).toBe(200);
    expect(swipe.json().data.matched).toBe(false);
  });
});
