import { describe, it, expect, beforeEach } from 'vitest';

// GET /auth/me — backs the frontend SSO ticket verification
// (/api/auth/userinfo). Without it, SSO round-trips silently bounced.
import Fastify, { type FastifyRequest } from 'fastify';
import authRoutes from '../routes/auth';

describe('GET /auth/me', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();

    // Simulate the global requireAuth onRequest hook from createApp():
    // a verified token yields request.auth; we test both states.
    app.decorateRequest('auth', null);
    app.addHook('preHandler', async (request: FastifyRequest) => {
      const header = request.headers.authorization;
      if (header === 'Bearer valid-token') {
        (request as unknown as { auth: Record<string, unknown> }).auth = {
          userId: 'user-123',
          email: 'user@quantmail.in',
          username: 'testuser',
          role: 'user',
        };
      }
    });

    await app.register(authRoutes, { prefix: '/auth' });
    await app.ready();
  });

  it('returns the verified identity for a valid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer valid-token' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; data: Record<string, string> };
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('user-123');
    expect(body.data.sub).toBe('user-123');
    expect(body.data.email).toBe('user@quantmail.in');
  });

  it('never fabricates an identity when auth is absent', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; data: Record<string, string> };
    expect(body.success).toBe(true);
    // Empty strings, not invented user-1 / user@quantmail.in placeholders.
    expect(body.data.id).toBe('');
    expect(body.data.email).toBe('');
  });
});
