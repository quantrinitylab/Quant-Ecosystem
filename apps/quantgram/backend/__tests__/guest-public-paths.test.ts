import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

describe('quantneon guest public paths (unauthenticated access)', () => {
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
            id: 'p1',
            userId: 'u1',
            content: 'Explore Post',
            visibility: 'PUBLIC',
            type: 'IMAGE',
            createdAt: new Date(),
            user: { username: 'creator', avatarUrl: null },
          },
        ],
        count: async () => 1,
        findUnique: async ({ where }: any) => {
          if (where.id === 'p1') {
            return {
              id: 'p1',
              userId: 'u1',
              content: 'Explore Post',
              visibility: 'PUBLIC',
              type: 'IMAGE',
              createdAt: new Date(),
              user: { username: 'creator', avatarUrl: null },
              comments: [],
            };
          }
          return null;
        },
      },
      story: {
        findMany: async () => [
          {
            id: 's1',
            userId: 'u1',
            audience: 'ALL',
            expiresAt: new Date(Date.now() + 86400000),
            createdAt: new Date(),
          },
        ],
      },
      user: {
        findMany: async () => [{ id: 'u1', username: 'creator', avatarUrl: null }],
      },
      userRelationship: {
        findMany: async () => [],
      },
      like: {
        findMany: async () => [],
      },
      savedPost: {
        findMany: async () => [],
      },
      closeFriend: {
        findMany: async () => [],
      },
    };
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows guest to access GET /posts/feed and returns explore discovery items', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/feed' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.posts).toBeDefined();
    expect(body.data.posts.length).toBeGreaterThan(0);
  });

  it('allows guest to access GET /explore', async () => {
    const res = await app.inject({ method: 'GET', url: '/explore' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('allows guest to access GET /stories/feed', async () => {
    const res = await app.inject({ method: 'GET', url: '/stories/feed' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  it('allows guest to query GET /posts/:id without 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/posts/p1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.post.id).toBe('p1');
  });

  it('rejects guest attempting mutating POST /posts with 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { caption: 'Unauthorized Post' },
    });
    expect(res.statusCode).toBe(401);
  });
});
