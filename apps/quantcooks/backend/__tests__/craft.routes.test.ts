// ============================================================================
// Route-level tests for /craft (C-2).
//
// Mounts ONLY the craft routes on a bare Fastify instance with composed
// fakes as `fastify.prisma`, a fake StoragePort as `fastify.storagePort`,
// the fake-binary fixture path as `fastify.effectCraftBin` (or null for the
// unconfigured surface), and a stub auth hook — the exports.routes.test.ts
// idiom. Covers the auth wall on every endpoint, the fail-closed
// CRAFT_NOT_CONFIGURED create (503, no row), INVALID_ECPROJ (400, no row),
// the persisted QUEUED row on success, and owner scoping on reads.
// ============================================================================

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { isAppError } from '@quant/server-core';
import { ZodError } from 'zod';
import { chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import craftRoutes from '../routes/craft';
import { createFakeEditCraftRenderPrisma, type FakeEditCraftRenderPrisma } from './fake-edit-craft-render-prisma';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeStorage, type FakeStorage } from './fake-storage';
import type { StoragePort } from '../services/storage.adapter';

const FIXTURE_BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'fake-effectcraft-cli.mjs',
);

const VALID_ECPROJ = {
  schema: 2,
  items: {
    '1': { id: 1, kind: { type: 'Comp', width: 480, height: 270, duration: 2540160000000, layers: [] } },
  },
};

beforeAll(() => {
  chmodSync(FIXTURE_BIN, 0o755);
});

async function buildCraftApp(options: {
  craftPrisma: FakeEditCraftRenderPrisma;
  storage: StoragePort | null;
  bin: string | null;
  userId: string | null;
}) {
  const app = Fastify();
  const assetFake = createFakeEditAssetPrisma();
  app.decorate('prisma', {
    editCraftRenderJob: options.craftPrisma.editCraftRenderJob,
    editAsset: assetFake.editAsset,
  });
  app.decorate('storagePort', options.storage);
  app.decorate('effectCraftBin', options.bin);
  // Mirror server-core's error-handler plugin (see exports.routes.test.ts).
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
  if (options.userId !== null) {
    app.addHook('onRequest', async (request) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: options.userId! };
    });
  }
  await app.register(craftRoutes, { prefix: '/craft' });
  await app.ready();
  return app;
}

