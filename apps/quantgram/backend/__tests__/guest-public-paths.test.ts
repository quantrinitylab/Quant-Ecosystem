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
        findUnique: async ({ where }: any) => {
          if (where.id === 'u1') {
            return {
              id: 'u1',
              username: 'creator',
              displayName: 'Creator',
              bio: 'Public bio',
              avatarUrl: null,
              website: null,
              emailVerified: false,
              deletedAt: null,
            };
          }
          return null;
        },
      },
      userRelationship: {
        findMany: async () => [],
        count: async () => 0,
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
      // healthPlugin's /readyz probes the DB with SELECT 1; the mock answers.
      $queryRawUnsafe: async () => [{ '?column?': 1 }],
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

  it('serves GET /health without auth (k8s probes + Docker HEALTHCHECK + /api/health ingress contract)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
  });

  it('serves GET /readyz without auth (k8s readinessProbe contract)', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
  });

  it('allows guest to read a public profile at GET /profiles/:id', async () => {
    const res = await app.inject({ method: 'GET', url: '/profiles/u1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.profile.username).toBe('creator');
    expect(body.data.profile.bio).toBe('Public bio');
  });

  it('returns an honest 404 (not 401, not a hang) for a missing profile as guest', async () => {
    const res = await app.inject({ method: 'GET', url: '/profiles/does-not-exist' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('PROFILE_NOT_FOUND');
  });
});
