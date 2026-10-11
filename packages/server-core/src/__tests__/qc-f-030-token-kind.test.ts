import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as jose from 'jose';
import { createApp } from '../app';
import type { AppConfig } from '../types';

/**
 * QC-F-030 — JWT `kind` confusion regression tests.
 *
 * QuantChat's SessionTokenIssuer signs access (1h) and refresh (30d) tokens
 * with the SAME secret/issuer/audience; the payloads differ only in `kind`
 * and `exp`. Before this fix, neither requireAuth nor optionalAuth ever
 * looked at `kind`, so a refresh token authenticated as an access token on
 * every protected route (Bearer AND cookie) and populated optional-auth
 * identities on public paths.
 *
 * Phase-1 policy (specialist brief): deny-non-access — a token whose `kind`
 * is present and is not 'access' is rejected; a token with NO `kind` claim
 * (the ecosystem's live kind-less access tokens from @quant/auth
 * TokenService / SDK / test minters) is still accepted. These tests pin
 * both halves.
 */
const testConfig: AppConfig = {
  port: 3001,
  host: '0.0.0.0',
  logLevel: 'silent',
  corsOrigins: ['http://localhost:3000'],
  rateLimitMax: 100,
  rateLimitWindow: '1 minute',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
  publicPaths: ['/qc030-public'],
};

const signToken = async (claims: Record<string, unknown> = {}) => {
  const secret = new TextEncoder().encode(testConfig.jwtSecret);
  return new jose.SignJWT({
    email: 'kind@example.com',
    username: 'kinduser',
    role: 'user',
    scopes: [],
    app: 'quantchat',
    ...claims,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer(testConfig.jwtIssuer)
    .setAudience(testConfig.jwtAudience)
    .setJti(`kind-${Math.random().toString(36).slice(2)}`)
    .setSubject('user-kind')
    .sign(secret);
};

describe('QC-F-030 token-kind gate (server-core auth plugin)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp(testConfig);

    // Non-public path: the global onRequest hook runs requireAuth, and the
    // route also guards explicitly — either layer must reject a refresh.
    app.get('/qc030-protected', { preHandler: app.requireAuth() }, async (request) => {
      return { ok: true, userId: request.auth.userId };
    });

    // Public path: the global hook runs optionalAuth; the handler reports
    // whether an identity was populated.
    app.get('/qc030-public', async (request) => {
      return { userId: request.auth?.userId ?? null };
    });

    // Step-up route: requireStepUp delegates to requireAuth first, so a
    // refresh token must fail as UNAUTHORIZED, never reach the step-up
    // freshness evaluation.
    app.get('/qc030-stepup', { preHandler: app.requireStepUp() }, async () => ({ ok: true }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a refresh-kind token on a protected route (Bearer)', async () => {
    const token = await signToken({ kind: 'refresh' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc030-protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.statusCode).toBe(401);
  });

  it('rejects a refresh-kind token on a protected route (cookie transport)', async () => {
    const token = await signToken({ kind: 'refresh' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc030-protected',
      headers: { cookie: `quant_access_token=${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('rejects any other non-access kind (fail-closed, not refresh-only)', async () => {
    const token = await signToken({ kind: 'service' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc030-protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('accepts an access-kind token on a protected route', async () => {
    const token = await signToken({ kind: 'access' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc030-protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBe('user-kind');
  });

  it('accepts a kind-less token on a protected route (phase-1 pin: ecosystem access tokens carry no kind)', async () => {
    const token = await signToken();
    const response = await app.inject({
      method: 'GET',
      url: '/qc030-protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBe('user-kind');
  });

  it('optionalAuth does NOT populate an identity from a refresh-kind token', async () => {
    const token = await signToken({ kind: 'refresh' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc030-public',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBeNull();
  });

  it('optionalAuth DOES populate an identity from an access-kind token', async () => {
    const token = await signToken({ kind: 'access' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc030-public',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBe('user-kind');
  });

  it('optionalAuth DOES populate an identity from a kind-less token (phase-1 pin)', async () => {
    const token = await signToken();
    const response = await app.inject({
      method: 'GET',
      url: '/qc030-public',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBe('user-kind');
  });

  it('requireStepUp rejects a refresh-kind token as UNAUTHORIZED (inherited gate, not STEP_UP_REQUIRED)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken({ kind: 'refresh', lastStrongAuthAt: now });
    const response = await app.inject({
      method: 'GET',
      url: '/qc030-stepup',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });
});
