// ============================================================================
// First route-level tests for /export (P0-4).
//
// Mounts ONLY the exports routes on a bare Fastify instance with the fake
// EditExportJob delegate as `fastify.prisma`, a fake (or null) StoragePort
// as `fastify.storagePort`, and a stub auth hook (routes read
// request.auth.userId, normally populated by server-core's auth plugin).
// Covers the auth wall on every endpoint, owner scoping, the persisted
// QUEUED row, cancel semantics, and the download contract: 302 to a fresh
// signed URL for COMPLETED jobs, a precise 404 EXPORT_NOT_READY for every
// non-completed state, 404 EXPORT_NOT_FOUND for other users' jobs.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { isAppError } from '@quant/server-core';
import { ZodError } from 'zod';
import exportsRoutes from '../routes/exports';
import { ExportService } from '../services/export.service';
import { createFakeEditExportPrisma, type FakeEditExportPrisma } from './fake-edit-export-prisma';
import { createFakeStorage, FAKE_STORAGE_HOST, type FakeStorage } from './fake-storage';
import type { StoragePort } from '../services/storage.adapter';

async function buildExportsApp(
  prisma: FakeEditExportPrisma,
  storage: StoragePort | null,
  userId: string | null,
) {
  const app = Fastify();
  // Test harness only: the fake implements the narrow delegate surface the
  // service under test uses, not the full generated PrismaClient (all model
  // delegates + $on/$connect/$disconnect/$executeRaw/...). The cast is
  // confined to the Fastify decoration; services still receive the fake
  // through their own narrow-typed constructors/adapters. Precedent:
  // quantchat otp-request / qc-f-118 tests use the same cast.
  app.decorate('prisma', prisma as unknown as PrismaClient);
  app.decorate('storagePort', storage);
  // Mirror server-core's error-handler plugin (see assets.routes.test.ts).
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
  await app.register(exportsRoutes, { prefix: '/export' });
  await app.ready();
  return app;
}

const QUEUE_BODY = { projectId: 'project-1', format: 'mp4', resolution: '1080p', quality: 'high' };

