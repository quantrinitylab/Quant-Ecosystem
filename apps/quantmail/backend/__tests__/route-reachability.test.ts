// @vitest-environment node
// ============================================================================
// Phase Q: Route-Reachability Invariant Suite (Task Q07, R02, R03)
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('ioredis', () => {
  const EventEmitter = require('events');
  class MockRedis extends EventEmitter {
    status = 'ready';
    on = vi.fn().mockReturnThis();
    once = vi.fn().mockReturnThis();
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue('OK');
    del = vi.fn().mockResolvedValue(1);
    quit = vi.fn().mockResolvedValue('OK');
    disconnect = vi.fn();
  }
  return { default: MockRedis, Redis: MockRedis };
});

import { buildApp } from '../app';

describe('Phase Q: Route Reachability & Proxy Invariant Suite (Task Q07)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const protectedEndpoints = [
    // Auth & Identity
    { method: 'GET', url: '/auth/session' },
    { method: 'GET', url: '/auth/2fa/status' },
    // Mail
    { method: 'GET', url: '/emails' },
    { method: 'POST', url: '/emails' },
    { method: 'GET', url: '/mail-filters' },
    // Calendar
    { method: 'GET', url: '/calendars' },
    { method: 'GET', url: '/events' },
    { method: 'GET', url: '/events/today' },
    { method: 'GET', url: '/events/free-busy?start=2026-09-01T00:00:00Z&end=2026-09-02T00:00:00Z' },
    // Drive
    { method: 'GET', url: '/drive/files' },
    { method: 'GET', url: '/drive/trash' },
    { method: 'GET', url: '/drive/shares/received' },
    // Contacts
    { method: 'GET', url: '/contacts' },
    { method: 'GET', url: '/contact-groups' },
    // CodeHub / Repos
    { method: 'GET', url: '/repos' },
    // Documents
    { method: 'GET', url: '/documents' },
    // Retention Policies & Legal Holds (Task X07)
    { method: 'GET', url: '/retention/policies' },
    { method: 'GET', url: '/retention/legal-holds' },
    // Audit Logs (Task X06)
    { method: 'GET', url: '/audit-logs' },
  ];

  for (const ep of protectedEndpoints) {
    it(`unauthenticated ${ep.method} ${ep.url} fails closed with 401 UNAUTHORIZED`, async () => {
      const res = await app.inject({
        method: ep.method as any,
        url: ep.url,
      });

      expect(res.statusCode).toBe(401);
      const json = res.json();
      expect(json.success).toBe(false);
      expect(json.error?.code || json.code).toMatch(/UNAUTHORIZED|AUTH_REQUIRED|UNAUTHENTICATED/i);
    });
  }

  it('public health check endpoint returns 200 OK without authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.status).toBe('ok');
  });

  it('public detailed health check endpoint returns 200 OK with SLO metrics without authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health/detailed',
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.status).toBe('healthy');
    expect(typeof json.uptime).toBe('number');
    expect(json.memory).toBeDefined();
    expect(typeof json.memory.heapUsedBytes).toBe('number');
    expect(json.services.postgres).toBe('connected');
    expect(json.services.redis).toBe('connected');
  });

  it('public drive share endpoint does not reject anonymous caller with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/drive/public/share/dummy-nonexistent-token',
    });

    // Proves that anonymous caller is NOT blocked with 401 by auth hook
    expect(res.statusCode).not.toBe(401);
  });

  describe('B3 Proxy Route Matcher & QuantCode Reachability Invariants', () => {
    it('unblocks QuantCode module routes through matchRoute', async () => {
      const { matchRoute } = await import('../lib/routes-config');

      const codeTree = matchRoute('code/git/repos/owner/repo/tree/main', 'GET');
      expect(codeTree.matched).toBe(true);
      expect(codeTree.allowedMethods).toContain('GET');

      const apiCodeCommits = matchRoute('api/code/git/repos/owner/repo/commits', 'GET');
      expect(apiCodeCommits.matched).toBe(true);
      expect(apiCodeCommits.allowedMethods).toContain('GET');

      const aiV1 = matchRoute('api/v1/ai/models', 'GET');
      expect(aiV1.matched).toBe(true);
      expect(aiV1.allowedMethods).toContain('GET');

      const sigDefault = matchRoute('email-signatures/sig-123/default', 'POST');
      expect(sigDefault.matched).toBe(true);
      expect(sigDefault.allowedMethods).toContain('POST');

      const folderPatch = matchRoute('folders/fld-1', 'PATCH');
      expect(folderPatch.matched).toBe(true);
      expect(folderPatch.allowedMethods).toContain('PATCH');
    });

    it('QuantCode routes are registered on Fastify under both /api/code and /code (not 404)', async () => {
      const resCode = await app.inject({
        method: 'GET',
        url: '/code/git/repos',
      });
      // Should hit auth gate (401), not 404
      expect(resCode.statusCode).toBe(401);

      const resApiCode = await app.inject({
        method: 'GET',
        url: '/api/code/git/repos',
      });
      expect(resApiCode.statusCode).toBe(401);
    });
  });
});
