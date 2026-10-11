import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@quant/server-core', () => ({
  createApp: vi.fn(),
  createAppError: (
    message: string,
    statusCode: number,
    code: string,
    details?: Record<string, unknown>,
  ) => {
    const error = new Error(message) as Error & {
      statusCode: number;
      code: string;
      details?: Record<string, unknown>;
    };
    error.statusCode = statusCode;
    error.code = code;
    if (details !== undefined) error.details = details;
    return error;
  },
}));

// Import after mocks so the route picks up the mocked createAppError.
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import adminAiProvidersRoutes, { isAdminRole } from '../routes/admin-ai-providers';
import { DEFAULT_PROVIDER_ORDER } from '../services/ai-provider-settings.service';

function makeMockPrisma() {
  const store = new Map<string, any>();
  return {
    store,
    prisma: {
      aiProviderSettings: {
        findUnique: async ({ where }: { where: { scope: string } }) =>
          store.get(where.scope) ?? null,
        upsert: async ({ where, update, create }: any) => {
          const existing = store.get(where.scope);
          const row = existing
            ? { ...existing, ...update, updatedAt: new Date('2026-10-11T00:00:01Z') }
            : {
                ...create,
                createdAt: new Date('2026-10-11T00:00:00Z'),
                updatedAt: new Date('2026-10-11T00:00:00Z'),
              };
          store.set(where.scope, row);
          return row;
        },
      },
    },
  };
}

