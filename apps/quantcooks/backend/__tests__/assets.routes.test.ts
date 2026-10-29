// ============================================================================
// First route-level tests for /assets (P0-3).
//
// Mounts ONLY the assets routes on a bare Fastify instance with the fake
// EditAsset delegate as `fastify.prisma`, a fake (or null) StoragePort as
// `fastify.storagePort`, and a stub auth hook (routes read
// request.auth.userId, normally populated by server-core's auth plugin).
// Covers the 3-step upload flow end to end through the real routes + real
// Prisma-backed AssetService, the auth wall on every caller-scoped
// endpoint, and the restart property via a rebuilt app over the same store.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { isAppError } from '@quant/server-core';
import { ZodError } from 'zod';
import assetsRoutes from '../routes/assets';
import { createFakeEditAssetPrisma, type FakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeStorage, type FakeStorage } from './fake-storage';
import type { StoragePort } from '../services/storage.adapter';

async function buildAssetsApp(
  prisma: FakeEditAssetPrisma,
  storage: StoragePort | null,
  userId: string | null,
) {
  const app = Fastify();
  app.decorate('prisma', prisma);
  app.decorate('storagePort', storage);
  // Mirror server-core's error-handler plugin (registered by createApp in
  // production): bare Fastify would otherwise surface ZodErrors as 500 and
  // drop the AppError code the API contract promises.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', statusCode: 400 },
      });
    }
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message, statusCode: error.statusCode },
      });
    }
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal error',
        statusCode: 500,
      },
    });
  });
  if (userId !== null) {
    app.addHook('onRequest', async (request) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId };
    });
  }
  await app.register(assetsRoutes, { prefix: '/assets' });
  await app.ready();
  return app;
}

