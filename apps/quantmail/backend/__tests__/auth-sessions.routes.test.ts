import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  generateTokenPair: vi.fn(),
  refreshToken: vi.fn(),
}));

vi.mock('@quant/auth/lib/prisma', () => ({
  default: mocks.prisma,
  prisma: mocks.prisma,
}));

vi.mock('argon2', () => ({
  hash: vi.fn(async (password: string) => `hashed_${password}`),
  verify: vi.fn(async () => true),
}));

vi.mock('@quant/auth/services/token-service', () => ({
  TokenService: class {
    generateTokenPair = mocks.generateTokenPair;
    refreshToken = mocks.refreshToken;
  },
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-secret',
  getJwtRefreshSecret: () => 'test-refresh-secret',
}));

import { authRoutes } from '../routes/auth';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

const loadRoutes = async () => {
  const routes = new Map<string, { options: any; handler: RouteHandler }>();
  const registerRoute = (path: string, optionsOrHandler: unknown, maybeHandler?: RouteHandler) => {
    if (maybeHandler) {
      routes.set(path, { options: optionsOrHandler, handler: maybeHandler });
    } else {
      routes.set(path, { options: undefined, handler: optionsOrHandler as RouteHandler });
    }
  };
  const app = {
    post: registerRoute,
    get: registerRoute,
    patch: registerRoute,
    put: registerRoute,
    delete: registerRoute,
    // Step-up guard decoration (server-core auth plugin in production). These
    // handler-level tests exercise the route logic, not the guard — the guard
    // itself is covered by the server-core and settings-tokens suites.
    requireStepUp: () => async () => {},
  };
  await authRoutes(app as never);
  return routes;
};

const makeReply = () => {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    cookie: undefined,
    clearedCookie: undefined,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return body;
    },
    setCookie(name: string, value: string, options: unknown) {
      this.cookie = { name, value, options };
      return this;
    },
    clearCookie(name: string, options: unknown) {
      this.clearedCookie = { name, options };
      return this;
    },
  };
  return reply;
};

const trustedHeaders = (userAgent = 'TestAgent/1.0') => ({
  origin: 'http://localhost:3000',
  'user-agent': userAgent,
});

const digestOf = (token: string) => createHash('sha256').update(token).digest('hex');

beforeEach(() => {
  vi.clearAllMocks();
  process.env['NODE_ENV'] = 'production';
  process.env['CORS_ORIGINS'] = 'http://localhost:3000,https://mail.quantrinity.in';
  mocks.generateTokenPair.mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
    tokenType: 'Bearer',
  });
  mocks.refreshToken.mockResolvedValue({
    accessToken: 'rotated-access-token',
    refreshToken: 'rotated-refresh-token',
    expiresIn: 900,
    tokenType: 'Bearer',
  });
});

describe('GET /auth/sessions', () => {
  const liveRows = () => [
    {
      family: 'fam-other',
      token: digestOf('other-old-token'),
      userId: 'user-1',
      isRevoked: false,
      createdAt: new Date('2026-10-01T10:00:00.000Z'),
      expiresAt: new Date('2026-11-10T10:00:00.000Z'),
      userAgent: null,
      ipAddress: null,
      source: null,
    },
    {
      family: 'fam-other',
      token: digestOf('other-token'),
      userId: 'user-1',
      isRevoked: false,
      createdAt: new Date('2026-10-10T10:00:00.000Z'),
      expiresAt: new Date('2026-11-10T10:00:00.000Z'),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0',
      ipAddress: '1.2.3.4',
      source: 'browser',
    },
    {
      family: 'fam-current',
      token: digestOf('current-token'),
      userId: 'user-1',
      isRevoked: false,
      createdAt: new Date('2026-10-11T08:00:00.000Z'),
      expiresAt: new Date('2026-11-11T08:00:00.000Z'),
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
      ipAddress: null,
      source: 'browser',
    },
  ];

  it('requires authentication', async () => {
    const routes = await loadRoutes();
    const reply = makeReply();
    await routes.get('/auth/sessions')!.handler({ cookies: {} }, reply);
    expect(reply.statusCode).toBe(401);
    expect(mocks.prisma.refreshToken.findMany).not.toHaveBeenCalled();
  });

  it('lists one entry per live family, current first, with real metadata', async () => {
    mocks.prisma.refreshToken.findMany.mockResolvedValue(liveRows());
    const routes = await loadRoutes();
    const reply = makeReply();

    await routes.get('/auth/sessions')!.handler(
      { auth: { userId: 'user-1' }, cookies: { quantmail_refresh: 'current-token' } },
      reply,
    );

    // Only live browser families: revoked, expired and oauth-tagged rows are
    // excluded at the query, never in JS.
    expect(mocks.prisma.refreshToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          isRevoked: false,
          expiresAt: { gt: expect.any(Date) },
          OR: [{ source: 'browser' }, { source: null }],
        }),
      }),
    );

    expect(reply.statusCode).toBe(200);
    const { sessions } = reply.body.data;
    expect(sessions).toHaveLength(2);

    // Current family first, identified by the refresh cookie digest.
    expect(sessions[0].id).toBe('fam-current');
    expect(sessions[0].isCurrent).toBe(true);
    expect(sessions[0].userAgent).toContain('Macintosh');

    // The other family: first sign-in from the oldest row, last activity and
    // device metadata from the newest row (the rotation history row).
    expect(sessions[1].id).toBe('fam-other');
    expect(sessions[1].isCurrent).toBe(false);
    expect(sessions[1].firstSeenAt).toBe('2026-10-01T10:00:00.000Z');
    expect(sessions[1].lastActiveAt).toBe('2026-10-10T10:00:00.000Z');
    expect(sessions[1].userAgent).toContain('Windows NT');
  });

  it('marks nothing current when the refresh cookie is absent', async () => {
    mocks.prisma.refreshToken.findMany.mockResolvedValue(liveRows());
    const routes = await loadRoutes();
    const reply = makeReply();

    await routes.get('/auth/sessions')!.handler({ auth: { userId: 'user-1' }, cookies: {} }, reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.sessions.every((s: any) => s.isCurrent === false)).toBe(true);
  });
});