describe('/admin/ai/providers', () => {
  let app: ReturnType<typeof Fastify>;
  let mock: ReturnType<typeof makeMockPrisma>;
  let testAuth: { userId?: string; role?: string } | null;

  beforeEach(async () => {
    mock = makeMockPrisma();
    testAuth = null;
    app = Fastify();

    // Simulate the server-core auth plugin: requireAuth() returns a preHandler
    // that populates request.auth or 401s when no test auth is set.
    app.decorate('requireAuth', (_opts?: unknown) => {
      return async (request: FastifyRequest, _reply: FastifyReply) => {
        if (!testAuth) {
          const err = new Error('Missing or invalid authorization header') as Error & {
            statusCode: number;
            code: string;
          };
          err.statusCode = 401;
          err.code = 'UNAUTHORIZED';
          throw err;
        }
        (request as unknown as { auth: unknown }).auth = testAuth;
      };
    });
    app.decorate('prisma', mock.prisma);

    // Map thrown errors to HTTP status (the real app has a global error
    // handler; without it, ZodErrors surface as 500 here). Mirrors the
    // server-core error handler: passes through code + details.
    app.setErrorHandler((error: any, _request: FastifyRequest, reply: FastifyReply) => {
      const status =
        typeof error.statusCode === 'number'
          ? error.statusCode
          : error.name === 'ZodError'
            ? 400
            : 500;
      reply.status(status).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      });
    });

    await app.register(adminAiProvidersRoutes);
    await app.ready();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await app.close();
  });

  it('GET rejects unauthenticated callers with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/ai/providers' });
    expect(res.statusCode).toBe(401);
  });

  it('GET rejects non-admin roles with 403', async () => {
    testAuth = { userId: 'u1', role: 'user' };
    const res = await app.inject({ method: 'GET', url: '/admin/ai/providers' });
    expect(res.statusCode).toBe(403);
  });

  // F-056 regression: the war-room freeze requires the VERBATIM uppercase
  // role enum, so the gate must reject any case variant of 'ADMIN'.
  it.each(['admin', 'Admin', 'aDmIn'])(
    "GET rejects case-variant admin role '%s' with 403 (verbatim freeze)",
    async (role) => {
      testAuth = { userId: 'admin-1', role };
      const res = await app.inject({ method: 'GET', url: '/admin/ai/providers' });
      expect(res.statusCode).toBe(403);
    },
  );

  it('GET rejects the real uppercase USER role with 403', async () => {
    testAuth = { userId: 'u1', role: 'USER' };
    const res = await app.inject({ method: 'GET', url: '/admin/ai/providers' });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    // Improvement: 403 names the verbatim required role without leaking internals.
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.details).toEqual({ required: 'ADMIN' });
    expect(JSON.stringify(body.error)).not.toMatch(/MODERATOR|Prisma|UserRole|JWT|role/i);
    expect(Object.keys(body.error.details ?? {})).toEqual(['required']);
  });

  it('GET rejects missing role with 403', async () => {
    testAuth = { userId: 'u1' };
    const res = await app.inject({ method: 'GET', url: '/admin/ai/providers' });
    expect(res.statusCode).toBe(403);
  });

  it('GET rejects empty role with 403', async () => {
    testAuth = { userId: 'u1', role: '' };
    const res = await app.inject({ method: 'GET', url: '/admin/ai/providers' });
    expect(res.statusCode).toBe(403);
  });

  it('GET returns the default order and provider availability for admins (no secrets)', async () => {
    testAuth = { userId: 'admin-1', role: 'ADMIN' };
    const res = await app.inject({ method: 'GET', url: '/admin/ai/providers' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.order).toEqual(DEFAULT_PROVIDER_ORDER);
    expect(body.data.providers.map((p: any) => p.id)).toEqual([
      'meta',
      'openai',
      'anthropic',
      'google',
      'openrouter',
    ]);
    expect(JSON.stringify(body.data)).not.toMatch(/sk-|API_KEY/i);
  });

  it('PUT rejects non-admin roles with 403', async () => {
    testAuth = { userId: 'u1', role: 'user' };
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/ai/providers',
      payload: { order: ['openai', 'meta'] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PUT rejects an empty order with 400', async () => {
    testAuth = { userId: 'admin-1', role: 'ADMIN' };
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/ai/providers',
      payload: { order: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT rejects unknown provider ids with 400', async () => {
    testAuth = { userId: 'admin-1', role: 'ADMIN' };
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/ai/providers',
      payload: { order: ['meta', 'skynet'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT rejects duplicate provider ids with 400', async () => {
    testAuth = { userId: 'admin-1', role: 'ADMIN' };
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/ai/providers',
      payload: { order: ['meta', 'meta'] },
    });
    expect(res.statusCode).toBe(400);
  });

  describe('isAdminRole (unit)', () => {
    it("accepts only the verbatim 'ADMIN' role (war-room freeze)", () => {
      expect(isAdminRole('ADMIN')).toBe(true);
    });
    it('rejects case variants, other enum roles, empty, and non-strings', () => {
      expect(isAdminRole('admin')).toBe(false);
      expect(isAdminRole('Admin')).toBe(false);
      expect(isAdminRole('aDmIn')).toBe(false);
      expect(isAdminRole('USER')).toBe(false);
      expect(isAdminRole('MODERATOR')).toBe(false);
      expect(isAdminRole('')).toBe(false);
      expect(isAdminRole(undefined)).toBe(false);
      expect(isAdminRole(null)).toBe(false);
      expect(isAdminRole(42)).toBe(false);
      expect(isAdminRole(' admin')).toBe(false);
    });
  });

  it('PUT persists a valid order and GET reflects it', async () => {
    testAuth = { userId: 'admin-1', role: 'ADMIN' };
    const put = await app.inject({
      method: 'PUT',
      url: '/admin/ai/providers',
      payload: { order: ['openai', 'meta', 'anthropic'] },
    });
    expect(put.statusCode).toBe(200);
    const putBody = JSON.parse(put.body);
    expect(putBody.data.order).toEqual(['openai', 'meta', 'anthropic']);
    expect(putBody.data.updatedBy).toBe('admin-1');

    const get = await app.inject({ method: 'GET', url: '/admin/ai/providers' });
    const getBody = JSON.parse(get.body);
    expect(getBody.data.order).toEqual(['openai', 'meta', 'anthropic']);
  });
});
