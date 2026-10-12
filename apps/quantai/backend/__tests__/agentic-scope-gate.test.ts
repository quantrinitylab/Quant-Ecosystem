import { describe, it, expect, vi, beforeEach } from 'vitest';

// F-113: /agentic/chat and /agentic/confirm/:planId must enforce the
// `agents:execute` scope (matching the sibling agent seams), so a
// least-privilege / scope-restricted token that passes the global auth hook
// still cannot run agent tool plans.

// ---- Mocks (must precede the routes import) ----
vi.mock('@quant/server-core', () => ({
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

const gatewayMocks = vi.hoisted(() => ({
  plan: vi.fn(),
  checkPermissions: vi.fn(),
  execute: vi.fn(),
  confirm: vi.fn(),
  getExecutor: vi.fn(),
  bindHeldPlan: vi.fn(),
}));

vi.mock('../services/agent-gateway.service', () => ({
  getAgentGateway: () => gatewayMocks,
}));

vi.mock('../services/app-endpoints', () => ({
  APP_ENDPOINTS: [{ appId: 'quantmail' }],
  checkAppHealth: vi.fn(async (appId: string) => ({ appId, ok: true })),
}));

vi.mock('@quant/agentic', () => ({
  orchestrator: { runAgent: vi.fn() },
  WorkflowEngine: class {
    createWorkflow = vi.fn();
    executeWorkflow = vi.fn();
    getUserWorkflows = vi.fn(() => []);
  },
}));

import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import agenticRoutes from '../routes/agentic';

// Token fixtures keyed by the Authorization header value. The global hook below
// builds request.auth from these, mirroring what the real auth plugin decodes
// from a verified JWT (scopes claim -> auth.scopes).
const TOKENS: Record<string, Record<string, unknown>> = {
  'Bearer user-full': { userId: 'user-123', scopes: ['agents:execute'] },
  'Bearer user-limited': { userId: 'user-456', scopes: ['profile:read'] },
  'Bearer user-empty-scopes': { userId: 'user-789', scopes: [] },
  'Bearer user-no-scopes-key': { userId: 'user-000' }, // no `scopes` key at all
};

describe('agentic routes agents:execute scope gate (F-113)', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    gatewayMocks.plan.mockReturnValue({ id: 'plan-1', description: 'd', steps: [] });
    gatewayMocks.checkPermissions.mockReturnValue({ held: false });
    gatewayMocks.execute.mockResolvedValue([]);
    gatewayMocks.confirm.mockResolvedValue([{ ok: true }]);

    app = Fastify();

    // Faithful replica of the real requireAuth scope semantics
    // (packages/server-core/src/plugins/auth.ts): verified identity required,
    // then every required scope must be present in the granted set, else 403.
    (app as any).decorate(
      'requireAuth',
      (options?: { scopes?: string[] }) =>
        async (request: FastifyRequest, reply: any) => {
          const auth = (request as unknown as { auth?: { userId?: string; scopes?: string[] } }).auth;
          if (!auth?.userId) {
            return reply.status(401).send({
              success: false,
              error: { code: 'UNAUTHORIZED', message: 'Authentication required', statusCode: 401 },
            });
          }
          const granted: string[] = auth.scopes ?? [];
          const required = options?.scopes ?? [];
          if (!required.every((s) => granted.includes(s))) {
            return reply.status(403).send({
              success: false,
              error: { code: 'FORBIDDEN', message: 'Insufficient permissions', statusCode: 403 },
            });
          }
        },
    );

    // Simulate the global onRequest requireAuth hook installed by createApp():
    // every non-public path requires a verified token -> request.auth.
    app.addHook('onRequest', async (request: FastifyRequest, reply: any) => {
      const header = request.headers.authorization;
      const fixture = typeof header === 'string' ? TOKENS[header] : undefined;
      if (!fixture) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', statusCode: 401 },
        });
      }
      (request as unknown as { auth: Record<string, unknown> }).auth = fixture;
    });

    // Map thrown AppErrors (e.g. the 400 VALIDATION_ERROR below) to their
    // status codes, like the production error handler does.
    app.setErrorHandler((error: any, _request: FastifyRequest, reply: FastifyReply) => {
      const status = error.statusCode ?? 500;
      reply.status(status).send({
        success: false,
        error: { code: error.code ?? 'INTERNAL', message: error.message },
      });
    });

    await app.register(agenticRoutes, { prefix: '/agentic' });
    await app.ready();
  });

  it('POST /chat serves a token carrying agents:execute (JSON mode)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agentic/chat',
      headers: { authorization: 'Bearer user-full' },
      payload: { message: 'summarize my inbox', stream: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; data: { planId: string } };
    expect(body.success).toBe(true);
    expect(body.data.planId).toBe('plan-1');
    expect(gatewayMocks.plan).toHaveBeenCalledOnce();
  });

  it('POST /chat denies a token missing agents:execute with 403 (handler never runs)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agentic/chat',
      headers: { authorization: 'Bearer user-limited' },
      payload: { message: 'summarize my inbox', stream: false },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as any).error.code).toBe('FORBIDDEN');
    expect(gatewayMocks.plan).not.toHaveBeenCalled();
  });

  it('POST /chat denies a token with an empty scope list with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agentic/chat',
      headers: { authorization: 'Bearer user-empty-scopes' },
      payload: { message: 'hi', stream: false },
    });
    expect(res.statusCode).toBe(403);
    expect(gatewayMocks.plan).not.toHaveBeenCalled();
  });

  it('POST /chat denies a token whose identity carries no scopes key with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agentic/chat',
      headers: { authorization: 'Bearer user-no-scopes-key' },
      payload: { message: 'hi', stream: false },
    });
    expect(res.statusCode).toBe(403);
    expect(gatewayMocks.plan).not.toHaveBeenCalled();
  });

  it('POST /chat still 401s unauthenticated requests at the global hook', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agentic/chat',
      payload: { message: 'hi', stream: false },
    });
    expect(res.statusCode).toBe(401);
    expect(gatewayMocks.plan).not.toHaveBeenCalled();
  });

  it('POST /confirm/:planId enforces the scope gate as well', async () => {
    const denied = await app.inject({
      method: 'POST',
      url: '/agentic/confirm/plan-1',
      headers: { authorization: 'Bearer user-limited' },
      payload: { approved: true },
    });
    expect(denied.statusCode).toBe(403);
    expect(gatewayMocks.confirm).not.toHaveBeenCalled();

    const allowed = await app.inject({
      method: 'POST',
      url: '/agentic/confirm/plan-1',
      headers: { authorization: 'Bearer user-full' },
      payload: { approved: true },
    });
    expect(allowed.statusCode).toBe(200);
    const body = allowed.json() as { success: boolean; data: { approved: boolean } };
    expect(body.success).toBe(true);
    expect(body.data.approved).toBe(true);
    expect(gatewayMocks.confirm).toHaveBeenCalledOnce();
  });

  it('POST /confirm/:planId rejects a malformed plan id with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agentic/confirm/bad;plan$injection!',
      headers: { authorization: 'Bearer user-full' },
      payload: { approved: false },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as any).error.code).toBe('VALIDATION_ERROR');
    expect(gatewayMocks.confirm).not.toHaveBeenCalled();
  });

  it('GET /apps/health (no scope preHandler) is still globally authed', async () => {
    const anon = await app.inject({ method: 'GET', url: '/agentic/apps/health' });
    expect(anon.statusCode).toBe(401);

    const authed = await app.inject({
      method: 'GET',
      url: '/agentic/apps/health',
      headers: { authorization: 'Bearer user-full' },
    });
    expect(authed.statusCode).toBe(200);
    expect((authed.json() as any).success).toBe(true);
  });
});
