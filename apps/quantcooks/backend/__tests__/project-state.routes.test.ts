// ============================================================================
// Route-level tests for GET/PUT /projects/:id/state (P0-5).
//
// Mounts ONLY the projects routes on a bare Fastify instance with the
// composed fake (EditProject + EditLayer) as `fastify.prisma` and a stub
// auth hook, following projects.routes.test.ts. The error handler mirrors
// server-core's real error-handler plugin (registered by createApp in
// production), including its `details` passthrough — VERSION_CONFLICT's
// currentVersion rides there — and its FST_ERR_CTP_BODY_TOO_LARGE → 413
// PAYLOAD_TOO_LARGE branch.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { isAppError } from '@quant/server-core';
import { ZodError } from 'zod';
import projectsRoutes from '../routes/projects';
import { createFakeProjectStatePrisma, type FakeProjectStatePrisma } from './fake-project-state-prisma';

async function buildProjectsApp(prisma: FakeProjectStatePrisma, userId: string | null) {
  const app = Fastify();
  // Test harness only: the fake implements the narrow delegate surface the
  // service under test uses, not the full generated PrismaClient (all model
  // delegates + $on/$connect/$disconnect/$executeRaw/...). The cast is
  // confined to the Fastify decoration; services still receive the fake
  // through their own narrow-typed constructors/adapters. Precedent:
  // quantchat otp-request / qc-f-118 tests use the same cast.
  app.decorate('prisma', prisma as unknown as PrismaClient);
  // Mirror server-core's error-handler plugin.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', statusCode: 400 },
      });
    }
    if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send({
        success: false,
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large for this endpoint.', statusCode: 413 },
      });
    }
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
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
  await app.register(projectsRoutes, { prefix: '/projects' });
  await app.ready();
  return app;
}

const DOC = {
  schemaVersion: 1,
  tracks: [
    {
      id: 'track-1',
      name: 'Video 1',
      type: 'video',
      locked: false,
      visible: true,
      height: 60,
      clips: [
        {
          id: 'clip-a',
          trackId: 'track-1',
          name: 'Intro',
          startTime: 0,
          duration: 5,
          trimStart: 0,
          trimEnd: 0,
          type: 'video',
          thumbnail: '',
          volume: 1,
          opacity: 1,
          filters: { brightness: 0, contrast: 0, saturation: 0, blur: 0, hue: 0 },
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          assetId: 'asset-1',
        },
      ],
    },
  ],
  duration: 120,
  aspectRatio: '16:9',
};

describe('project state routes (P0-5)', () => {
  let prisma: FakeProjectStatePrisma;
  let app: FastifyInstance;
  let projectId: string;

  beforeEach(async () => {
    prisma = createFakeProjectStatePrisma();
    app = await buildProjectsApp(prisma, 'user-1');
    const created = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Stateful', type: 'video' },
    });
    projectId = created.json().data.id as string;
  });

  afterEach(async () => {
    await app?.close();
  });

  it('PUT → GET through the app returns the saved document (route-level round trip)', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/state`,
      payload: { version: 1, timeline: DOC },
    });
    expect(put.statusCode).toBe(200);
    const putBody = put.json();
    expect(putBody.success).toBe(true);
    expect(putBody.data.version).toBe(2);
    expect(putBody.data.timeline).toEqual(DOC);
    expect(putBody.data.width).toBe(1920);

    const get = await app.inject({ method: 'GET', url: `/projects/${projectId}/state` });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.timeline).toEqual(DOC);
    expect(get.json().data.version).toBe(2);
  });

  it('GET state of a fresh project returns the synthesised empty document', async () => {
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/state` });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.timeline).toEqual({
      schemaVersion: 1,
      tracks: [],
      duration: 120,
      aspectRatio: '16:9',
    });
    expect(data.version).toBe(1);
  });

  it('stale PUT is 409 VERSION_CONFLICT with currentVersion in the error body', async () => {
    await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/state`,
      payload: { version: 1, timeline: DOC },
    });
    const res = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/state`,
      payload: { version: 1, timeline: DOC },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VERSION_CONFLICT');
    expect(body.error.details.currentVersion).toBe(2);
  });

  it('PUT without auth is 401; GET without auth is 401', async () => {
    const anon = await buildProjectsApp(prisma, null);
    const put = await anon.inject({
      method: 'PUT',
      url: `/projects/${projectId}/state`,
      payload: { version: 1, timeline: DOC },
    });
    expect(put.statusCode).toBe(401);
    const get = await anon.inject({ method: 'GET', url: `/projects/${projectId}/state` });
    expect(get.statusCode).toBe(401);
    await anon.close();
  });

  it('PUT by a non-owner is 403 NOT_PROJECT_OWNER', async () => {
    const other = await buildProjectsApp(prisma, 'user-2');
    const res = await other.inject({
      method: 'PUT',
      url: `/projects/${projectId}/state`,
      payload: { version: 1, timeline: DOC },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_PROJECT_OWNER');
    await other.close();
  });

  it('GET state of a missing project is 404 PROJECT_NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: '/projects/missing/state' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('bodies failing the schema are 400 (missing version, schemaVersion 2, bad aspect)', async () => {
    const missingVersion = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/state`,
      payload: { timeline: DOC },
    });
    expect(missingVersion.statusCode).toBe(400);

    const badSchema = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/state`,
      payload: { version: 1, timeline: { ...DOC, schemaVersion: 2 } },
    });
    expect(badSchema.statusCode).toBe(400);

    const badAspect = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/state`,
      payload: { version: 1, timeline: { ...DOC, aspectRatio: '21:9' } },
    });
    expect(badAspect.statusCode).toBe(400);

    const tooManyTracks = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/state`,
      payload: {
        version: 1,
        timeline: { ...DOC, tracks: Array.from({ length: 201 }, () => ({})) },
      },
    });
    expect(tooManyTracks.statusCode).toBe(400);
  });

  it('an oversized body is 413 PAYLOAD_TOO_LARGE', async () => {
    const fatClip = { ...DOC.tracks[0]!.clips[0], name: 'x'.repeat(2 * 1024 * 1024) };
    const res = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/state`,
      payload: {
        version: 1,
        timeline: { ...DOC, tracks: [{ ...DOC.tracks[0], clips: [fatClip] }] },
      },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('a state saved by one app instance is served by a fresh instance (restart)', async () => {
    await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/state`,
      payload: { version: 1, timeline: DOC },
    });
    await app.close();

    app = await buildProjectsApp(prisma, 'user-1');
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/state` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.timeline).toEqual(DOC);
  });
});
