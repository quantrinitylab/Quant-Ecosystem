// ============================================================================
// Route-level tests for the layer endpoints (P0-2).
//
// Before P0-2 these paths existed only as Next proxies forwarding to a
// backend with zero layer routes. These tests mount the projects + layers
// routes on a bare Fastify instance over the combined fakes (EditProject +
// EditLayer delegates as `fastify.prisma`) with a stub auth hook, in the
// same idiom as projects.routes.test.ts.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import projectsRoutes from '../routes/projects';
import layersRoutes from '../routes/layers';
import { createFakeEditProjectPrisma } from './fake-edit-project-prisma';
import { createFakeEditLayerPrisma } from './fake-edit-layer-prisma';

type FakePrisma = ReturnType<typeof createFakeEditProjectPrisma> &
  ReturnType<typeof createFakeEditLayerPrisma>;

async function buildApp(prisma: FakePrisma, userId: string | null) {
  const app = Fastify();
  // Mirror the production error mapping (server-core's error handler turns
  // ZodError into a 400); a bare Fastify instance would 500 instead.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR' } });
    }
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.status(statusCode).send({ success: false });
  });
  // Test harness only: the fake implements the narrow delegate surface the
  // service under test uses, not the full generated PrismaClient (all model
  // delegates + $on/$connect/$disconnect/$executeRaw/...). The cast is
  // confined to the Fastify decoration; services still receive the fake
  // through their own narrow-typed constructors/adapters. Precedent:
  // quantchat otp-request / qc-f-118 tests use the same cast.
  app.decorate('prisma', prisma as unknown as PrismaClient);
  if (userId !== null) {
    app.addHook('onRequest', async (request) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId };
    });
  }
  await app.register(projectsRoutes, { prefix: '/projects' });
  await app.register(layersRoutes, { prefix: '/projects' });
  await app.ready();
  return app;
}

describe('layer routes', () => {
  let prisma: FakePrisma;
  let app: FastifyInstance;
  let projectId: string;

  beforeEach(async () => {
    prisma = {
      ...createFakeEditProjectPrisma(),
      ...createFakeEditLayerPrisma(),
    } as FakePrisma;
    app = await buildApp(prisma, 'user-1');
    const created = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Film', type: 'video' },
    });
    projectId = created.json().data.id as string;
  });

  afterEach(async () => {
    await app?.close();
  });

  async function addLayer(name: string, type = 'video') {
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/layers`,
      payload: { name, type, content: { src: `${name}.mp4` } },
    });
    expect(res.statusCode).toBe(201);
    return res.json().data as { id: string; name: string; order: number };
  }

  it('POST creates a layer (201) and GET lists it', async () => {
    const layer = await addLayer('Base');
    expect(layer.name).toBe('Base');

    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/layers` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(layer.id);
    expect(body.data[0].content).toEqual({ src: 'Base.mp4' });
  });

  it('PUT updates a layer and DELETE removes it', async () => {
    const layer = await addLayer('Clip');

    const updated = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/layers/${layer.id}`,
      payload: { opacity: 0.25, locked: true },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.opacity).toBe(0.25);
    expect(updated.json().data.locked).toBe(true);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/projects/${projectId}/layers/${layer.id}`,
    });
    expect(removed.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: `/projects/${projectId}/layers` });
    expect(list.json().data).toHaveLength(0);
  });

  it('PUT /layers/reorder hits the reorder route, not the :layerId route', async () => {
    const a = await addLayer('A');
    const b = await addLayer('B', 'audio');

    const res = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/layers/reorder`,
      payload: { layerIds: [b.id, a.id] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((l: { name: string }) => l.name)).toEqual(['B', 'A']);
  });

  it('POST /layers/:layerId/duplicate creates a (Copy)', async () => {
    const layer = await addLayer('Hero');

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/layers/${layer.id}/duplicate`,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.name).toBe('Hero (Copy)');
    expect(res.json().data.id).not.toBe(layer.id);
  });

  it('rejects an unknown layer type and a strict-schema violation', async () => {
    const badType = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/layers`,
      payload: { name: 'X', type: 'hologram' },
    });
    expect(badType.statusCode).toBe(400);

    const layer = await addLayer('Clip');
    const badUpdate = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/layers/${layer.id}`,
      payload: { bogusField: 1 },
    });
    expect(badUpdate.statusCode).toBe(400);
  });

  it('404s layers of a missing project and requires auth', async () => {
    const missing = await app.inject({ method: 'GET', url: '/projects/nope/layers' });
    expect(missing.statusCode).toBe(404);

    const anon = await buildApp(prisma, null);
    const unauth = await anon.inject({ method: 'GET', url: `/projects/${projectId}/layers` });
    expect(unauth.statusCode).toBe(401);
    await anon.close();
  });
});
