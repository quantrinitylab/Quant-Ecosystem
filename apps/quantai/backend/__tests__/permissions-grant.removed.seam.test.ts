// @vitest-environment node
// ============================================================================
// QuantAI — grant-theater removal seam tests (F-115).
//
// POST /permissions/grant used to let any authenticated user write grants into
// an in-memory store that NO production code path ever consulted
// (packages/agentic/src/permissions/agent-permissions.ts). The grant system
// was theater: it looked like a permission system but enforced nothing, and
// GET /permissions/my-permissions only echoed the dead store back.
//
// Root-cause fix: the routes, the store module, and the package export are
// DELETED. These tests pin the honest behavior on the real buildApp():
//   - POST /permissions/grant (valid JWT, valid body)      -> 404 (route gone)
//   - POST /permissions/grant (valid JWT, malformed body)  -> 404 (no validator)
//   - POST /permissions/grant (no JWT)                      -> 404 (no auth gate)
//   - GET  /permissions/my-permissions (valid JWT)          -> 404 (route gone)
//   - GET  /quanty/permissions (valid JWT)                 -> 200 (the REAL
//     per-tool allow/ask/deny system is untouched by this removal)
// JWTs are HS256-signed with the test AppConfig, following the established
// seam pattern in agent-surfaces.seam.test.ts.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '@quant/server-core';
import { buildApp } from '../app';

const testConfig: AppConfig = {
  port: 3004,
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

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

let jtiCounter = 0;
function signToken(scopes: string[]): string {
  jtiCounter += 1;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: testConfig.jwtIssuer,
      aud: testConfig.jwtAudience,
      sub: 'user-123',
      jti: `seam-${jtiCounter}`,
      iat: now,
      exp: now + 3600,
      email: 'agent@example.com',
      username: 'agentuser',
      role: 'user',
      scopes,
      app: 'quantai',
    }),
  );
  const signature = base64url(
    createHmac('sha256', testConfig.jwtSecret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
});

afterAll(async () => {
  await app?.close?.();
});

describe('F-115: grant theater removed — /permissions/* no longer exists', () => {
  it('POST /permissions/grant with a valid JWT and valid body -> 404', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'POST',
      url: '/permissions/grant',
      headers: { authorization: `Bearer ${token}` },
      payload: { agentId: 'agent-1', resource: 'files', actions: ['read', 'write'] },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /permissions/grant with a valid JWT but malformed body -> 404 (no validator exists)', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'POST',
      url: '/permissions/grant',
      headers: { authorization: `Bearer ${token}` },
      payload: { nonsense: true, actions: 'not-an-array' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /permissions/grant with an empty body -> 404', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'POST',
      url: '/permissions/grant',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /permissions/grant unauthenticated -> 401 (global auth gate still guards unknown routes)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/permissions/grant',
      payload: { agentId: 'agent-1', resource: 'files', actions: ['read'] },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('GET /permissions/my-permissions with a valid JWT -> 404', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url: '/permissions/my-permissions',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('@quant/agentic no longer exports the dead permission store', async () => {
    // Import the worktree's own package source (not the workspace-resolved
    // copy) so the pin covers this checkout's index.ts.
    const agenticSrc = await import(
      '../../../../packages/agentic/src/index.js' as string
    );
    expect(agenticSrc).not.toHaveProperty('permissionManager');
    expect(agenticSrc).not.toHaveProperty('PermissionManager');
  });

  it('regression: the real per-tool permission system is untouched (GET /quanty/permissions -> 200)', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url: '/quanty/permissions',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