describe('assets routes', () => {
  let prisma: FakeEditAssetPrisma;
  let storage: FakeStorage;
  let app: FastifyInstance;

  beforeEach(() => {
    prisma = createFakeEditAssetPrisma();
    storage = createFakeStorage();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('POST /assets registers a metadata row and returns 201', async () => {
    app = await buildAssetsApp(prisma, storage.port, 'user-1');

    const res = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: { projectId: 'project-1', filename: 'clip.mp4', type: 'video', size: 42 },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.filename).toBe('clip.mp4');
    expect(body.data.uploadStatus).toBe('PENDING');
    expect(body.data.url).toBeNull();
  });

  it('POST /assets without auth is rejected 401', async () => {
    app = await buildAssetsApp(prisma, storage.port, null);

    const res = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: { projectId: 'project-1', filename: 'clip.mp4', type: 'video', size: 42 },
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /assets without auth is rejected 401 (the list is not public)', async () => {
    app = await buildAssetsApp(prisma, storage.port, null);

    const res = await app.inject({ method: 'GET', url: '/assets' });

    expect(res.statusCode).toBe(401);
  });

  it('GET /assets returns only the caller’s rows', async () => {
    app = await buildAssetsApp(prisma, storage.port, 'user-1');
    await app.inject({
      method: 'POST',
      url: '/assets',
      payload: { projectId: 'project-1', filename: 'mine.mp4', type: 'video', size: 1 },
    });

    const otherApp = await buildAssetsApp(prisma, storage.port, 'user-2');
    await otherApp.inject({
      method: 'POST',
      url: '/assets',
      payload: { projectId: 'project-2', filename: 'theirs.mp4', type: 'video', size: 1 },
    });
    await otherApp.close();

    const res = await app.inject({ method: 'GET', url: '/assets' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.map((a: { filename: string }) => a.filename)).toEqual(['mine.mp4']);
  });

  it('GET /assets?category= filters by asset type verbatim (P0-2 semantics)', async () => {
    app = await buildAssetsApp(prisma, storage.port, 'user-1');
    for (const [filename, type] of [
      ['song.mp3', 'audio'],
      ['clip.mp4', 'video'],
    ] as const) {
      await app.inject({
        method: 'POST',
        url: '/assets',
        payload: { projectId: 'project-1', filename, type, size: 1 },
      });
    }

    const res = await app.inject({ method: 'GET', url: '/assets?category=music' });

    // P0-2 contract: category maps to the asset `type` verbatim, so the
    // frontend's 'music' tab value matches nothing until it sends 'audio'.
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);

    const audio = await app.inject({ method: 'GET', url: '/assets?category=audio' });
    expect(audio.json().data.map((a: { filename: string }) => a.filename)).toEqual(['song.mp3']);
  });

  it('upload-url → PUT → complete runs the full 3-step flow', async () => {
    app = await buildAssetsApp(prisma, storage.port, 'user-1');

    const urlRes = await app.inject({
      method: 'POST',
      url: '/assets/upload-url',
      payload: {
        projectId: 'project-1',
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        size: 4,
      },
    });

    expect(urlRes.statusCode).toBe(200);
    const { assetId, key, uploadUrl } = urlRes.json().data as {
      assetId: string;
      key: string;
      uploadUrl: string;
    };
    expect(uploadUrl).toContain('fake-storage.test');
    expect(key).toBe(`quantcooks/user-1/project-1/${assetId}/clip.mp4`);

    // The client PUTs bytes directly to storage; the backend never sees them.
    storage.put(key, Buffer.from('abcd'), 'video/mp4');

    const completeRes = await app.inject({
      method: 'POST',
      url: `/assets/${assetId}/complete`,
    });

    expect(completeRes.statusCode).toBe(200);
    const asset = completeRes.json().data;
    expect(asset.uploadStatus).toBe('READY');
    expect(asset.url).toContain('fake-storage.test');
    expect(asset.storageKey).toBe(key);
  });

  it('complete without an uploaded object is 409 UPLOAD_NOT_CONFIRMED', async () => {
    app = await buildAssetsApp(prisma, storage.port, 'user-1');

    const urlRes = await app.inject({
      method: 'POST',
      url: '/assets/upload-url',
      payload: {
        projectId: 'project-1',
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        size: 4,
      },
    });
    const { assetId } = urlRes.json().data as { assetId: string };

    const res = await app.inject({ method: 'POST', url: `/assets/${assetId}/complete` });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('UPLOAD_NOT_CONFIRMED');
  });

  it('upload-url validates the body (missing size → 400)', async () => {
    app = await buildAssetsApp(prisma, storage.port, 'user-1');

    const res = await app.inject({
      method: 'POST',
      url: '/assets/upload-url',
      payload: { projectId: 'project-1', filename: 'clip.mp4', contentType: 'video/mp4' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('upload-url without auth is rejected 401', async () => {
    app = await buildAssetsApp(prisma, storage.port, null);

    const res = await app.inject({
      method: 'POST',
      url: '/assets/upload-url',
      payload: {
        projectId: 'project-1',
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        size: 4,
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('upload-url with storage unconfigured is 503 STORAGE_NOT_CONFIGURED', async () => {
    app = await buildAssetsApp(prisma, null, 'user-1');

    const res = await app.inject({
      method: 'POST',
      url: '/assets/upload-url',
      payload: {
        projectId: 'project-1',
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        size: 4,
      },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('STORAGE_NOT_CONFIGURED');
    expect(prisma.rows).toHaveLength(0);
  });

  it('DELETE /assets/:id removes the caller’s row; another user gets 404', async () => {
    app = await buildAssetsApp(prisma, storage.port, 'user-1');
    const created = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: { projectId: 'project-1', filename: 'clip.mp4', type: 'video', size: 1 },
    });
    const id = created.json().data.id as string;

    const otherApp = await buildAssetsApp(prisma, storage.port, 'user-2');
    const forbidden = await otherApp.inject({ method: 'DELETE', url: `/assets/${id}` });
    expect(forbidden.statusCode).toBe(404);
    await otherApp.close();

    const res = await app.inject({ method: 'DELETE', url: `/assets/${id}` });
    expect(res.statusCode).toBe(200);
    expect(prisma.rows).toHaveLength(0);
  });

  it('an asset created by one app instance is served by a fresh instance (restart)', async () => {
    app = await buildAssetsApp(prisma, storage.port, 'user-1');
    await app.inject({
      method: 'POST',
      url: '/assets',
      payload: { projectId: 'project-1', filename: 'persisted.mp4', type: 'video', size: 1 },
    });
    await app.close();

    app = await buildAssetsApp(prisma, storage.port, 'user-1');
    const res = await app.inject({ method: 'GET', url: '/assets' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((a: { filename: string }) => a.filename)).toEqual([
      'persisted.mp4',
    ]);
  });
});
