import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// POST /auth/sso/ticket — QuantAI side of the QuantMail opaque-ticket SSO
// handoff. The backend resolves the ticket server-to-server with the identity
// root (client credentials from env, fail-closed) and mints a QuantAI SSO
// session token for the verified identity.
import Fastify from 'fastify';
import { createHmac } from 'node:crypto';
import ssoTicketRoutes from '../routes/sso-ticket';
import { mintSsoSessionToken, verifySsoSessionToken } from '../services/sso-session';

const ENV_KEYS = [
  'QUANT_SSO_CLIENT_ID',
  'QUANT_SSO_CLIENT_SECRET',
  'JWT_SECRET',
  'QUANT_IDENTITY_URL',
  'QUANTMAIL_BACKEND_URL',
] as const;

const savedEnv: Record<string, string | undefined> = {};

function setEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

function clearSsoEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

function mockResolve(status: number, body: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(ssoTicketRoutes, { prefix: '/auth' });
  await app.ready();
  return app;
}

const VALID_IDENTITY = {
  user: {
    id: 'user-123',
    email: 'user@quantmail.in',
    username: 'testuser',
    displayName: 'Test User',
  },
  clientId: 'quantai',
};

describe('POST /auth/sso/ticket', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    clearSsoEnv();
    setEnv({
      QUANT_SSO_CLIENT_ID: 'quantai',
      QUANT_SSO_CLIENT_SECRET: 'test-secret',
      JWT_SECRET: 'test-jwt-secret-for-sso-sessions',
    });
  });

  afterEach(() => {
    clearSsoEnv();
    for (const k of ENV_KEYS) {
      if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k] as string;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves the ticket server-side and mints a QuantAI SSO session', async () => {
    const fetchMock = mockResolve(200, VALID_IDENTITY);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      success: boolean;
      data: { user: { id: string; email: string }; sessionToken: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.user.id).toBe('user-123');
    expect(body.data.user.email).toBe('user@quantmail.in');

    // The ticket + client credentials went to the identity's resolve endpoint
    // server-to-server — the browser never sees this call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/sso/ticket/resolve');
    expect((init.headers as Record<string, string>)['authorization']).toBe(
      `Basic ${Buffer.from('quantai:test-secret').toString('base64')}`,
    );
    expect(JSON.parse(init.body as string).ticket).toBe('opaque-ticket-abc');

    // The minted session token verifies as a QuantAI SSO session: iss=quantai
    // (so it is accepted ONLY by the QuantAI backend), 1h TTL, typed.
    const claims = verifySsoSessionToken(
      body.data.sessionToken,
      'test-jwt-secret-for-sso-sessions',
    );
    expect(claims).not.toBeNull();
    expect(claims?.userId).toBe('user-123');
    expect(claims?.email).toBe('user@quantmail.in');
    expect(claims?.tokenType).toBe('quantai-sso-session');
    expect(claims?.iss).toBe('quantai');
    expect(claims?.aud).toBe('quant-ecosystem');
    expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBe(3600);
  });

  it('rejects a missing or malformed ticket with 400', async () => {
    const app = await buildApp();
    for (const payload of [{}, { ticket: '' }, { ticket: 123 }, { ticket: null }]) {
      const res = await app.inject({ method: 'POST', url: '/auth/sso/ticket', payload });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: { code: string } }).error.code).toBe('SSO_TICKET_MISSING');
    }
  });

  it('fails closed with 500 when the OAuth client credentials are unset', async () => {
    delete process.env['QUANT_SSO_CLIENT_ID'];
    delete process.env['QUANT_SSO_CLIENT_SECRET'];
    const fetchMock = mockResolve(200, VALID_IDENTITY);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });
    expect(res.statusCode).toBe(500);
    expect((res.json() as { error: { code: string } }).error.code).toBe('SSO_CLIENT_MISCONFIGURED');
    // No outbound call without credentials — nothing leaks.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed with 500 when JWT_SECRET is unset', async () => {
    delete process.env['JWT_SECRET'];
    mockResolve(200, VALID_IDENTITY);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });
    expect(res.statusCode).toBe(500);
  });

  it('maps an expired/used ticket (400 invalid_grant) to 401 SSO_TICKET_INVALID', async () => {
    mockResolve(400, { error: 'invalid_grant', error_description: 'Ticket expired, invalid, or already used' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'used-ticket' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('SSO_TICKET_INVALID');
    expect(body.error.message).toMatch(/expired or was already used/);
  });

  it('maps a ticket minted for another client (403) to 401', async () => {
    mockResolve(403, { error: 'invalid_grant' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'other-client-ticket' },
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('SSO_TICKET_INVALID');
  });

  it('maps identity 401 (unknown client / bad secret) to 500 SSO_CLIENT_MISCONFIGURED', async () => {
    mockResolve(401, { error: 'invalid_client' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });
    expect(res.statusCode).toBe(500);
    expect((res.json() as { error: { code: string } }).error.code).toBe('SSO_CLIENT_MISCONFIGURED');
  });

  it('maps identity 5xx to 502 SSO_IDENTITY_UNAVAILABLE', async () => {
    mockResolve(503, { error: 'temporarily_unavailable' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });
    expect(res.statusCode).toBe(502);
    expect((res.json() as { error: { code: string } }).error.code).toBe('SSO_IDENTITY_UNAVAILABLE');
  });

  it('maps network failure / timeout to 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('fetch failed');
      }),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });
    expect(res.statusCode).toBe(502);
    expect((res.json() as { error: { code: string } }).error.code).toBe('SSO_IDENTITY_UNAVAILABLE');
  });

  it('refuses to mint a session when the identity has no email (F-023 precedent)', async () => {
    mockResolve(200, { user: { id: 'user-123', email: '' }, clientId: 'quantai' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('SSO_IDENTITY_INVALID');
  });

  it('refuses to mint a session when the identity has no id', async () => {
    mockResolve(200, { user: { email: 'user@quantmail.in' }, clientId: 'quantai' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('refuses when the resolve response names a different client (defence in depth)', async () => {
    mockResolve(200, { user: VALID_IDENTITY.user, clientId: 'quantchat' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('SSO_TICKET_INVALID');
  });
});

describe('sso-session token primitives', () => {
  const secret = 'unit-test-secret';

  it('mint/verify round-trips and carries the SSO identity', () => {
    const token = mintSsoSessionToken(
      { userId: 'u1', email: 'a@b.c', username: 'u', displayName: 'U' },
      secret,
    );
    expect(token.split('.')).toHaveLength(3);
    const claims = verifySsoSessionToken(token, secret);
    expect(claims?.userId).toBe('u1');
    expect(claims?.email).toBe('a@b.c');
  });

  it('rejects tampered signatures', () => {
    const token = mintSsoSessionToken({ userId: 'u1', email: 'a@b.c' }, secret);
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    expect(verifySsoSessionToken(tampered, secret)).toBeNull();
  });

  it('rejects the wrong secret', () => {
    const token = mintSsoSessionToken({ userId: 'u1', email: 'a@b.c' }, secret);
    expect(verifySsoSessionToken(token, 'wrong-secret')).toBeNull();
  });

  it('rejects tokens not typed as quantai-sso-session (type-confusion guard)', () => {
    // A hand-built JWT with a different tokenType must not verify.
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        tokenType: 'access',
        sub: 'u1',
        email: 'a@b.c',
        iss: 'quantai',
        aud: 'quant-ecosystem',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: 'x',
      }),
    ).toString('base64url');
    const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    expect(verifySsoSessionToken(`${header}.${payload}.${sig}`, secret)).toBeNull();
  });

  it('rejects malformed and empty tokens without throwing', () => {
    for (const bad of ['', 'abc', 'a.b', 'a.b.c.d', 'not-a-jwt']) {
      expect(verifySsoSessionToken(bad, secret)).toBeNull();
    }
  });

  it('mint throws fail-closed on missing identity or secret', () => {
    expect(() => mintSsoSessionToken({ userId: '', email: 'a@b.c' }, secret)).toThrow();
    expect(() => mintSsoSessionToken({ userId: 'u1', email: 'a@b.c' }, '')).toThrow();
  });
});
