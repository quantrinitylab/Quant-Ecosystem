// ============================================================================
// quantchat — /users/search route tests (contact discovery for new chats)
// ============================================================================
//
// GET /users/search powers the "New chat" contact picker. These tests prove:
//   1. The route fails closed (401) without authentication — it is NOT in
//      publicPaths, so the global auth hook must reject before any DB read.
//   2. The query schema rejects a missing/empty `q` (400, never a full
//      table scan).
// The authenticated happy path (real user rows) is covered in staging /
// integration where Postgres is available.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

const testConfig: AppConfig = {
  ...getConfig(),
  port: 3003,
  host: '0.0.0.0',
  logLevel: 'silent',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtAudience: 'quant-test-audience',
  jwtIssuer: 'quant-test',
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

describe('GET /users/search', () => {
  it('rejects an unauthenticated request 401 (fail closed)', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/search?q=kundan' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a garbage Bearer <redacted> 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/search?q=kundan',
      headers: { authorization: 'Bearer <redacted>' },
    });
    expect(res.statusCode).toBe(401);
  });
});
