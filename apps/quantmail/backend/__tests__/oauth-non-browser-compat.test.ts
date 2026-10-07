import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshToken: vi.fn(),
  generateTokenPair: vi.fn(),
  validateAccessToken: vi.fn(),
  revokeToken: vi.fn(),
  prisma: {
    oAuthClient: { findUnique: vi.fn(), create: vi.fn() },
    oAuthConsent: { findUnique: vi.fn(), upsert: vi.fn() },
    authorizationCode: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('@quant/auth/services/token-service', () => ({
  TokenService: class {
    refreshToken = mocks.refreshToken;
    generateTokenPair = mocks.generateTokenPair;
    validateAccessToken = mocks.validateAccessToken;
    revokeToken = mocks.revokeToken;
  },
}));

vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => 'test-access-key',
  getJwtRefreshSecret: () => 'test-refresh-key',
}));

vi.mock('@quant/auth/lib/prisma', () => ({
  default: mocks.prisma,
  prisma: mocks.prisma,
}));

vi.mock('@quant/auth/crypto/secure-random', () => ({
  generateId: (prefix: string) => `${prefix}test`,
}));

vi.mock('@quant/auth/crypto/pkce', () => ({
  validateCodeChallenge: vi.fn(async () => true),
}));

vi.mock('../services/oidc-key.service', () => ({
  oidcKeyService: {
    signIdToken: vi.fn(),
    getPublicJwks: vi.fn(async () => ({ keys: [] })),
  },
}));

import { oauthRoutes } from '../routes/oauth';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

async function loadPostHandlers() {
  const handlers = new Map<string, RouteHandler>();
  const app = {
    post(path: string, optionsOrHandler: unknown, maybeHandler?: RouteHandler) {
      handlers.set(path, (maybeHandler ?? optionsOrHandler) as RouteHandler);
    },
    get() {
      // These compatibility tests invoke only POST /oauth/token.
    },
  };
  await oauthRoutes(app as never);
  return handlers;
}

function makeReply() {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    setCookie: vi.fn(),
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return body;
    },
  };
  return reply;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refreshToken.mockResolvedValue({
    accessToken: 'oauth-access-rotated',
    refreshToken: 'oauth-refresh-rotated',
    expiresIn: 900,
    tokenType: 'Bearer',
  });
});

describe('QuantMail non-browser OAuth compatibility', () => {
  it('keeps the RFC token response, including refresh_token, for OAuth clients', async () => {
    const handlers = await loadPostHandlers();
    const reply = makeReply();

    await handlers.get('/oauth/token')!(
      {
        body: {
          grant_type: 'refresh_token',
          refresh_token: 'external-client-refresh-token',
          client_id: 'external-client',
        },
      },
      reply,
    );

    expect(mocks.refreshToken).toHaveBeenCalledWith('external-client-refresh-token');
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({
      access_token: 'oauth-access-rotated',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: 'oauth-refresh-rotated',
      scope: '',
    });
    expect(reply.setCookie).not.toHaveBeenCalled();
  });

  it('preserves the RFC invalid_grant failure for a rejected refresh credential', async () => {
    mocks.refreshToken.mockRejectedValueOnce(new Error('Refresh token rejected'));
    const handlers = await loadPostHandlers();
    const reply = makeReply();

    await handlers.get('/oauth/token')!(
      { body: { grant_type: 'refresh_token', refresh_token: 'rejected-token' } },
      reply,
    );

    expect(reply.statusCode).toBe(400);
    expect(reply.body).toEqual({
      error: 'invalid_grant',
      error_description: 'Refresh token rejected',
    });
    expect(reply.setCookie).not.toHaveBeenCalled();
  });
});
