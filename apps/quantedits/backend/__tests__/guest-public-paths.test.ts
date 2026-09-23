import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

describe('quantedits guest public paths (unauthenticated access)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config: AppConfig = {
      ...getConfig(),
      logLevel: 'silent',
      env: 'test',
    };
    app = await buildApp(config);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows guest to access GET /templates and returns public templates', async () => {
    const res = await app.inject({ method: 'GET', url: '/templates' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.templates).toBeDefined();
  });

  it('allows guest to access GET /effects and returns public effects', async () => {
    const res = await app.inject({ method: 'GET', url: '/effects' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.effects).toBeDefined();
  });

  it('allows guest to access GET /effects/categories', async () => {
    const res = await app.inject({ method: 'GET', url: '/effects/categories' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.categories).toBeDefined();
  });

  it('allows guest to access GET /assets/project/:projectId', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/project/test-proj-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('rejects guest attempting mutating POST /export with 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/export',
      payload: { projectId: 'test-proj-1' },
    });
    expect(res.statusCode).toBe(401);
  });
});
