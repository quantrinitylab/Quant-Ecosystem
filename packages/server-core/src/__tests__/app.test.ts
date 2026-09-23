import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as jose from 'jose';
import { createApp } from '../app';
import type { AppConfig } from '../types';

const testConfig: AppConfig = {
  port: 3000,
  host: '0.0.0.0',
  logLevel: 'silent',
  corsOrigins: ['http://localhost:3000'],
  rateLimitMax: 100,
  rateLimitWindow: '1 minute',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

describe('server-core app', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp(testConfig);

    // Register a protected test route before starting
    app.get('/test-protected', { preHandler: app.requireAuth() }, async (request) => {
      return { userId: request.auth.userId };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health endpoints', () => {
    it('GET /healthz returns 200 with structured response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('ok');
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('version');
    });

    it('GET /readyz returns checks structure', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/readyz',
      });

      const body = response.json();
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('checks');
      expect(body.checks).toHaveProperty('database');
      expect(body.checks).toHaveProperty('redis');
    });
  });

  describe('error handling', () => {
    it('unknown routes return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent-route',
      });

      expect(response.statusCode).toBe(401);
    });

    it('unknown routes return 404 with valid auth token', async () => {
      const secret = new TextEncoder().encode(testConfig.jwtSecret);
      const token = await new jose.SignJWT({
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        scopes: ['profile:read'],
        app: 'quantmail',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .setIssuer(testConfig.jwtIssuer)
        .setAudience(testConfig.jwtAudience)
        .setJti('test-token-404')
        .setSubject('user-123')
        .sign(secret);

      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent-route',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('auth plugin', () => {
    it('rejects requests without Bearer token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test-protected',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects requests with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test-protected',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('accepts valid JWT and populates request.auth', async () => {
      const secret = new TextEncoder().encode(testConfig.jwtSecret);
      const token = await new jose.SignJWT({
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        scopes: ['profile:read'],
        app: 'quantmail',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .setIssuer(testConfig.jwtIssuer)
        .setAudience(testConfig.jwtAudience)
        .setJti('test-token-id')
        .setSubject('user-123')
        .sign(secret);

      const response = await app.inject({
        method: 'GET',
        url: '/test-protected',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.userId).toBe('user-123');
    });

    it('rejects token with wrong issuer', async () => {
      const secret = new TextEncoder().encode(testConfig.jwtSecret);
      const token = await new jose.SignJWT({
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        scopes: ['profile:read'],
        app: 'quantmail',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .setIssuer('wrong-issuer')
        .setAudience(testConfig.jwtAudience)
        .setJti('test-token-id-2')
        .setSubject('user-123')
        .sign(secret);

      const response = await app.inject({
        method: 'GET',
        url: '/test-protected',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('public paths exact matching and method gating (W32-6)', () => {
    let publicApp: Awaited<ReturnType<typeof createApp>>;

    beforeAll(async () => {
      publicApp = await createApp({
        ...testConfig,
        publicPaths: [
          { path: '/videos', methods: ['GET'], exact: true },
          { path: '/auth/login', exact: true },
          '/public/invites',
          '/api/code/gitd/*',
          '/posts/:id',
          { path: '/channels/:id', methods: ['GET'], exact: true },
        ],
      });

      publicApp.get('/videos', async () => ({ success: true, data: [] }));
      publicApp.post('/videos', async () => ({ success: true, created: true }));
      publicApp.get('/videos/private-draft', async () => ({ success: true, draft: true }));
      publicApp.post('/auth/login', async () => ({ success: true, token: 'test' }));
      publicApp.get('/auth/login/secrets', async () => ({ success: true, secrets: true }));
      publicApp.get('/public/invites/test-invite-token', async () => ({
        success: true,
        invite: true,
      }));
      publicApp.get('/api/code/gitd/owner/repo/info/refs', async () => ({
        success: true,
        gitd: true,
      }));
      publicApp.get('/posts/:id', async (req) => ({
        success: true,
        postId: (req.params as any).id,
      }));
      publicApp.get('/channels/:id', async (req) => ({
        success: true,
        channelId: (req.params as any).id,
      }));

      await publicApp.ready();
    });

    afterAll(async () => {
      await publicApp.close();
    });

    it('allows guest to access GET /videos', async () => {
      const res = await publicApp.inject({ method: 'GET', url: '/videos' });
      expect(res.statusCode).toBe(200);
    });

    it('rejects guest attempting mutating POST /videos with 401', async () => {
      const res = await publicApp.inject({ method: 'POST', url: '/videos' });
      expect(res.statusCode).toBe(401);
    });

    it('rejects guest attempting nested /videos/private-draft with 401', async () => {
      const res = await publicApp.inject({ method: 'GET', url: '/videos/private-draft' });
      expect(res.statusCode).toBe(401);
    });

    it('allows POST /auth/login exact path', async () => {
      const res = await publicApp.inject({ method: 'POST', url: '/auth/login' });
      expect(res.statusCode).toBe(200);
    });

    it('rejects adjacent /auth/login/secrets with 401 on exact rule', async () => {
      const res = await publicApp.inject({ method: 'GET', url: '/auth/login/secrets' });
      expect(res.statusCode).toBe(401);
    });

    it('allows subpath under plain string prefix /public/invites', async () => {
      const res = await publicApp.inject({
        method: 'GET',
        url: '/public/invites/test-invite-token',
      });
      expect(res.statusCode).toBe(200);
    });

    it('allows subpath under explicit wildcard /api/code/gitd/*', async () => {
      const res = await publicApp.inject({
        method: 'GET',
        url: '/api/code/gitd/owner/repo/info/refs',
      });
      expect(res.statusCode).toBe(200);
    });

    it('allows guest to access parameterized string route /posts/:id', async () => {
      const res = await publicApp.inject({ method: 'GET', url: '/posts/post-abc-123' });
      expect(res.statusCode).toBe(200);
      expect(res.json().postId).toBe('post-abc-123');
    });

    it('allows guest to access parameterized object route /channels/:id', async () => {
      const res = await publicApp.inject({ method: 'GET', url: '/channels/channel-xyz-789' });
      expect(res.statusCode).toBe(200);
      expect(res.json().channelId).toBe('channel-xyz-789');
    });
  });
});
