// @vitest-environment node
/**
 * POST /sso/ticket/exchange — strong-auth preservation + fail-closed liveness.
 *
 * P1 (CODEX-REVIEW 6244706188): the exchange minted an access token with
 * lastStrongAuthAt=now, silently renewing step-up authority — a session whose
 * strong auth was an hour old could mint → exchange → act on step-up-gated
 * routes with no new password/MFA challenge. A second P1: missing / deleted /
 * suspended users still received 200 + token (fail-open liveness).
 *
 * These are REAL Fastify + REAL JWT integration tests (not handler-direct
 * with a stubbed token service):
 *   - the mint goes through the real authPlugin with a real signed session
 *     JWT, so request.auth.lastStrongAuthAt is populated exactly like prod;
 *   - the exchange uses the REAL TokenService (real jose signing via a mocked
 *     getJwtSecret), so the minted token's claims are the real ones;
 *   - the minted token is then presented to a REAL requireStepUp-guarded
 *     route, proving the security property end to end.
 */

import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import * as jose from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_JWT_SECRET = 'test-sso-strongauth-secret-that-is-long-enough-123456';
const CLIENT_ID = 'client_quantai_1';
const CLIENT_SECRET = 'secret_quantai_1';

const mocks = vi.hoisted(() => {
  const userRow: any = { id: 'user-123', role: 'user', deletedAt: null, status: 'ACTIVE' };
  const prisma: any = {
    oAuthClient: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return { prisma, userRow };
});

vi.mock('@quant/auth/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock('@quant/auth/lib/secrets', () => ({
  getJwtSecret: () => TEST_JWT_SECRET,
  getJwtRefreshSecret: () => 'test-refresh-secret-that-is-long-enough-123456',
}));

import { authPlugin } from '@quant/server-core';
import { ssoTicketRoutes } from '../routes/sso-tickets';

const clientRow = (overrides: Record<string, unknown> = {}) => ({
  clientId: CLIENT_ID,
  clientSecretHash: createHash('sha256').update(CLIENT_SECRET).digest('hex'),
  isConfidential: true,
  ...overrides,
});

/** Sign a session JWT the way the login path does (real jose, test secret). */
const signSessionToken = async (lastStrongAuthAt?: number) => {
  const secret = new TextEncoder().encode(TEST_JWT_SECRET);
  const claims: Record<string, unknown> = {
    email: 'someone@quantmail.in',
    username: 'someone',
    role: 'user',
    scopes: ['openid', 'profile', 'email'],
    app: 'quantmail',
  };
  if (lastStrongAuthAt !== undefined) claims['lastStrongAuthAt'] = lastStrongAuthAt;
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .setIssuer('quantmail')
    .setAudience('quant-ecosystem')
    .setJti(`sess-${Math.random().toString(36).slice(2)}`)
    .setSubject('user-123')
    .sign(secret);
};

const build = async () => {
  const app = Fastify();
  await app.register(authPlugin, {
    jwtSecret: TEST_JWT_SECRET,
    jwtIssuer: 'quantmail',
    jwtAudience: 'quant-ecosystem',
  });
  // Mirror production: the global hook authenticates every request and
  // populates request.auth (including lastStrongAuthAt) — except the
  // server-to-server exchange/resolve paths, which carry client credentials.
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url ?? '';
    if (url.startsWith('/sso/ticket/exchange') || url.startsWith('/sso/ticket/resolve')) return;
    await (app as any).requireAuth()(request, reply);
  });
  await app.register(ssoTicketRoutes);
  // A step-up-gated probe route, like PATCH /account/recovery (P1 #1301).
  app.post(
    '/probe/step-up-gated',
    { preHandler: (app as any).requireStepUp({ windowSeconds: 900 }) },
    async () => ({ ok: true }),
  );
  await app.ready();
  return app;
};

const mintViaSession = async (app: any, sessionToken: string) => {
  const res = await app.inject({
    method: 'POST',
    url: '/sso/ticket/mint',
    headers: { authorization: `Bearer ${sessionToken}` },
    payload: { clientId: CLIENT_ID },
  });
  expect(res.statusCode).toBe(200);
  return res.json().ticket as string;
};

const exchangeTicket = async (app: any, ticket: string) => {
  const res = await app.inject({
    method: 'POST',
    url: '/sso/ticket/exchange',
    payload: { ticket, client_id: CLIENT_ID, client_secret: CLIENT_SECRET },
  });
  return res;
};

const decodeUnverified = (token: string) => jose.decodeJwt(token);