describe('POST /auth/sessions/revoke-others', () => {
  it('is step-up guarded and requires authentication', async () => {
    const routes = await loadRoutes();
    const route = routes.get('/auth/sessions/revoke-others')!;
    // The guard itself is a server-core preHandler; the route must wire it.
    expect(typeof route.options?.preHandler).toBe('function');

    const reply = makeReply();
    await route.handler({ cookies: {} }, reply);
    expect(reply.statusCode).toBe(401);
    expect(mocks.prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('revokes every other live family but keeps the current one', async () => {
    mocks.prisma.refreshToken.findFirst.mockResolvedValue({ family: 'fam-current' });
    mocks.prisma.refreshToken.findMany.mockResolvedValue([{ family: 'fam-a' }, { family: 'fam-b' }]);
    mocks.prisma.refreshToken.updateMany.mockResolvedValue({ count: 4 });
    const routes = await loadRoutes();
    const reply = makeReply();

    await routes.get('/auth/sessions/revoke-others')!.handler(
      { auth: { userId: 'user-1' }, cookies: { quantmail_refresh: 'current-token' } },
      reply,
    );

    expect(mocks.prisma.refreshToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ token: digestOf('current-token'), userId: 'user-1' }),
      }),
    );
    expect(mocks.prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', family: { in: ['fam-a', 'fam-b'] } },
      data: { isRevoked: true },
    });
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.revokedSessions).toBe(2);
    expect(reply.body.data.message).toContain('2 other sessions');
  });

  it('fails closed when the current session cannot be identified', async () => {
    mocks.prisma.refreshToken.findFirst.mockResolvedValue(null);
    const routes = await loadRoutes();
    const reply = makeReply();

    await routes.get('/auth/sessions/revoke-others')!.handler(
      { auth: { userId: 'user-1' }, cookies: {} },
      reply,
    );

    // Revoking "everything except this one" is meaningless when "this one"
    // is unknown — refuse instead of signing the caller out everywhere.
    expect(reply.statusCode).toBe(409);
    expect(reply.body.error.code).toBe('CURRENT_SESSION_UNKNOWN');
    expect(mocks.prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('reports honestly when there is nothing else to revoke', async () => {
    mocks.prisma.refreshToken.findFirst.mockResolvedValue({ family: 'fam-current' });
    mocks.prisma.refreshToken.findMany.mockResolvedValue([]);
    const routes = await loadRoutes();
    const reply = makeReply();

    await routes.get('/auth/sessions/revoke-others')!.handler(
      { auth: { userId: 'user-1' }, cookies: { quantmail_refresh: 'current-token' } },
      reply,
    );

    expect(mocks.prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.revokedSessions).toBe(0);
    expect(reply.body.data.message).toBe('No other sessions to revoke.');
  });
});

describe('session metadata capture', () => {
  it('stamps browser metadata on login', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@quantmail.in',
      username: 'user',
      passwordHash: 'hashed_password',
      role: 'USER',
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });
    const routes = await loadRoutes();
    const reply = makeReply();

    await routes.get('/auth/login')!.handler(
      {
        headers: { ...trustedHeaders('LoginAgent/2.0'), origin: 'http://localhost:3000' },
        ip: '9.9.9.9',
        body: { email: 'user@quantmail.in', password: 'password' },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(mocks.generateTokenPair).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined,
      undefined,
      { source: 'browser', userAgent: 'LoginAgent/2.0', ipAddress: '9.9.9.9' },
    );
  });

  it('tags the browser on every refresh rotation', async () => {
    const routes = await loadRoutes();
    const reply = makeReply();

    await routes.get('/auth/refresh')!.handler(
      {
        headers: { ...trustedHeaders('RotateAgent/3.0'), origin: 'http://localhost:3000' },
        ip: '8.8.8.8',
        cookies: { quantmail_refresh: 'old-token' },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    // The explicit 'browser' tag is what promotes legacy untagged rows on
    // their first rotation after metadata capture ships.
    expect(mocks.refreshToken).toHaveBeenCalledWith('old-token', {
      source: 'browser',
      userAgent: 'RotateAgent/3.0',
      ipAddress: '8.8.8.8',
    });
  });
});
