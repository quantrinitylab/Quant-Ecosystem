// fix/qm-api-roundtrip-latency — POST /auth/refresh carries the profile inline.
//
// The browser hydration used to pay a SECOND sequential round trip (GET
// /oauth/userinfo) after every refresh just to learn who it is. The refresh
// response now embeds the session's own user (same shape as GET
// /oauth/userinfo) so the client hydrates in one round trip. The user is
// located the same possession-bound way /auth/logout does — the one-way
// digest of the presented refresh token — so this adds no new trust
// assumption. These tests pin that contract: user present when the row
// exists, field omitted (still success) when the account vanished between
// calls, and the no-cookie fast 401 untouched.

import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    refreshToken: {
      findFirst: vi.fn(),
    },
  },
  refreshToken: vi.fn(),
}));

vi.mock('@quant/auth/lib/prisma', () => ({
  default: mocks.prisma,
  prisma: mocks.prisma,
}));

vi.mock('@quant/auth/services/token-service', () => ({
  TokenService: class {
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

const b64u = (s: string) => Buffer.from(s).toString('base64url');
const fakeJwtFor = (sub: string) =>
  `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub }))}.fakesig`;
const digestOf = (token: string) => createHash('sha256').update(token).digest('hex');

const makeRequest = (refreshCookie: string | undefined) => ({
  headers: { origin: 'http://localhost:3000', 'user-agent': 'TestAgent/1.0' },
  cookies: refreshCookie === undefined ? {} : { quantmail_refresh: refreshCookie },
  ip: '127.0.0.1',
});

describe('POST /auth/refresh inline user (fix/qm-api-roundtrip-latency)', () => {
  let refresh: RouteHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env['NODE_ENV'] = 'production';
    process.env['CORS_ORIGINS'] = 'http://localhost:3000';
    mocks.refreshToken.mockResolvedValue({
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      expiresIn: 900,
      tokenType: 'Bearer',
    });
    const routes = await loadRoutes();
    refresh = routes.get('/auth/refresh')!.handler;
  });

  it('attaches the user profile inline on a successful rotation', async () => {
    const presented = fakeJwtFor('user-1');
    mocks.prisma.refreshToken.findFirst.mockResolvedValue({ userId: 'user-1' });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'ada@quantmail.in',
      username: 'ada',
      displayName: 'Ada Lovelace',
      role: 'user',
    });

    const reply = makeReply();
    await refresh(makeRequest(presented), reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toMatchObject({
      success: true,
      data: {
        accessToken: 'rotated-access-token',
        expiresIn: 900,
        tokenType: 'Bearer',
        user: {
          id: 'user-1',
          email: 'ada@quantmail.in',
          username: 'ada',
          displayName: 'Ada Lovelace',
          role: 'user',
        },
      },
    });
    // Possession-bound lookup: the one-way digest of the presented cookie, the
    // same mechanism /auth/logout uses — no new trust assumption.
    expect(mocks.prisma.refreshToken.findFirst).toHaveBeenCalledWith({
      where: { token: digestOf(presented) },
    });
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('omits the user field but still succeeds when the session row is gone', async () => {
    const presented = fakeJwtFor('user-gone');
    mocks.prisma.refreshToken.findFirst.mockResolvedValue(null);

    const reply = makeReply();
    await refresh(makeRequest(presented), reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.body.success).toBe(true);
    expect(reply.body.data.accessToken).toBe('rotated-access-token');
    expect('user' in reply.body.data).toBe(false);
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('keeps the no-cookie fast 401 without touching the user table', async () => {
    const reply = makeReply();
    await refresh(makeRequest(undefined), reply);

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('REFRESH_REQUIRED');
    expect(mocks.prisma.refreshToken.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.refreshToken).not.toHaveBeenCalled();
  });
});
