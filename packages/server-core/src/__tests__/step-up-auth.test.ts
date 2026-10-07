import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as jose from 'jose';
import { createApp } from '../app';
import type { AppConfig } from '../types';

const testConfig: AppConfig = {
  port: 3001,
  host: '0.0.0.0',
  logLevel: 'silent',
  corsOrigins: ['http://localhost:3000'],
  rateLimitMax: 100,
  rateLimitWindow: '1 minute',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
  publicPaths: ['/test-stepup-public'],
};

const signToken = async (claims: Record<string, unknown> = {}) => {
  const secret = new TextEncoder().encode(testConfig.jwtSecret);
  return new jose.SignJWT({
    email: 'stepup@example.com',
    username: 'stepupuser',
    role: 'user',
    scopes: [],
    app: 'quantmail',
    ...claims,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer(testConfig.jwtIssuer)
    .setAudience(testConfig.jwtAudience)
    .setJti(`stepup-${Math.random().toString(36).slice(2)}`)
    .setSubject('user-stepup')
    .sign(secret);
};

describe('requireStepUp guard (K6)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp(testConfig);

    app.get('/test-stepup', { preHandler: app.requireStepUp() }, async (request) => {
      return {
        ok: true,
        userId: request.auth.userId,
        lastStrongAuthAt: request.auth.lastStrongAuthAt ?? null,
      };
    });

    app.get(
      '/test-stepup-wide-window',
      { preHandler: app.requireStepUp({ windowSeconds: 7200 }) },
      async () => ({ ok: true }),
    );

    app.get('/test-stepup-public', { preHandler: app.optionalAuth() }, async (request) => {
      return { lastStrongAuthAt: request.auth?.lastStrongAuthAt ?? null };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const now = () => Math.floor(Date.now() / 1000);

  it('allows a request whose last strong auth is inside the window', async () => {
    const token = await signToken({ lastStrongAuthAt: now() - 60 });
    const response = await app.inject({
      method: 'GET',
      url: '/test-stepup',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.userId).toBe('user-stepup');
    expect(typeof body.lastStrongAuthAt).toBe('number');
  });

  it('rejects with 401 STEP_UP_REQUIRED when the last strong auth is stale', async () => {
    const token = await signToken({ lastStrongAuthAt: now() - 3600 });
    const response = await app.inject({
      method: 'GET',
      url: '/test-stepup',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('STEP_UP_REQUIRED');
    expect(body.error.statusCode).toBe(401);
    // The 401 must tell the client exactly how to step up.
    expect(body.stepUp.required).toBe(true);
    expect(body.stepUp.reason).toBe('STALE_AUTHENTICATION');
    expect(body.stepUp.policyWindowSeconds).toBe(900);
    expect(body.stepUp.lastStrongAuthAt).toBeLessThan(now() - 3000);
    expect(body.stepUp.methods).toContain('password');
    expect(body.stepUp.howTo).toEqual(
      expect.arrayContaining([expect.stringContaining('/auth/login')]),
    );
    expect(body.stepUp.howTo).toEqual(
      expect.arrayContaining([expect.stringContaining('/auth/2fa/verify')]),
    );
  });

  it('fails closed: a token without the claim is treated as stale', async () => {
    const token = await signToken();
    const response = await app.inject({
      method: 'GET',
      url: '/test-stepup',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('STEP_UP_REQUIRED');
  });

  it('still returns 401 UNAUTHORIZED (not STEP_UP_REQUIRED) with no token', async () => {
    const response = await app.inject({ method: 'GET', url: '/test-stepup' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('still returns 401 UNAUTHORIZED for an invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test-stepup',
      headers: { authorization: 'Bearer this-is-not-a-token' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('honours a per-route window override', async () => {
    // 60 minutes old: stale under the 15-minute default, fresh under 2 hours.
    const token = await signToken({ lastStrongAuthAt: now() - 3600 });

    const wide = await app.inject({
      method: 'GET',
      url: '/test-stepup-wide-window',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(wide.statusCode).toBe(200);

    const narrow = await app.inject({
      method: 'GET',
      url: '/test-stepup',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(narrow.statusCode).toBe(401);
  });

  it('honours the STEP_UP_AUTH_WINDOW_SECONDS env override', async () => {
    const previous = process.env['STEP_UP_AUTH_WINDOW_SECONDS'];
    process.env['STEP_UP_AUTH_WINDOW_SECONDS'] = '120';
    try {
      const token = await signToken({ lastStrongAuthAt: now() - 300 });
      const response = await app.inject({
        method: 'GET',
        url: '/test-stepup',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().stepUp.policyWindowSeconds).toBe(120);
    } finally {
      if (previous === undefined) delete process.env['STEP_UP_AUTH_WINDOW_SECONDS'];
      else process.env['STEP_UP_AUTH_WINDOW_SECONDS'] = previous;
    }
  });

  it('surfaces lastStrongAuthAt on request.auth for optional auth too', async () => {
    const token = await signToken({ lastStrongAuthAt: now() - 10 });
    const response = await app.inject({
      method: 'GET',
      url: '/test-stepup-public',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(typeof response.json().lastStrongAuthAt).toBe('number');
  });
});
