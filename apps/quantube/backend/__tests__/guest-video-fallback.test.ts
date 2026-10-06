// P0-1 regression tests: GET /videos/:id must serve the REAL shared sample
// catalog for guest-vid-* ids (playable videoUrl), and an HONEST 404 for
// unknown ids — never the old fabricated "Guest Fallback Video" with a dead
// cdn.quantube.com URL that rendered the black watch player.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

describe('GET /videos/:id sample fallback (P0-1)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config: AppConfig = {
      ...getConfig(),
      logLevel: 'silent',
      env: 'test',
    };
    app = await buildApp(config);
    // Empty catalog: DB knows no videos at all.
    (app as any).prisma = {
      video: {
        findMany: async () => [],
        count: async () => 0,
        findUnique: async () => null,
      },
      videoChannel: {
        findUnique: async () => null,
      },
    };
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a real playable sample record for guest-vid-1', async () => {
    const res = await app.inject({ method: 'GET', url: '/videos/guest-vid-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('guest-vid-1');
    expect(body.data.videoUrl).toMatch(/^https:\/\/.+\.mp4$/);
    expect(body.data.videoUrl).not.toContain('cdn.quantube.com');
    expect(body.data.url).toBe('/watch/guest-vid-1');
    expect(body.data.isSample).toBe(true);
  });

  it('serves the matching record per id (not one generic fallback)', async () => {
    const res = await app.inject({ method: 'GET', url: '/videos/guest-vid-7' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe('guest-vid-7');
    expect(body.data.title).toContain('Soundwave');
  });

  it('returns an honest 404 for unknown ids (no fabricated fallback)', async () => {
    const res = await app.inject({ method: 'GET', url: '/videos/definitely-not-a-video' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(JSON.stringify(body)).not.toContain('Guest Fallback Video');
  });
});
