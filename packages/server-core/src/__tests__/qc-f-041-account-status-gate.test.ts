import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as jose from 'jose';
import { createApp } from '../app';
import type { AppConfig, AccountStatusVerdict } from '../types';

/**
 * QC-F-041 — account-status gate regression tests (server-core auth plugin).
 *
 * JWT verification is stateless: before this fix, a user who deleted their
 * account (DELETE /settings/account only stamps `deletedAt`) kept a fully
 * working access token until expiry — and, via QC-F-030 kind confusion, a
 * 30-day refresh token as well. The gate is an OPT-IN resolver the app
 * supplies via AppConfig.accountStatus; after the JWT verifies, the plugin
 * asks it for the account's CURRENT status:
 *   'deleted'    -> 401 ACCOUNT_DELETED
 *   'suspended'  -> 401 ACCOUNT_SUSPENDED
 *   lookup fails -> 503 UPSTREAM_UNAVAILABLE (fail-closed, never waved through)
 *   'ok'         -> request proceeds (deny-list: PENDING_VERIFICATION phone
 *                   users resolve 'ok' app-side and must never be locked out)
 * optionalAuth never errors: a non-'ok' verdict just withholds the identity.
 * With no resolver configured, behaviour is exactly the legacy stateless
 * behaviour (pinned by the last describe block) so the other apps on
 * createApp are untouched until they opt in.
 */

const verdicts = new Map<string, AccountStatusVerdict | 'throw'>([
  ['user-ok', 'ok'],
  ['user-deleted', 'deleted'],
  ['user-suspended', 'suspended'],
  ['user-down', 'throw'],
]);

const stubResolver = async (userId: string): Promise<AccountStatusVerdict> => {
  const verdict = verdicts.get(userId) ?? 'ok';
  if (verdict === 'throw') throw new Error('database unreachable');
  return verdict;
};

const baseConfig: AppConfig = {
  port: 3002,
  host: '0.0.0.0',
  logLevel: 'silent',
  corsOrigins: ['http://localhost:3000'],
  rateLimitMax: 100,
  rateLimitWindow: '1 minute',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
  publicPaths: ['/qc041-public'],
};

const gatedConfig: AppConfig = { ...baseConfig, accountStatus: stubResolver };

const signToken = async (subject: string, claims: Record<string, unknown> = {}) => {
  const secret = new TextEncoder().encode(baseConfig.jwtSecret);
  return new jose.SignJWT({
    email: 'gate@example.com',
    username: 'gateuser',
    role: 'user',
    scopes: [],
    app: 'quantchat',
    ...claims,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer(baseConfig.jwtIssuer)
    .setAudience(baseConfig.jwtAudience)
    .setJti(`gate-${Math.random().toString(36).slice(2)}`)
    .setSubject(subject)
    .sign(secret);
};

describe('QC-F-041 account-status gate (server-core auth plugin)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp(gatedConfig);

    app.get('/qc041-protected', { preHandler: app.requireAuth() }, async (request) => {
      return { ok: true, userId: request.auth.userId };
    });

    // Public path: the global hook runs optionalAuth; the handler reports
    // whether an identity was populated.
    app.get('/qc041-public', async (request) => {
      return { userId: request.auth?.userId ?? null };
    });

    // Step-up delegates to requireAuth first, so the gate must fire there
    // too — a deleted account gets ACCOUNT_DELETED, never STEP_UP_REQUIRED.
    app.get('/qc041-stepup', { preHandler: app.requireStepUp() }, async () => ({ ok: true }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a deleted account on a protected route (Bearer) with 401 ACCOUNT_DELETED', async () => {
    const token = await signToken('user-deleted', { kind: 'access' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc041-protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ACCOUNT_DELETED');
    expect(body.error.statusCode).toBe(401);
  });

  it('rejects a deleted account on a protected route (cookie transport)', async () => {
    const token = await signToken('user-deleted', { kind: 'access' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc041-protected',
      headers: { cookie: `quant_access_token=${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('ACCOUNT_DELETED');
  });

  it('rejects a suspended account with 401 ACCOUNT_SUSPENDED (distinct from deleted)', async () => {
    const token = await signToken('user-suspended', { kind: 'access' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc041-protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('fails closed with 503 UPSTREAM_UNAVAILABLE when the status lookup throws', async () => {
    const token = await signToken('user-down', { kind: 'access' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc041-protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('admits an ok account on a protected route', async () => {
    const token = await signToken('user-ok', { kind: 'access' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc041-protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBe('user-ok');
  });

  it('admits a kind-less ecosystem token when the verdict is ok (gate is not a kind gate)', async () => {
    const token = await signToken('user-ok');
    const response = await app.inject({
      method: 'GET',
      url: '/qc041-protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
  });

  it('withholds the identity on a public path for a deleted account (optionalAuth never errors)', async () => {
    const token = await signToken('user-deleted', { kind: 'access' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc041-public',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBeNull();
  });

  it('withholds the identity on a public path when the lookup fails (no 503 from optionalAuth)', async () => {
    const token = await signToken('user-down', { kind: 'access' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc041-public',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBeNull();
  });

  it('populates the identity on a public path for an ok account', async () => {
    const token = await signToken('user-ok', { kind: 'access' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc041-public',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBe('user-ok');
  });

  it('applies the gate on step-up routes (deleted -> ACCOUNT_DELETED, not STEP_UP_REQUIRED)', async () => {
    const token = await signToken('user-deleted', { kind: 'access' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc041-stepup',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('ACCOUNT_DELETED');
  });

  it('a refresh-kind token from a deleted account is 401 either way (brief case 3 loose pin)', async () => {
    const token = await signToken('user-deleted', { kind: 'refresh' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc041-protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().success).toBe(false);
  });
});

describe('QC-F-041 gate is opt-in (no resolver -> legacy stateless behaviour)', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp({ ...baseConfig, port: 3003 });
    app.get('/qc041-protected', { preHandler: app.requireAuth() }, async (request) => {
      return { ok: true, userId: request.auth.userId };
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('without a resolver even a would-be-deleted user passes, exactly as before the fix', async () => {
    const token = await signToken('user-deleted', { kind: 'access' });
    const response = await app.inject({
      method: 'GET',
      url: '/qc041-protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBe('user-deleted');
  });
});
