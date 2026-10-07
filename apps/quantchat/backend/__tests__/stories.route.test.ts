// ============================================================================
// quantchat — /stories route registration test
//
// The Stories web client proxies /api/stories/feed -> <backend>/stories/feed.
// Before this fix the backend had NO /stories routes at all, so the feed
// proxy got a 404 (and res.json() threw on the non-JSON body), which surfaced
// in the app as "Failed to fetch stories".
//
// These tests prove the routes are registered and fail closed: an
// unauthenticated request must be rejected 401 by the global auth hook from
// createApp() BEFORE any handler (or DB read) runs. Authenticated happy paths
// (real rows) are covered in staging/integration where Postgres is available.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

const testConfig: AppConfig = {
  ...getConfig(),
  port: 3002,
  host: '0.0.0.0',
  logLevel: 'silent',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /stories/feed', () => {
  it('rejects an unauthenticated request 401 (route registered, fail closed)', async () => {
    const res = await app.inject({ method: 'GET', url: '/stories/feed' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('rejects a garbage Bearer <redacted> 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/stories/feed',
      headers: { authorization: 'Bearer <redacted>' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('stories write endpoints', () => {
  it('POST /stories rejects unauthenticated 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /stories/:storyId rejects unauthenticated 401', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/stories/abc123' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /stories/:storyId/view rejects unauthenticated 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/stories/abc123/view', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('GET /stories/:storyId/viewers rejects unauthenticated 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/stories/abc123/viewers' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /stories/:storyId/reply rejects unauthenticated 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/stories/abc123/reply',
      payload: { message: 'nice!' },
    });
    expect(res.statusCode).toBe(401);
  });
});
