// ============================================================================
// quantai — POST /auth/sso/exchange route test
//
// The old QuantAI SSO ingested handoff tokens client-side into localStorage,
// but no endpoint ever minted a real session from them — so /auth/me 401'd,
// the auth provider fail-closed, and the user bounced back to /login forever.
//
// POST /auth/sso/exchange is the server-side half of the fix. It accepts
// EITHER { ssoToken } (a QuantMail-issued token, verified back-channel against
// QuantMail's /oauth/userinfo) or { ssoTicket } (a Contract-B single-use
// chooser ticket, verified via POST /oauth/sso-ticket/verify), and mints
// QuantAI-native HS256 tokens accepted by every protected route.
//
// These tests prove the route is PUBLIC (no QuantAI auth needed — the global
// hook is bypassed via publicPaths), fails closed on bad input / rejected
// credentials, and mints verifiable tokens on the happy path.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import authRoutes from '../routes/auth';
import { verifyHs256 } from '../lib/session-tokens';

const JWT_SECRET = 'test-secret-key-that-is-long-enough-for-hs256';
const JWT_ISSUER = 'quantai';
const JWT_AUDIENCE = 'quant-ecosystem';

describe('POST /auth/sso/exchange', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env['JWT_SECRET'] = JWT_SECRET;
    process.env['JWT_ISSUER'] = JWT_ISSUER;
    process.env['JWT_AUDIENCE'] = JWT_AUDIENCE;
    app = Fastify();
    await app.register(authRoutes, { prefix: '/auth' });
    await app.ready();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  it('rejects an empty body with 400 (ssoToken or ssoTicket required)', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/sso/exchange', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } });
  });

  it('rejects a too-short ssoTicket with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoTicket: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('verifies a ssoToken against QuantMail userinfo and mints QuantAI tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: 'qm-1', email: 'User@QuantMail.in', username: 'qmuser', displayName: 'QM User' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoToken: 'quantmail-issued-access-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      success: boolean;
      data: {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        tokenType: string;
        user: { id: string; email: string; username: string };
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.tokenType).toBe('Bearer');
    expect(body.data.user.email).toBe('user@quantmail.in'); // normalized

    // The minted access token is a real HS256 JWT our own verifier accepts.
    const check = verifyHs256(body.data.accessToken, {
      jwtSecret: JWT_SECRET,
      jwtIssuer: JWT_ISSUER,
      jwtAudience: JWT_AUDIENCE,
    });
    expect(check.valid).toBe(true);
    expect(check.payload?.['sub']).toBe('sso:qm-1');
    expect(check.payload?.['email']).toBe('user@quantmail.in');

    // The token went to userinfo with a Bearer <redacted>, never trusted on claims.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/oauth/userinfo');
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer quantmail-issued-access-token',
    );
  });

  it('redeems a ssoTicket via the ticket-verify endpoint and mints tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: 'qm-9', email: 'tick@quantmail.in', username: 'tickuser' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoTicket: 'single-use-ticket-abc' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; data: { accessToken: string } };
    expect(body.success).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/oauth/sso-ticket/verify');
    expect(url).not.toContain('/userinfo');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ ticket: 'single-use-ticket-abc' });
  });

  it('returns 401 INVALID_SSO_TICKET when QuantMail rejects the ticket', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: false, data: null }),
      }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoTicket: 'rejected-ticket' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'INVALID_SSO_TICKET' } });
  });

  it('returns 401 INVALID_SSO_TOKEN when QuantMail rejects the token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoToken: 'forged-token-value' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'INVALID_SSO_TOKEN' } });
  });

  it('returns 502 when QuantMail is unreachable (fail closed, no forged identity)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/exchange',
      payload: { ssoTicket: 'unreachable-ticket' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'SSO_VERIFY_UNAVAILABLE' } });
  });
});