describe('exports routes', () => {
  let prisma: FakeEditExportPrisma;
  let storage: FakeStorage;
  let app: FastifyInstance;

  beforeEach(() => {
    prisma = createFakeEditExportPrisma();
    storage = createFakeStorage();
  });

  afterEach(async () => {
    await app?.close();
  });

  async function queueViaRoute(): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/export', payload: QUEUE_BODY });
    expect(res.statusCode).toBe(201);
    return res.json().data.id as string;
  }

  /** Drive a job to COMPLETED through the real service over the same store. */
  async function completeJob(jobId: string): Promise<string> {
    const service = new ExportService(prisma as never, storage.port);
    await service.claimJob(jobId);
    const key = `quantcooks/user-1/project-1/exports/${jobId}.mp4`;
    await service.completeJob(jobId, key);
    return key;
  }

  it('POST /export without auth is rejected 401', async () => {
    app = await buildExportsApp(prisma, storage.port, null);

    const res = await app.inject({ method: 'POST', url: '/export', payload: QUEUE_BODY });

    expect(res.statusCode).toBe(401);
    expect(prisma.rows).toHaveLength(0);
  });

  it('POST /export with auth persists a QUEUED row owned by the caller and returns 201', async () => {
    app = await buildExportsApp(prisma, storage.port, 'user-1');

    const res = await app.inject({ method: 'POST', url: '/export', payload: QUEUE_BODY });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('QUEUED');
    expect(body.data.progress).toBe(0);
    expect(body.data.outputUrl).toBeNull();
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0]?.userId).toBe('user-1');
    expect(prisma.rows[0]?.status).toBe('QUEUED');
  });

  it('POST /export with an invalid format is rejected 400', async () => {
    app = await buildExportsApp(prisma, storage.port, 'user-1');

    const res = await app.inject({
      method: 'POST',
      url: '/export',
      payload: { ...QUEUE_BODY, format: 'avi' },
    });

    expect(res.statusCode).toBe(400);
    expect(prisma.rows).toHaveLength(0);
  });

  it('GET /export/:id returns the owner’s job; another user gets 404', async () => {
    app = await buildExportsApp(prisma, storage.port, 'user-1');
    const jobId = await queueViaRoute();

    const own = await app.inject({ method: 'GET', url: `/export/${jobId}` });
    expect(own.statusCode).toBe(200);
    expect(own.json().data.id).toBe(jobId);

    const otherApp = await buildExportsApp(prisma, storage.port, 'user-2');
    const other = await otherApp.inject({ method: 'GET', url: `/export/${jobId}` });
    expect(other.statusCode).toBe(404);
    expect(other.json().error.code).toBe('EXPORT_NOT_FOUND');
    await otherApp.close();
  });

  it('GET /export/project/:projectId lists only the caller’s jobs', async () => {
    app = await buildExportsApp(prisma, storage.port, 'user-1');
    await queueViaRoute();

    const otherApp = await buildExportsApp(prisma, storage.port, 'user-2');
    await otherApp.inject({ method: 'POST', url: '/export', payload: QUEUE_BODY });
    await otherApp.close();

    const res = await app.inject({ method: 'GET', url: '/export/project/project-1' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it('POST /export/:id/cancel cancels a QUEUED job; a PROCESSING job cannot be cancelled', async () => {
    app = await buildExportsApp(prisma, storage.port, 'user-1');
    const jobId = await queueViaRoute();

    const cancelled = await app.inject({ method: 'POST', url: `/export/${jobId}/cancel` });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().data.status).toBe('FAILED');

    const secondId = await queueViaRoute();
    const service = new ExportService(prisma as never, storage.port);
    await service.claimJob(secondId);
    const res = await app.inject({ method: 'POST', url: `/export/${secondId}/cancel` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('CANNOT_CANCEL_EXPORT');
  });

  it('GET /export/:id/download on a QUEUED job is 404 EXPORT_NOT_READY', async () => {
    app = await buildExportsApp(prisma, storage.port, 'user-1');
    const jobId = await queueViaRoute();

    const res = await app.inject({ method: 'GET', url: `/export/${jobId}/download` });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('EXPORT_NOT_READY');
    expect(res.json().error.message).toContain('QUEUED');
  });

  it('GET /export/:id/download on a FAILED job is 404 EXPORT_NOT_READY naming the status', async () => {
    app = await buildExportsApp(prisma, storage.port, 'user-1');
    const jobId = await queueViaRoute();
    const service = new ExportService(prisma as never, storage.port);
    await service.claimJob(jobId);
    await service.failJob(jobId, 'ffmpeg exploded');

    const res = await app.inject({ method: 'GET', url: `/export/${jobId}/download` });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('EXPORT_NOT_READY');
    expect(res.json().error.message).toContain('FAILED');
  });

  it('GET /export/:id/download on a COMPLETED job redirects 302 to a fresh signed URL', async () => {
    app = await buildExportsApp(prisma, storage.port, 'user-1');
    const jobId = await queueViaRoute();
    const key = await completeJob(jobId);

    const res = await app.inject({ method: 'GET', url: `/export/${jobId}/download` });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${FAKE_STORAGE_HOST}/${key}?signed=1`);
  });

  it('GET /export/:id/download for another user’s job is 404 EXPORT_NOT_FOUND', async () => {
    app = await buildExportsApp(prisma, storage.port, 'user-1');
    const jobId = await queueViaRoute();
    await completeJob(jobId);

    const otherApp = await buildExportsApp(prisma, storage.port, 'user-2');
    const res = await otherApp.inject({ method: 'GET', url: `/export/${jobId}/download` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('EXPORT_NOT_FOUND');
    await otherApp.close();
  });

  it('GET /export/:id/download without auth is rejected 401', async () => {
    app = await buildExportsApp(prisma, storage.port, null);

    const res = await app.inject({ method: 'GET', url: '/export/whatever/download' });

    expect(res.statusCode).toBe(401);
  });

  it('GET /export/:id/download with storage unconfigured is 503 STORAGE_NOT_CONFIGURED', async () => {
    const jobId = await (async () => {
      app = await buildExportsApp(prisma, storage.port, 'user-1');
      const id = await queueViaRoute();
      await completeJob(id);
      return id;
    })();

    const noStorageApp = await buildExportsApp(prisma, null, 'user-1');
    const res = await noStorageApp.inject({ method: 'GET', url: `/export/${jobId}/download` });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('STORAGE_NOT_CONFIGURED');
    await noStorageApp.close();
  });

  it('the job survives an app rebuild over the same store (restart)', async () => {
    app = await buildExportsApp(prisma, storage.port, 'user-1');
    const jobId = await queueViaRoute();
    await app.close();

    app = await buildExportsApp(prisma, storage.port, 'user-1');
    const res = await app.inject({ method: 'GET', url: `/export/${jobId}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(jobId);
    expect(res.json().data.status).toBe('QUEUED');
  });
});
