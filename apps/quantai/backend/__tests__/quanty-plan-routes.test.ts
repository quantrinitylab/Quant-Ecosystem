// ============================================================================
// QuantAI — Fastify Routes Tests: /quanty (plan, wallet, permissions, credentials)
// PR-Q6. Uses Fastify inject; services are decorated fakes.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import quantyPlanRoutes from '../routes/quanty-plan';
import { QuantyPlanService, ToolPolicyService } from '../services/quanty-plan.service';

vi.mock('@quant/server-core', () => ({
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

describe('Fastify Routes: /quanty', () => {
  let app: ReturnType<typeof Fastify>;
  let testUserId: string | null = 'user-plan-tester';

  beforeEach(async () => {
    app = Fastify();

    // Unconfigured service (no Prisma) — honest empty states.
    app.decorate('quantyPlanService', new QuantyPlanService(null));
    app.decorate('toolPolicyService', new ToolPolicyService());
    app.decorateRequest('auth', null);

    app.addHook('preHandler', async (request: FastifyRequest) => {
      if (testUserId) {
        (request as unknown as { auth: { userId: string } }).auth = { userId: testUserId };
      }
    });

    await app.register(quantyPlanRoutes, { prefix: '/quanty' });
    await app.ready();
  });

  afterEach(async () => {
    testUserId = 'user-plan-tester';
    await app.close();
  });

  it('GET /quanty/plan — 401 without auth', async () => {
    testUserId = null;
    const res = await app.inject({ method: 'GET', url: '/quanty/plan' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /quanty/plan — honest unconfigured summary (no fake balances)', async () => {
    const res = await app.inject({ method: 'GET', url: '/quanty/plan' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.configured).toBe(false);
    expect(body.data.plan.name).toBe('Free plan');
    expect(body.data.tokens.expiresAt).toBeNull();
  });

  it('GET /quanty/wallet — honest unconfigured wallet', async () => {
    const res = await app.inject({ method: 'GET', url: '/quanty/wallet' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.configured).toBe(false);
    expect(body.data.history).toEqual([]);
  });

  it('GET /quanty/permissions — lists tools with default policies', async () => {
    const res = await app.inject({ method: 'GET', url: '/quanty/permissions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.tools.length).toBeGreaterThan(0);
    const send = body.data.tools.find((t: { id: string }) => t.id === 'mail.send');
    expect(send.policy).toBe('ask');
  });

  it('PUT /quanty/permissions — persists a policy change', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/quanty/permissions',
      payload: { tools: [{ id: 'mail.send', policy: 'deny' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.tools[0]).toMatchObject({ id: 'mail.send', policy: 'deny' });

    const check = await app.inject({ method: 'GET', url: '/quanty/permissions' });
    const checkBody = JSON.parse(check.body);
    expect(checkBody.data.tools.find((t: { id: string }) => t.id === 'mail.send').policy).toBe('deny');
  });

  it('PUT /quanty/permissions — 400 on invalid body', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/quanty/permissions',
      payload: { tools: [{ id: 'mail.send', policy: 'sometimes' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /quanty/permissions — 400 on unknown tool id', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/quanty/permissions',
      payload: { tools: [{ id: 'nope.tool', policy: 'allow' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /quanty/credentials — metadata only, never token values', async () => {
    const res = await app.inject({ method: 'GET', url: '/quanty/credentials' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.configured).toBe(false);
    expect(body.data.grants).toEqual([]);
  });

  it('DELETE /quanty/credentials/:id — 503 when store unconfigured (not a fake success)', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/quanty/credentials/g1' });
    expect(res.statusCode).toBe(503);
  });
});
