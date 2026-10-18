// POST /sso/ticket/exchange — server-to-server ticket→token exchange.
//
// The QuantAI web tier has no backend of its own, so the identity root mints
// the access token directly after the same validation chain as
// /sso/ticket/resolve. These tests pin the security properties at the route
// layer (fake Fastify, real ticket crypto, mocked prisma + token service):
//   1. valid ticket + correct client credentials → 200 with user + accessToken
//   2. missing ticket → 400 (no token)
//   3. unknown client → 401
//   4. wrong client secret → 401
//   5. ticket is single-use — the second exchange fails 400
//   6. a ticket minted for client A cannot be exchanged by client B → 403
//   7. expired tickets → 400
//   8. only an access token is minted — never a refresh pair (no orphaned
//      refresh credential), and no token ever travels in a URL.

import { createHash } from 'node:crypto';
import * as jose from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma: any = {
    oAuthClient: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  const generateAccessToken = vi.fn(async () => ({
    accessToken: 'minted-access-token',
    expiresIn: 900,
    tokenType: 'Bearer' as const,
  }));
  return { prisma, generateAccessToken };
});

vi.mock('@quant/auth/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));

vi.mock('../lib/auth-session', () => ({
  createTokenService: () => ({ generateAccessToken: mocks.generateAccessToken }),
}));

import { ssoTicketRoutes } from '../routes/sso-tickets';
import {
  getSsoTicketSecretForTests,
  mintSsoTicket,
  SSO_TICKET_TYPE,
} from '../services/sso-ticket';

type RouteHandler = (request: any, reply: any) => Promise<unknown>;

const loadHandlers = async () => {
  const handlers = new Map<string, RouteHandler>();
  const fake: any = {
    post: (path: string, opts: unknown, handler?: RouteHandler) =>
      handlers.set(`POST ${path}`, (handler ?? opts) as RouteHandler),
  };
  await ssoTicketRoutes(fake);
  return handlers;
};

const reply = () => {
  const r: any = { statusCode: 200, body: undefined as unknown };
  r.code = (n: number) => {
    r.statusCode = n;
    return r;
  };
  r.send = (b: unknown) => {
    r.body = b;
    return r;
  };
  return r;
};

const CLIENT_ID = 'client_quantai_1';
const CLIENT_SECRET = 'secret_quantai_1';
const clientRow = (overrides: Record<string, unknown> = {}) => ({
  clientId: CLIENT_ID,
  clientSecretHash: createHash('sha256').update(CLIENT_SECRET).digest('hex'),
  isConfidential: true,
  ...overrides,
});

const exchange = async (
  handlers: Map<string, RouteHandler>,
  payload: Record<string, unknown>,
) => {
  const handler = handlers.get('POST /sso/ticket/exchange');
  if (!handler) throw new Error('exchange route not registered');
  const r = reply();
  await handler({ body: payload, headers: {} }, r);
  return r;
};

describe('POST /sso/ticket/exchange', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.generateAccessToken.mockClear();
    mocks.prisma.oAuthClient.findUnique.mockReset();
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.oAuthClient.findUnique.mockResolvedValue(clientRow());
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'user' });
  });

  it('exchanges a valid ticket for an access token', async () => {
    const handlers = await loadHandlers();
    const ticket = await mintSsoTicket({
      userId: 'user-123',
      email: 'someone@quantmail.in',
      username: 'someone',
      displayName: 'Someone',
      clientId: CLIENT_ID,
    });

    const r = await exchange(handlers, {
      ticket,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    expect(r.statusCode).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.user).toEqual({
      id: 'user-123',
      email: 'someone@quantmail.in',
      username: 'someone',
      displayName: 'Someone',
    });
    expect(r.body.data.accessToken).toBe('minted-access-token');
    // Access token only — the same mint never produces a refresh credential.
    expect(r.body.data.refreshToken).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toContain('refresh');
    expect(mocks.generateAccessToken).toHaveBeenCalledTimes(1);
    // mock.calls is typed as the empty tuple; convert through `unknown` to
    // read the [userId, userInfo, scopes, app] pair back out (TS2493).
    const [userId, userInfo, scopes, app] = mocks.generateAccessToken.mock
      .calls[0] as unknown as [string, Record<string, string>, string[], string];
    expect(userId).toBe('user-123');
    expect(userInfo).toEqual({
      email: 'someone@quantmail.in',
      username: 'someone',
      role: 'user',
    });
    expect(scopes).toEqual(['openid', 'profile', 'email']);
    expect(app).toBe('quantmail');
  });

  it('rejects a missing ticket with 400', async () => {
    const handlers = await loadHandlers();
    const r = await exchange(handlers, { client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
    expect(r.statusCode).toBe(400);
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an unknown client with 401', async () => {
    const handlers = await loadHandlers();
    mocks.prisma.oAuthClient.findUnique.mockResolvedValue(null);
    const ticket = await mintSsoTicket({
      userId: 'user-123',
      email: 'someone@quantmail.in',
      username: 'someone',
      displayName: 'Someone',
      clientId: CLIENT_ID,
    });
    const r = await exchange(handlers, {
      ticket,
      client_id: 'nope',
      client_secret: CLIENT_SECRET,
    });
    expect(r.statusCode).toBe(401);
    expect(r.body.error.code).toBe('invalid_client');
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a wrong client secret with 401', async () => {
    const handlers = await loadHandlers();
    const ticket = await mintSsoTicket({
      userId: 'user-123',
      email: 'someone@quantmail.in',
      username: 'someone',
      displayName: 'Someone',
      clientId: CLIENT_ID,
    });
    const r = await exchange(handlers, {
      ticket,
      client_id: CLIENT_ID,
      client_secret: 'wrong-secret',
    });
    expect(r.statusCode).toBe(401);
    expect(r.body.error.code).toBe('invalid_client');
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
  });

  it('consumes the ticket exactly once — the second exchange fails 400', async () => {
    const handlers = await loadHandlers();
    const ticket = await mintSsoTicket({
      userId: 'user-123',
      email: 'someone@quantmail.in',
      username: 'someone',
      displayName: 'Someone',
      clientId: CLIENT_ID,
    });
    const creds = { client_id: CLIENT_ID, client_secret: CLIENT_SECRET };

    const first = await exchange(handlers, { ticket, ...creds });
    expect(first.statusCode).toBe(200);

    const second = await exchange(handlers, { ticket, ...creds });
    expect(second.statusCode).toBe(400);
    expect(second.body.error.code).toBe('invalid_grant');
    expect(mocks.generateAccessToken).toHaveBeenCalledTimes(1);
  });

  it('rejects a ticket minted for a different client with 403', async () => {
    const handlers = await loadHandlers();
    const otherClientId = 'client_other_9';
    mocks.prisma.oAuthClient.findUnique.mockImplementation(async ({ where }: any) =>
      where.clientId === CLIENT_ID ? clientRow() : clientRow({ clientId: otherClientId }),
    );
    const ticket = await mintSsoTicket({
      userId: 'user-123',
      email: 'someone@quantmail.in',
      username: 'someone',
      displayName: 'Someone',
      clientId: CLIENT_ID,
    });
    const r = await exchange(handlers, {
      ticket,
      client_id: otherClientId,
      client_secret: CLIENT_SECRET,
    });
    expect(r.statusCode).toBe(403);
    expect(r.body.error.code).toBe('invalid_grant');
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an expired ticket with 400', async () => {
    const handlers = await loadHandlers();
    const expired = await new jose.SignJWT({ tokenType: SSO_TICKET_TYPE })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-123')
      .setJti('d'.repeat(64))
      .setIssuer('quantmail')
      .setAudience('quant-ecosystem')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(getSsoTicketSecretForTests());
    const r = await exchange(handlers, {
      ticket: expired,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.error.code).toBe('invalid_grant');
    expect(mocks.generateAccessToken).not.toHaveBeenCalled();
  });

  it('accepts client credentials via HTTP Basic auth', async () => {
    const handlers = await loadHandlers();
    const handler = handlers.get('POST /sso/ticket/exchange');
    if (!handler) throw new Error('exchange route not registered');
    const ticket = await mintSsoTicket({
      userId: 'user-123',
      email: 'someone@quantmail.in',
      username: 'someone',
      displayName: 'Someone',
      clientId: CLIENT_ID,
    });
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const r = reply();
    await handler({ body: { ticket }, headers: { authorization: `Basic ${basic}` } }, r);
    expect(r.statusCode).toBe(200);
    expect(r.body.success).toBe(true);
  });
});
