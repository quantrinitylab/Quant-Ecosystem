import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock server-core to provide createAppError without booting the whole platform
vi.mock('@quant/server-core', () => ({
  createApp: vi.fn(),
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

import Fastify, { type FastifyRequest } from 'fastify';
import orchestrationRoutes from '../routes/orchestration';

/**
 * F-002 regression tests: the hardcoded demo fixtures (DemoModeConnector) and
 * the unauthenticated 'demo-user' identity were deleted. These routes must
 * fail closed — no fabricated data, no demo identity, no wildcard grant.
 */
describe('orchestration routes (F-002)', () => {
  let app: ReturnType<typeof Fastify>;

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('unauthenticated requests', () => {
    beforeEach(async () => {
      app = Fastify();
      app.decorateRequest('auth', null);
      await app.register(orchestrationRoutes, { prefix: '/orchestration' });
      await app.ready();
    });

    it.each([
      ['/orchestration/summarize-day', {}],
      ['/orchestration/draft-reply', { emailId: 'email-001' }],
      [
        '/orchestration/schedule-meeting',
        { title: 'Sync', attendees: ['a@x.com'], preferredTime: '2025-01-20T14:00:00.000Z' },
      ],
      ['/orchestration/search-and-summarize', { query: 'report' }],
      ['/orchestration/chat-followup', { conversationId: 'conv-1' }],
    ])('POST %s without auth returns 401 (no demo-user fallback)', async (url, body) => {
      const response = await app.inject({ method: 'POST', url, payload: body });

      expect(response.statusCode).toBe(401);
    });

    it('returns no fabricated fixture data for unauthenticated requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orchestration/summarize-day',
        payload: {},
      });

      expect(response.body).not.toContain('alice@example.com');
      expect(response.body).not.toContain('email-001');
      expect(response.body).not.toContain('quant-core');
      expect(response.body).not.toContain('demo-user');
    });
  });

  describe('authenticated requests without configured sibling backends', () => {
    beforeEach(async () => {
      app = Fastify();
      app.decorateRequest('auth', null);
      app.addHook('preHandler', async (request: FastifyRequest) => {
        (request as unknown as { auth: { userId: string } }).auth = { userId: 'test-user-123' };
      });
      await app.register(orchestrationRoutes, { prefix: '/orchestration' });
      await app.ready();
    });

    it('fails closed (503) instead of serving fabricated data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/orchestration/summarize-day',
        payload: {},
        headers: { authorization: 'Bearer real-token' },
      });

      // HttpAppConnectors has no backend URLs configured in this env, so it
      // must fail closed — never fabricate a "day summary".
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain('alice@example.com');
      expect(response.body).not.toContain('quant-core');
    });
  });
});
