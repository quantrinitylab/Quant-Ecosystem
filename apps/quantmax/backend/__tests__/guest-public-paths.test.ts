import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

describe('quantmax guest public paths (unauthenticated access)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config: AppConfig = {
      ...getConfig(),
      logLevel: 'silent',
      env: 'test',
    };
    app = await buildApp(config);
    (app as any).prisma = {
      shortVideo: {
        findMany: async () => [
          {
            id: 'reel-1',
            userId: 'max-u1',
            videoUrl: 'https://cdn.example/reel1.mp4',
            thumbnailUrl: null,
            caption: 'Public Reel',
            duration: 15,
            soundId: null,
            hashtags: ['viral'],
            viewCount: 100,
            likeCount: 20,
            shareCount: 5,
            commentCount: 2,
            deletedAt: null,
            createdAt: new Date(),
          },
        ],
        findUnique: async ({ where }: any) => {
          if (where.id === 'reel-1') {
            return {
              id: 'reel-1',
              userId: 'max-u1',
              videoUrl: 'https://cdn.example/reel1.mp4',
              thumbnailUrl: null,
              caption: 'Public Reel',
              duration: 15,
              soundId: null,
              hashtags: ['viral'],
              viewCount: 100,
              likeCount: 20,
              shareCount: 5,
              commentCount: 2,
              deletedAt: null,
              createdAt: new Date(),
            };
          }
          return null;
        },
        update: async ({ data }: any) => ({
          id: 'reel-1',
          userId: 'max-u1',
          videoUrl: 'https://cdn.example/reel1.mp4',
          thumbnailUrl: null,
          caption: 'Public Reel',
          duration: 15,
          soundId: null,
          hashtags: ['viral'],
          viewCount: 101,
          likeCount: 20,
          shareCount: 5,
          commentCount: 2,
          deletedAt: null,
          createdAt: new Date(),
          ...data,
        }),
      },
    };
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows guest to access GET /feed/for-you and returns public reels', async () => {
    const res = await app.inject({ method: 'GET', url: '/feed/for-you' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.videos).toBeDefined();
    expect(body.data.videos.length).toBeGreaterThan(0);
    expect(body.data.videos[0].id).toBe('reel-1');
  });

  it('allows guest to access GET /videos and returns public reels', async () => {
    const res = await app.inject({ method: 'GET', url: '/videos' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.videos).toBeDefined();
    expect(body.data.videos.length).toBeGreaterThan(0);
  });

  it('allows guest to access GET /videos/:id without 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/videos/reel-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.video.id).toBe('reel-1');
  });

  it('rejects guest attempting mutating POST /videos with 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/videos',
      payload: { videoUrl: 'https://cdn.example/unauth.mp4' },
    });
    expect(res.statusCode).toBe(401);
  });
});