describe('craft routes', () => {
  let craftPrisma: FakeEditCraftRenderPrisma;
  let storage: FakeStorage;
  let app: FastifyInstance;

  beforeEach(() => {
    craftPrisma = createFakeEditCraftRenderPrisma();
    storage = createFakeStorage();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('every endpoint answers 401 unauthenticated', async () => {
    app = await buildCraftApp({ craftPrisma, storage: storage.port, bin: FIXTURE_BIN, userId: null });

    const post = await app.inject({
      method: 'POST',
      url: '/craft/effects/render',
      payload: { projectId: 'p1', ecproj: VALID_ECPROJ },
    });
    expect(post.statusCode).toBe(401);

    const get = await app.inject({ method: 'GET', url: '/craft/effects/renders/some-id' });
    expect(get.statusCode).toBe(401);

    const list = await app.inject({ method: 'GET', url: '/craft/effects/renders' });
    expect(list.statusCode).toBe(401);
  });

  it('POST with the companion unconfigured -> 503 CRAFT_NOT_CONFIGURED and no row', async () => {
    app = await buildCraftApp({ craftPrisma, storage: storage.port, bin: null, userId: 'user-1' });

    const res = await app.inject({
      method: 'POST',
      url: '/craft/effects/render',
      payload: { projectId: 'p1', ecproj: VALID_ECPROJ },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('CRAFT_NOT_CONFIGURED');
    expect(res.json().error.message).toContain('effectcraft');
    expect(craftPrisma.rows).toHaveLength(0);
  });

  it('POST happy path -> 201 with a persisted QUEUED job (creditCost 0, metering not_wired)', async () => {
    app = await buildCraftApp({ craftPrisma, storage: storage.port, bin: FIXTURE_BIN, userId: 'user-1' });

    const res = await app.inject({
      method: 'POST',
      url: '/craft/effects/render',
      payload: { projectId: 'p1', ecproj: VALID_ECPROJ, comp: 'Main', format: 'h264' },
    });
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data).toMatchObject({
      projectId: 'p1',
      kind: 'CRAFT_RENDER',
      provider: 'effectcraft',
      comp: 'Main',
      status: 'QUEUED',
      progress: 0,
      creditCost: 0,
      metering: 'not_wired',
      outputAssetId: null,
    });
    expect(craftPrisma.rows).toHaveLength(1);
  });

  it('POST with a malformed .ecproj -> 400 INVALID_ECPROJ and no row', async () => {
    app = await buildCraftApp({ craftPrisma, storage: storage.port, bin: FIXTURE_BIN, userId: 'user-1' });

    const res = await app.inject({
      method: 'POST',
      url: '/craft/effects/render',
      payload: { projectId: 'p1', ecproj: { nope: true } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_ECPROJ');
    expect(craftPrisma.rows).toHaveLength(0);
  });

  it('POST with endSec <= startSec -> 400 VALIDATION_ERROR', async () => {
    app = await buildCraftApp({ craftPrisma, storage: storage.port, bin: FIXTURE_BIN, userId: 'user-1' });

    const res = await app.inject({
      method: 'POST',
      url: '/craft/effects/render',
      payload: { projectId: 'p1', ecproj: VALID_ECPROJ, startSec: 5, endSec: 5 },
    });
    expect(res.statusCode).toBe(400);
    expect(craftPrisma.rows).toHaveLength(0);
  });

  it('GET by id is owner-scoped (404 for another user) and list filters by project', async () => {
    app = await buildCraftApp({ craftPrisma, storage: storage.port, bin: FIXTURE_BIN, userId: 'user-1' });

    const created = await app.inject({
      method: 'POST',
      url: '/craft/effects/render',
      payload: { projectId: 'p1', ecproj: VALID_ECPROJ },
    });
    const id = created.json().data.id as string;

    const own = await app.inject({ method: 'GET', url: `/craft/effects/renders/${id}` });
    expect(own.statusCode).toBe(200);
    expect(own.json().data.id).toBe(id);

    const missing = await app.inject({ method: 'GET', url: '/craft/effects/renders/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('CRAFT_RENDER_NOT_FOUND');

    const listAll = await app.inject({ method: 'GET', url: '/craft/effects/renders' });
    expect(listAll.json().data).toHaveLength(1);
    const listOther = await app.inject({ method: 'GET', url: '/craft/effects/renders?projectId=p2' });
    expect(listOther.json().data).toHaveLength(0);

    // A second app instance as another user over the SAME prisma: 404.
    const otherApp = await buildCraftApp({
      craftPrisma, storage: storage.port, bin: FIXTURE_BIN, userId: 'user-2',
    });
    try {
      const foreign = await otherApp.inject({ method: 'GET', url: `/craft/effects/renders/${id}` });
      expect(foreign.statusCode).toBe(404);
      const foreignList = await otherApp.inject({ method: 'GET', url: '/craft/effects/renders' });
      expect(foreignList.json().data).toHaveLength(0);
    } finally {
      await otherApp.close();
    }
  });

  it('reads keep working when the companion is unconfigured (metadata reads)', async () => {
    // Seed a row through a configured app, then read it through an
    // unconfigured one — CP-1 §8's storage-row principle.
    app = await buildCraftApp({ craftPrisma, storage: storage.port, bin: FIXTURE_BIN, userId: 'user-1' });
    const created = await app.inject({
      method: 'POST',
      url: '/craft/effects/render',
      payload: { projectId: 'p1', ecproj: VALID_ECPROJ },
    });
    const id = created.json().data.id as string;
    await app.close();

    app = await buildCraftApp({ craftPrisma, storage: storage.port, bin: null, userId: 'user-1' });
    const res = await app.inject({ method: 'GET', url: `/craft/effects/renders/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('QUEUED');
  });
});
