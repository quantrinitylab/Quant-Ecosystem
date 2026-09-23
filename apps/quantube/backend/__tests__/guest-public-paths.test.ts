import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

describe('quantube guest public paths (unauthenticated access)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config: AppConfig = {
      ...getConfig(),
      logLevel: 'silent',
      env: 'test',
    };
    app = await buildApp(config);
    (app as any).prisma = {
      video: {
        findMany: async () => [{ id: 'v1', title: 'Public Video', visibility: 'PUBLIC' }],
        count: async () => 1,
        findUnique: async ({ where }: any) => {
          if (where.id === 'v1')
            return { id: 'v1', title: 'Public Video', visibility: 'PUBLIC', deletedAt: null };
          return null;
        },
      },
      videoChannel: {
        findUnique: async ({ where }: any) => {
          if (where.id === 'c1') return { id: 'c1', name: 'Public Channel' };
          return null;
        },
      },
    };
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows guest to access GET /videos', async () => {
    const res = await app.inject({ method: 'GET', url: '/videos' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('allows guest to access GET /videos/trending', async () => {
    const res = await app.inject({ method: 'GET', url: '/videos/trending' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('allows guest to access GET /search', async () => {
    const res = await app.inject({ method: 'GET', url: '/search?q=music' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('allows guest to access GET /feed/trending', async () => {
    const res = await app.inject({ method: 'GET', url: '/feed/trending' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('allows guest to query GET /videos/:id without 401 (returns 404 for missing id)', async () => {
    const res = await app.inject({ method: 'GET', url: '/videos/non-existent-video-id' });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).toBe(404);
  });

  it('allows guest to query GET /channels/:id without 401 (returns 404 for missing id)', async () => {
    const res = await app.inject({ method: 'GET', url: '/channels/non-existent-channel-id' });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).toBe(404);
  });

  it('rejects guest attempting mutating POST /videos with 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/videos',
      payload: { title: 'Unauthorized Video' },
    });
    expect(res.statusCode).toBe(401);
  });
});
