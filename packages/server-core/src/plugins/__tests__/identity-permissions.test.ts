import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import * as jose from 'jose';
import { PermissionEngine, RBACEngine } from '@quant/identity-permissions';
import { OrgService } from '@quant/teams';

import { createApp } from '../../app';
import type { AppConfig } from '../../types';
import identityPermissionsPlugin from '../identity-permissions';
import teamsPlugin from '../teams';
import authPlugin from '../auth';
import { ScopeEvaluator } from '../../permissions/scope-evaluator';

const testConfig: AppConfig = {
  port: 3000,
  host: '0.0.0.0',
  logLevel: 'silent',
  corsOrigins: ['http://localhost:3000'],
  rateLimitMax: 1000,
  rateLimitWindow: '1 minute',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

const secret = new TextEncoder().encode(testConfig.jwtSecret);

async function signToken(scopes: string[], jti: string): Promise<string> {
  return new jose.SignJWT({
    email: 'test@example.com',
    username: 'testuser',
    role: 'user',
    scopes,
    app: 'quantmail',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer(testConfig.jwtIssuer)
    .setAudience(testConfig.jwtAudience)
    .setJti(jti)
    .setSubject('user-123')
    .sign(secret);
}

// ---------------------------------------------------------------------------
// ScopeEvaluator — RBAC subsumption unit tests (backed by identity-permissions)
// ---------------------------------------------------------------------------
describe('ScopeEvaluator (RBAC-backed scope evaluation)', () => {
  const evaluator = new ScopeEvaluator(new PermissionEngine(), new RBACEngine());

  it('exposes the identity-permissions substrate it is backed by', () => {
    expect(evaluator.engine).toBeInstanceOf(PermissionEngine);
    expect(evaluator.rbac).toBeInstanceOf(RBACEngine);
  });

  it('accepts an exact scope match (preserves prior semantics)', () => {
    expect(evaluator.satisfies(['messages:write'], ['messages:write'])).toBe(true);
  });

  it('rejects when a required scope is absent', () => {
    expect(evaluator.satisfies(['profile:read'], ['messages:write'])).toBe(false);
  });

  it('rejects when granted set is empty but a scope is required', () => {
    expect(evaluator.satisfies([], ['messages:read'])).toBe(false);
  });

  it('treats an empty required set as satisfied', () => {
    expect(evaluator.satisfies(['profile:read'], [])).toBe(true);
  });

  it('honours a super-user wildcard grant', () => {
    expect(evaluator.satisfies(['*'], ['messages:write', 'wallet:write'])).toBe(true);
    expect(evaluator.satisfies(['admin'], ['anything:here'])).toBe(true);
  });

  it('honours a resource wildcard grant (messages:*)', () => {
    expect(evaluator.satisfies(['messages:*'], ['messages:read', 'messages:write'])).toBe(true);
  });

  it('honours a bare-resource grant (profile ⊇ profile:read)', () => {
    expect(evaluator.satisfies(['profile'], ['profile:read'])).toBe(true);
  });

  it('applies action subsumption (write ⊇ read on same resource)', () => {
    expect(evaluator.satisfies(['messages:write'], ['messages:read'])).toBe(true);
    // ...but read does NOT subsume write
    expect(evaluator.satisfies(['messages:read'], ['messages:write'])).toBe(false);
  });

  it('requires ALL required scopes to be satisfied', () => {
    expect(evaluator.satisfies(['messages:write'], ['messages:write', 'wallet:read'])).toBe(false);
    expect(
      evaluator.satisfies(['messages:write', 'wallet:read'], ['messages:write', 'wallet:read']),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Plugin decoration unit tests
// ---------------------------------------------------------------------------
describe('identity-permissions + teams plugin decorations', () => {
  it('identity-permissions decorates `permissions` + `evaluateScopes`', async () => {
    const app = Fastify({ logger: false });
    await app.register(authPlugin, {
      jwtSecret: testConfig.jwtSecret,
      jwtIssuer: testConfig.jwtIssuer,
      jwtAudience: testConfig.jwtAudience,
    });
    await app.register(identityPermissionsPlugin);
    await app.ready();

    expect(app.hasDecorator('permissions')).toBe(true);
    expect(app.permissions.engine).toBeInstanceOf(PermissionEngine);
    expect(app.permissions.rbac).toBeInstanceOf(RBACEngine);
    expect(app.permissions.scopes).toBeInstanceOf(ScopeEvaluator);
    expect(app.hasDecorator('evaluateScopes')).toBe(true);
    expect(app.evaluateScopes(['messages:write'], ['messages:read'])).toBe(true);
    expect(app.evaluateScopes(['profile:read'], ['messages:write'])).toBe(false);

    await app.close();
  });

  it('teams decorates `teams` with usable org context', async () => {
    const app = Fastify({ logger: false });
    await app.register(authPlugin, {
      jwtSecret: testConfig.jwtSecret,
      jwtIssuer: testConfig.jwtIssuer,
      jwtAudience: testConfig.jwtAudience,
    });
    await app.register(identityPermissionsPlugin);
    await app.register(teamsPlugin);
    await app.ready();

    expect(app.hasDecorator('teams')).toBe(true);
    expect(app.teams.orgs).toBeInstanceOf(OrgService);
    const org = await app.teams.orgs.create('Acme', 'acme.test', 'business');
    expect(await app.teams.orgs.get(org.id)).toMatchObject({ domain: 'acme.test' });

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Seam test (DoD-2 / Requirement 5.6 / Property P7) — Fastify inject against a
// real `createApp()` instance: unauthenticated → 401, valid-JWT-missing-scope →
// 403, valid-JWT-with-scope → 2xx.
// ---------------------------------------------------------------------------
describe('requireAuth({ scopes }) seam — backed by identity-permissions', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp(testConfig);
    // A scoped route exercising the RBAC-backed scope evaluation.
    app.get(
      '/messages',
      { preHandler: app.requireAuth({ scopes: ['messages:write'] }) },
      async (request) => ({ success: true, data: { userId: request.auth.userId } }),
    );
    // A route requiring messages:read — satisfied by a messages:write grant via
    // RBAC subsumption.
    app.get(
      '/messages-read',
      { preHandler: app.requireAuth({ scopes: ['messages:read'] }) },
      async () => ({ success: true, data: { ok: true } }),
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes the identity-permissions substrate on the createApp() instance', () => {
    expect(app.hasDecorator('permissions')).toBe(true);
    expect(app.hasDecorator('evaluateScopes')).toBe(true);
    expect(app.hasDecorator('teams')).toBe(true);
  });

  it('unauthenticated request → 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'GET', url: '/messages' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking the required scope → 403 FORBIDDEN', async () => {
    const token = await signToken(['profile:read'], 'seam-missing-scope');
    const res = await app.inject({
      method: 'GET',
      url: '/messages',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with the required scope → 2xx', async () => {
    const token = await signToken(['messages:write'], 'seam-with-scope');
    const res = await app.inject({
      method: 'GET',
      url: '/messages',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { userId: 'user-123' } });
  });

  it('valid JWT whose higher scope subsumes the required one → 2xx (RBAC subsumption)', async () => {
    const token = await signToken(['messages:write'], 'seam-subsumption');
    const res = await app.inject({
      method: 'GET',
      url: '/messages-read',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
