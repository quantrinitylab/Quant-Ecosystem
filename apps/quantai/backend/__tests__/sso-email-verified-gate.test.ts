import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// WR-578 gate (claim quantai-sso-email-verified-gate): only identities whose
// email the identity root verified (strict boolean `true`) may mint a QuantAI
// SSO session. Well-formed but unverified identities fail closed with the
// distinct 401 SSO_EMAIL_UNVERIFIED — never a session, never a retryable
// "temporarily unreachable" label.
import Fastify from 'fastify';
import ssoTicketRoutes from '../routes/sso-ticket';

const ENV_KEYS = [
  'QUANT_SSO_CLIENT_ID',
  'QUANT_SSO_CLIENT_SECRET',
  'JWT_SECRET',
  'QUANT_IDENTITY_URL',
  'QUANTMAIL_BACKEND_URL',
  'QUANT_SSO_RESOLVE_TIMEOUT_MS',
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

function identityWith(userOverrides: Record<string, unknown>, clientId = 'quantai') {
  return {
    user: { id: 'user-123', email: 'user@quantmail.in', ...userOverrides },
    clientId,
  };
}

const VERIFIED_IDENTITY = identityWith({
  email_verified: true,
  username: 'testuser',
  displayName: 'Test User',
});

describe('POST /auth/sso/ticket — email_verified gate (WR-578)', () => {
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

  it('mints a session for a strictly verified identity (email_verified: true)', async () => {
    const fetchMock = mockResolve(200, VERIFIED_IDENTITY);
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
    expect(body.data.sessionToken).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an unverified identity with 401 SSO_EMAIL_UNVERIFIED and mints nothing', async () => {
    const fetchMock = mockResolve(200, identityWith({ email_verified: false }));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string; message: string }; data?: unknown };
    expect(body.error.code).toBe('SSO_EMAIL_UNVERIFIED');
    expect(body.error.message).toMatch(/not verified on your Quant Account/);
    expect(body.data).toBeUndefined();
    // Exactly one resolve attempt: no blind retry of a rejected identity.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing email_verified flag (absent is not verified)', async () => {
    mockResolve(200, identityWith({}));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });

    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('SSO_EMAIL_UNVERIFIED');
  });

  it('rejects the string "true" (strict boolean only — truthy-string bypass)', async () => {
    mockResolve(200, identityWith({ email_verified: 'true' }));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });

    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('SSO_EMAIL_UNVERIFIED');
  });

  it('rejects other truthy non-boolean values', async () => {
    const app = await buildApp();
    for (const value of [1, 'yes', {}]) {
      mockResolve(200, identityWith({ email_verified: value }));
      const res = await app.inject({
        method: 'POST',
        url: '/auth/sso/ticket',
        payload: { ticket: 'opaque-ticket-abc' },
      });
      expect(res.statusCode).toBe(401);
      expect((res.json() as { error: { code: string } }).error.code).toBe(
        'SSO_EMAIL_UNVERIFIED',
      );
    }
  });

  it('fires the gate before the client-binding check', async () => {
    // Unverified AND minted for another client: the gate's distinct code wins,
    // because an unverified identity must never reach any further processing.
    mockResolve(200, identityWith({ email_verified: false }, 'quantchat'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso/ticket',
      payload: { ticket: 'opaque-ticket-abc' },
    });

    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('SSO_EMAIL_UNVERIFIED');
  });
});
