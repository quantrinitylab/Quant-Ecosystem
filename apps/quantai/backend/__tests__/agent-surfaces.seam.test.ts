// @vitest-environment node
// ============================================================================
// quantai — agent-surface seam tests (Task 10.4 / DoD-2 & DoD-4)
// ============================================================================
//
// Traverses the real integration seam for the six quantai agent surfaces wired
// in Tasks 10.1/10.2 (agent-runtime, agent-swarm, quant-tools, browser-agent,
// code-agent, user-owned-ai) using Fastify `inject()` against the app's real
// `buildApp()`. No network, no mocked server-core — the global auth hook and the
// decorated engines are exercised exactly as in production.
//
// For each scoped surface we assert the three states the design's Testing
// Strategy calls for (DoD-2 / Requirement 5.2 & 5.6 / Property P7):
//   - unauthenticated (no Bearer)            -> 401 UNAUTHORIZED
//   - valid JWT WITHOUT the required scope    -> 403 FORBIDDEN
//   - valid JWT WITH the required scope        -> 2xx and the engine is reached
//
// `user-owned-ai` declares no extra scope (read-only catalog), so it only
// asserts 401 (unauth) and 2xx (authed) — there is no insufficient-scope case.
//
// JWTs are HS256-signed (the same algorithm the auth plugin verifies, matching
// the seam pattern in server-core's identity-permissions.test.ts) using Node's
// built-in `crypto` so the test adds no new dependency to this app. The signed
// claims match the test AppConfig's jwtSecret/issuer/audience (env:'test').

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '@quant/server-core';
import { buildApp } from '../app';

// This harness exercises the REAL production app: it imports quantai's
// `buildApp()` from `../app` and boots it with a test AppConfig. `buildApp()`
// constructs and decorates the six agent engines (agent-runtime, agent-swarm,
// quant-tools, browser-agent, code-agent, user-owned-ai) and registers every
// route at its production prefix, so the seam traversed below
// (global auth hook -> agent route -> decorated engine) is byte-for-byte the
// production wiring — no replicated `createApp()` substrate.
//
// (Previously this file avoided importing `buildApp()` and replicated the agent
// wiring on `createApp()`, because buildApp's import graph could not resolve
// several source-only/undeclared `@quant/*` engine packages. Those packages are
// now promoted/declared and the workspace is re-linked, so the real `buildApp()`
// boots and the work-around is no longer needed.)

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
// Hand-roll an HS256 JWT (header.payload.signature) the auth plugin's
// `jose.jwtVerify(token, secret, { issuer, audience })` accepts.
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

// ---------------------------------------------------------------------------
// Scoped agent surfaces (require `agents:execute`). Each row drives the full
// unauth/insufficient-scope/authed matrix against the real wired route.
// ---------------------------------------------------------------------------
interface ScopedSurface {
  name: string;
  method: 'POST';
  url: string;
  body: Record<string, unknown>;
  okStatus: number;
}

const scopedSurfaces: ScopedSurface[] = [
  {
    name: 'agent-swarm POST /agents/swarm/goals',
    method: 'POST',
    url: '/agents/swarm/goals',
    body: {
      description: 'Plan a launch',
      budget: { maxTimeMs: 5000, maxTokens: 100, maxCostCents: 50 },
    },
    okStatus: 201,
  },
  {
    name: 'quant-tools POST /tools/orchestrator/execute',
    method: 'POST',
    url: '/tools/orchestrator/execute',
    body: { input: 'summarize my unread email', dryRun: true },
    okStatus: 201,
  },
  {
    name: 'browser-agent POST /agents/browser/sessions',
    method: 'POST',
    url: '/agents/browser/sessions',
    body: { siteUrl: 'https://example.com' },
    okStatus: 201,
  },
  {
    name: 'code-agent POST /agents/code/analyze',
    method: 'POST',
    url: '/agents/code/analyze',
    body: { paths: ['src/index.ts', 'package.json'] },
    okStatus: 200,
  },
];

describe.each(scopedSurfaces)('seam: $name', (surface) => {
  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: surface.method,
      url: surface.url,
      payload: surface.body,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `agents:execute` -> 403 FORBIDDEN', async () => {
    const token = await signToken(['profile:read']);
    const res = await app.inject({
      method: surface.method,
      url: surface.url,
      headers: { authorization: `Bearer ${token}` },
      payload: surface.body,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `agents:execute` -> 2xx and reaches the engine', async () => {
    const token = await signToken(['agents:execute']);
    const res = await app.inject({
      method: surface.method,
      url: surface.url,
      headers: { authorization: `Bearer ${token}` },
      payload: surface.body,
    });
    expect(res.statusCode).toBe(surface.okStatus);
    // Engine reached: the route returns the standard success envelope only after
    // the decorated engine has produced a result.
    expect(res.json()).toMatchObject({ success: true });
    expect(res.json()).toHaveProperty('data');
  });
});

// ---------------------------------------------------------------------------
// agent-runtime POST /agents/runtime/tasks — scoped surface whose happy path
// drives the engine's external AI-inference boundary (TaskDecomposer -> @quant/ai
// infer, which requires a provider key) and worker dispatch. Per the design's
// Testing Strategy we spy ONLY that external I/O boundary (the engine's
// `executeTask`) so the auth + route + decorator seam stays real; the assertion
// that the spy was invoked proves the route actually reached the decorated
// `fastify.agentRuntime` engine.
// ---------------------------------------------------------------------------
describe('seam: agent-runtime POST /agents/runtime/tasks', () => {
  const url = '/agents/runtime/tasks';
  const body = { task: 'Organize my inbox' };

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload: body });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `agents:execute` -> 403 FORBIDDEN', async () => {
    const token = await signToken(['profile:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `agents:execute` -> 201 and reaches the engine', async () => {
    const cannedTask = {
      id: 'task-seam-1',
      description: body.task,
      status: 'completed' as const,
      subtasks: [],
      startedAt: Date.now(),
      completedAt: Date.now(),
    };
    const spy = vi.spyOn(app.agentRuntime, 'executeTask').mockResolvedValue(cannedTask);

    try {
      const token = await signToken(['agents:execute']);
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${token}` },
        payload: body,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ success: true, data: { id: 'task-seam-1' } });
      // The decorated engine was actually reached through the seam.
      expect(spy).toHaveBeenCalledWith(body.task);
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// user-owned-ai GET /agents/owned/models — read-only catalog, no extra scope.
// Only unauth (401) and authed (2xx) apply; there is no insufficient-scope case.
// ---------------------------------------------------------------------------
describe('seam: user-owned-ai GET /agents/owned/models (no extra scope)', () => {
  const url = '/agents/owned/models';

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT (no extra scope) -> 200 and reaches the engine', async () => {
    const token = await signToken([]);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { models: expect.any(Array) } });
  });
});
