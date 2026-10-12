// ============================================================================
// QuantAI — agent-run analytics wiring tests (F-168)
//
// F-168 wired analytics.recordRun into the lane-side agent-run completion
// path (POST /agents/run in backend/routes/agentic.ts). Before the fix,
// nothing in the repo ever called recordRun, so GET /analytics/agents/top
// honestly returned [] forever.
//
// These tests use the REAL analytics singleton (importOriginal) so they
// assert actual recorded state — never synthesized — and a mocked
// orchestrator.runAgent so no real agent executes.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { runAgentMock } = vi.hoisted(() => ({ runAgentMock: vi.fn() }));

vi.mock('@quant/agentic', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@quant/agentic')>();
  return {
    ...actual,
    orchestrator: { runAgent: runAgentMock },
  };
});

vi.mock('@quant/server-core', () => ({
  createApp: vi.fn(),
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & {
      statusCode: number;
      code: string;
    };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

vi.mock('../services/agent-gateway.service', () => ({
  getAgentGateway: vi.fn(() => ({})),
}));

vi.mock('../services/app-endpoints', () => ({
  APP_ENDPOINTS: {},
  checkAppHealth: vi.fn(),
}));

import Fastify, { type FastifyRequest } from 'fastify';
import agenticRoutes from '../routes/agentic';
import analyticsRoutes from '../routes/analytics';
import { analytics } from '@quant/agentic';

describe('F-168: POST /agents/run records the run for /analytics/agents/top', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    runAgentMock.mockReset();
    app = Fastify();
    app.decorateRequest('auth', null);
    app.addHook('preHandler', async (request: FastifyRequest) => {
      (request as unknown as { auth: { userId: string } }).auth = {
        userId: 'test-user-123',
      };
    });
    await app.register(agenticRoutes, { prefix: '/agentic' });
    await app.register(analyticsRoutes, { prefix: '/analytics' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('records a successful run with real data (agentId, outcome, measured ms)', async () => {
    const agentId = 'f168-rec-success';
    runAgentMock.mockResolvedValue({ output: 'done' });

    const response = await app.inject({
      method: 'POST',
      url: '/agentic/agents/run',
      payload: { agentId, input: 'hello' },
    });

    expect(response.statusCode).toBe(200);

    const stats = analytics.getAgentStats(agentId);
    expect(stats).toBeDefined();
    expect(stats!.agentId).toBe(agentId);
    expect(stats!.totalRuns).toBeGreaterThanOrEqual(1);
    expect(stats!.successfulRuns).toBeGreaterThanOrEqual(1);
    expect(stats!.failedRuns).toBe(0);
    expect(stats!.averageResponseTime).toBeGreaterThanOrEqual(0);
    expect(stats!.lastUsed).toBeInstanceOf(Date);
  });

  it('records a failed run as a failure (not silently dropped)', async () => {
    const agentId = 'f168-rec-fail';
    runAgentMock.mockRejectedValue(new Error('agent exploded'));

    const response = await app.inject({
      method: 'POST',
      url: '/agentic/agents/run',
      payload: { agentId, input: 'hello' },
    });

    expect(response.statusCode).toBe(500);

    const stats = analytics.getAgentStats(agentId);
    expect(stats).toBeDefined();
    expect(stats!.totalRuns).toBeGreaterThanOrEqual(1);
    expect(stats!.failedRuns).toBeGreaterThanOrEqual(1);
    expect(stats!.successfulRuns).toBe(0);
  });

  it('records nothing when validation fails (no phantom entries)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agentic/agents/run',
      payload: { input: 'missing agentId' },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    // No agentId was supplied, so no run may be recorded under an empty key.
    expect(analytics.getAgentStats('')).toBeUndefined();
  });

  it('GET /analytics/agents/top includes a numeric successRate per entry', async () => {
    const agentId = 'f168-rec-top';
    runAgentMock.mockResolvedValue({ output: 'ok' });
    await app.inject({
      method: 'POST',
      url: '/agentic/agents/run',
      payload: { agentId, input: 'hi' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/analytics/agents/top',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Array<{
      agentId: string;
      successRate?: unknown;
    }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const entry of body) {
      expect(
        typeof entry.successRate,
        `entry ${entry.agentId} must carry a numeric successRate`,
      ).toBe('number');
    }
    const mine = body.find((e) => e.agentId === agentId);
    expect(mine).toBeDefined();
    expect(mine!.successRate).toBe(100);
  });
});