describe('POST /sso/ticket/exchange — strong-auth preservation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.prisma.oAuthClient.findUnique.mockReset();
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.oAuthClient.findUnique.mockResolvedValue(clientRow());
    mocks.prisma.user.findUnique.mockImplementation(async () => ({ ...mocks.userRow }));
    mocks.userRow.deletedAt = null;
    mocks.userRow.status = 'ACTIVE';
    mocks.userRow.role = 'user';
  });

  it('preserves a STALE lastStrongAuthAt across mint → exchange (no silent renewal)', async () => {
    const app = await build();
    const staleAt = Math.floor(Date.now() / 1000) - 3600; // strong auth 1h ago
    const sessionToken = await signSessionToken(staleAt);
    const ticket = await mintViaSession(app, sessionToken);

    const res = await exchangeTicket(app, ticket);
    expect(res.statusCode).toBe(200);
    const accessToken = res.json().data.accessToken as string;
    const claims = decodeUnverified(accessToken);
    // The exchanged token carries the ORIGINAL strong-auth time, not now.
    expect(claims['lastStrongAuthAt']).toBe(staleAt);
    await app.close();
  });

  it('a token exchanged from a stale session still 401s on step-up-gated routes', async () => {
    const app = await build();
    const staleAt = Math.floor(Date.now() / 1000) - 3600;
    const sessionToken = await signSessionToken(staleAt);
    const ticket = await mintViaSession(app, sessionToken);
    const res = await exchangeTicket(app, ticket);
    const accessToken = res.json().data.accessToken as string;

    const gated = await app.inject({
      method: 'POST',
      url: '/probe/step-up-gated',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(gated.statusCode).toBe(401);
    expect(gated.json().error.code).toBe('STEP_UP_REQUIRED');
    await app.close();
  });

  it('preserves a FRESH lastStrongAuthAt and the gated route passes', async () => {
    const app = await build();
    const freshAt = Math.floor(Date.now() / 1000) - 60; // strong auth 1m ago
    const sessionToken = await signSessionToken(freshAt);
    const ticket = await mintViaSession(app, sessionToken);
    const res = await exchangeTicket(app, ticket);
    expect(res.statusCode).toBe(200);
    const accessToken = res.json().data.accessToken as string;
    expect(decodeUnverified(accessToken)['lastStrongAuthAt']).toBe(freshAt);

    const gated = await app.inject({
      method: 'POST',
      url: '/probe/step-up-gated',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(gated.statusCode).toBe(200);
    await app.close();
  });

  it('unknown strong-auth (ticket minted before step-up support) stays stale, not fresh', async () => {
    const app = await build();
    // Session JWT with NO lastStrongAuthAt claim (legacy session).
    const sessionToken = await signSessionToken(undefined);
    const ticket = await mintViaSession(app, sessionToken);
    const res = await exchangeTicket(app, ticket);
    expect(res.statusCode).toBe(200);
    const accessToken = res.json().data.accessToken as string;
    // The claim is absent — NOT defaulted to now.
    expect(decodeUnverified(accessToken)['lastStrongAuthAt']).toBeUndefined();

    const gated = await app.inject({
      method: 'POST',
      url: '/probe/step-up-gated',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(gated.statusCode).toBe(401);
    expect(gated.json().error.code).toBe('STEP_UP_REQUIRED');
    await app.close();
  });
});

describe('POST /sso/ticket/exchange — fail-closed account liveness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.prisma.oAuthClient.findUnique.mockReset();
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.oAuthClient.findUnique.mockResolvedValue(clientRow());
    mocks.prisma.user.findUnique.mockImplementation(async () => ({ ...mocks.userRow }));
    mocks.userRow.deletedAt = null;
    mocks.userRow.status = 'ACTIVE';
    mocks.userRow.role = 'user';
  });

  const mintFreshTicket = async (app: any) => {
    const sessionToken = await signSessionToken(Math.floor(Date.now() / 1000));
    return mintViaSession(app, sessionToken);
  };

  it('rejects a soft-deleted user exactly like a missing one (401, no token)', async () => {
    const app = await build();
    const ticket = await mintFreshTicket(app);
    mocks.userRow.deletedAt = new Date();
    const res = await exchangeTicket(app, ticket);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_grant');
    expect(res.json().data?.accessToken).toBeUndefined();
    await app.close();
  });

  it('rejects a missing user with 401 and no token', async () => {
    const app = await build();
    const ticket = await mintFreshTicket(app);
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const res = await exchangeTicket(app, ticket);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_grant');
    expect(res.json().data?.accessToken).toBeUndefined();
    await app.close();
  });

  it('rejects an account deleted between mint and exchange', async () => {
    const app = await build();
    const ticket = await mintFreshTicket(app);
    // The account is tombstoned AFTER the ticket is minted.
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const res = await exchangeTicket(app, ticket);
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('rejects a suspended account with 401 ACCOUNT_SUSPENDED and no token', async () => {
    const app = await build();
    const ticket = await mintFreshTicket(app);
    mocks.userRow.status = 'SUSPENDED';
    const res = await exchangeTicket(app, ticket);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('ACCOUNT_SUSPENDED');
    expect(res.json().data?.accessToken).toBeUndefined();
    await app.close();
  });

  it('rejects a deactivated account with 401 ACCOUNT_DEACTIVATED and no token', async () => {
    const app = await build();
    const ticket = await mintFreshTicket(app);
    mocks.userRow.status = 'DEACTIVATED';
    const res = await exchangeTicket(app, ticket);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('ACCOUNT_DEACTIVATED');
    expect(res.json().data?.accessToken).toBeUndefined();
    await app.close();
  });

  it('fails closed with 503 when the user lookup throws (never mints)', async () => {
    const app = await build();
    const ticket = await mintFreshTicket(app);
    mocks.prisma.user.findUnique.mockRejectedValue(new Error('db down'));
    const res = await exchangeTicket(app, ticket);
    expect(res.statusCode).toBe(503);
    expect(res.json().data?.accessToken).toBeUndefined();
    await app.close();
  });
});
