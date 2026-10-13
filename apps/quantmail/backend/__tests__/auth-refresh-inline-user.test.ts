// fix/qm-api-roundtrip-latency — POST /auth/refresh carries the profile inline.
//
// The browser hydration used to pay a SECOND sequential round trip (GET
// /oauth/userinfo) after every refresh just to learn who it is. The refresh
// service already looks the user up (indexed findUnique on the token's sub),
// so the handler attaches `{ id, email, username, displayName, role }` to the
// refresh response and the client skips the second trip. These tests pin that
// contract: user present when the row exists, field omitted (still success)
// when the account vanished between calls, and the no-cookie fast 401
// untouched.

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

// `decodeJwt` is verification-free, so an unsigned fake JWT is enough to
// exercise the sub → user-row lookup. The handler only decodes AFTER
// `tokenService.refreshToken` cryptographically verified the real cookie.
const fakeJwtFor = (sub: string) => {
  const b64u = (s: string) => Buffer.from(s).toString('base64url');
  return `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub }))}.fakesig`;
};

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
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'ada@quantmail.in',
      username: 'ada',
      displayName: 'Ada Lovelace',
      role: 'user',
    });

    const reply = makeReply();
    await refresh(makeRequest(fakeJwtFor('user-1')), reply);

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
    // The lookup is the same indexed findUnique the profile endpoint runs —
    // no new query class, just one the refresh already paid for.
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, email: true, username: true, displayName: true, role: true },
    });
  });

  it('omits the user field but still succeeds when the account is gone', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);

    const reply = makeReply();
    await refresh(makeRequest(fakeJwtFor('user-gone')), reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.body.success).toBe(true);
    expect(reply.body.data.accessToken).toBe('rotated-access-token');
    expect('user' in reply.body.data).toBe(false);
  });

  it('keeps the no-cookie fast 401 without touching the user table', async () => {
    const reply = makeReply();
    await refresh(makeRequest(undefined), reply);

    expect(reply.statusCode).toBe(401);
    expect(reply.body.error.code).toBe('REFRESH_REQUIRED');
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.refreshToken).not.toHaveBeenCalled();
  });
});
