import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

describe('quantsync guest public paths (unauthenticated access)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config: AppConfig = {
      ...getConfig(),
      logLevel: 'silent',
      env: 'test',
    };
    app = await buildApp(config);
    (app as any).prisma = {
      post: {
        findMany: async () => [
          {
            id: 'sync-p1',
            content: 'Public Sync Post',
            visibility: 'PUBLIC',
            createdAt: new Date(),
            user: { id: 'u1', username: 'syncuser', displayName: 'Sync User', avatarUrl: null },
            _count: { likes: 5, comments: 2 },
          },
        ],
        findUnique: async ({ where }: any) => {
          if (where.id === 'sync-p1') {
            return {
              id: 'sync-p1',
              content: 'Public Sync Post',
              visibility: 'PUBLIC',
              createdAt: new Date(),
              user: { id: 'u1', username: 'syncuser', displayName: 'Sync User', avatarUrl: null },
              _count: { likes: 5, comments: 2 },
            };
          }
          return null;
        },
      },
    };
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows guest to access GET /feed and returns public posts', async () => {
    const res = await app.inject({ method: 'GET', url: '/feed' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].id).toBe('sync-p1');
  });

  it('allows guest to access GET /explore', async () => {
    const res = await app.inject({ method: 'GET', url: '/explore' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it('allows guest to access GET /trending', async () => {
    const res = await app.inject({ method: 'GET', url: '/trending' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it('allows guest to query GET /posts/:id without 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/sync-p1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('sync-p1');
  });

  it('rejects guest attempting mutating POST /posts with 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { content: 'Unauthorized Sync Post' },
    });
    expect(res.statusCode).toBe(401);
  });
});
