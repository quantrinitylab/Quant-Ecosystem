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

const loadHandlers = async () => {
  const handlers = new Map<string, RouteHandler>();
  const app = {
    post(path: string, optionsOrHandler: unknown, maybeHandler?: RouteHandler) {
      handlers.set(path, (maybeHandler ?? optionsOrHandler) as RouteHandler);
    },
  };
  await authRoutes(app as never);
  return handlers;
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

const trustedHeaders = { origin: 'http://localhost:3000' };

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

describe('QuantMail browser refresh-token boundary', () => {
  it('keeps the login refresh token out of JSON and in a hardened cookie', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@quantmail.in',
      username: 'user',
      displayName: 'User',
      passwordHash: 'hashed_password',
      role: 'USER',
    });
    const handlers = await loadHandlers();
    const reply = makeReply();

    await handlers.get('/auth/login')!(
      { headers: trustedHeaders, body: { email: 'user@quantmail.in', password: 'password' } },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(reply.body.data.accessToken).toBe('access-token');
    expect(reply.body.data).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(reply.body)).not.toContain('refresh-token');
    expect(reply.cookie).toEqual({
      name: 'quantmail_refresh',
      value: 'refresh-token',
      options: expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/auth',
        maxAge: 2_592_000,
      }),
    });
    expect(reply.cookie.options).not.toHaveProperty('domain');
  });

  it('keeps the registration refresh token out of JSON', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue(null);
    mocks.prisma.user.create.mockResolvedValue({
      id: 'user-2',
      email: 'new@quantmail.in',
      username: 'new',
      role: 'USER',
    });
    const handlers = await loadHandlers();
    const reply = makeReply();

    await handlers.get('/auth/register')!(
      {
        headers: trustedHeaders,
        body: { email: 'new@quantmail.in', username: 'new', password: 'password' },
      },
      reply,
    );

    expect(reply.body.data).not.toHaveProperty('refreshToken');
    expect(reply.cookie.value).toBe('refresh-token');
  });

  it('rejects login and registration from a missing or untrusted Origin', async () => {
    const handlers = await loadHandlers();

    for (const path of ['/auth/login', '/auth/register']) {
      for (const headers of [{}, { origin: 'https://attacker.example' }]) {
        const reply = makeReply();
        await handlers.get(path)!(
          {
            headers,
            body: {
              email: 'blocked@quantmail.in',
              username: 'blocked',
              password: 'password',
            },
          },
          reply,
        );
        expect(reply.statusCode).toBe(403);
        expect(reply.body.error.code).toBe('UNTRUSTED_ORIGIN');
        expect(reply.cookie).toBeUndefined();
      }
    }

    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
    expect(mocks.generateTokenPair).not.toHaveBeenCalled();
  });

  it('rejects refresh from a missing or untrusted Origin', async () => {
    const handlers = await loadHandlers();

    for (const headers of [{}, { origin: 'https://attacker.example' }]) {
      const reply = makeReply();
      await handlers.get('/auth/refresh')!(
        { headers, cookies: { quantmail_refresh: 'refresh-token' } },
        reply,
      );
      expect(reply.statusCode).toBe(403);
      expect(reply.body.error.code).toBe('UNTRUSTED_ORIGIN');
    }
    expect(mocks.refreshToken).not.toHaveBeenCalled();
  });

  it('rotates both access and HttpOnly refresh credentials', async () => {
    const handlers = await loadHandlers();
    const reply = makeReply();

    await handlers.get('/auth/refresh')!(
      { headers: trustedHeaders, cookies: { quantmail_refresh: 'refresh-token' } },
      reply,
    );

    expect(mocks.refreshToken).toHaveBeenCalledWith('refresh-token');
    expect(reply.body.data).toEqual({
      accessToken: 'rotated-access-token',
      expiresIn: 900,
      tokenType: 'Bearer',
    });
    expect(reply.cookie.value).toBe('rotated-refresh-token');
  });

  it('revokes the complete stored family and clears the cookie on logout', async () => {
    const presented = 'refresh-token';
    mocks.prisma.refreshToken.findFirst.mockResolvedValue({ family: 'family-1' });
    const handlers = await loadHandlers();
    const reply = makeReply();

    await handlers.get('/auth/logout')!(
      { headers: trustedHeaders, cookies: { quantmail_refresh: presented } },
      reply,
    );

    expect(mocks.prisma.refreshToken.findFirst).toHaveBeenCalledWith({
      where: { token: createHash('sha256').update(presented).digest('hex') },
    });
    expect(mocks.prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { family: 'family-1' },
      data: { isRevoked: true },
    });
    expect(reply.clearedCookie).toEqual({
      name: 'quantmail_refresh',
      options: expect.objectContaining({ path: '/auth', httpOnly: true, secure: true }),
    });
  });
});
