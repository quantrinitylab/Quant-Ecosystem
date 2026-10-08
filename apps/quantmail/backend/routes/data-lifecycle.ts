/**
 * QM-BACK-006 — data-lifecycle routes (M15 export center + verified completion).
 *
 * - POST   /data-lifecycle/exports            request a data export (202, requested)
 * - POST   /data-lifecycle/exports/:id/build  generate the v1 inventory manifest
 *                                             and complete the request
 * - GET    /data-lifecycle/exports            list my export requests
 * - GET    /data-lifecycle/exports/:id        export request status
 * - POST   /data-lifecycle/retention/sweep    run the retention sweep now
 *                                             (also intended for a scheduler)
 * - GET    /data-lifecycle/operations         my lifecycle operations
 *                                             (verified-completion visibility)
 *
 * Every transition emits its versioned lifecycle event transactionally
 * (doc 23). Nothing here reports completion before the artifact/side effect
 * exists.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  requestDataExport,
  completeDataExport,
  failDataExport,
  generateInventoryManifest,
  runRetentionSweep,
} from '../services/data-lifecycle.service';

function requireUserId(request: FastifyRequest): string {
  const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma?: unknown }).prisma;
}

function requirePrisma(fastify: FastifyInstance): any {
  const prisma = getPrisma(fastify);
  if (!prisma || typeof prisma.$transaction !== 'function') {
    throw createAppError(
      'Data-lifecycle operations require the database; unavailable in this mode',
      503,
      'LIFECYCLE_DB_UNAVAILABLE',
    );
  }
  return prisma;
}

const requestExportSchema = z.object({
  scope: z.string().trim().min(1).max(80).optional().default('mailbox-inventory'),
});

const ALLOWED_EXPORT_SCOPES = new Set(['mailbox-inventory']);

export default async function dataLifecycleRoutes(fastify: FastifyInstance) {
  // POST /data-lifecycle/exports — request an export (M15 export center).
  fastify.post('/exports', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = requestExportSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw createAppError('Invalid export request', 400, 'VALIDATION_ERROR');
    }
    if (!ALLOWED_EXPORT_SCOPES.has(parsed.data.scope)) {
      throw createAppError(
        `Unsupported export scope '${parsed.data.scope}'. v1 supports: ${[...ALLOWED_EXPORT_SCOPES].join(', ')}`,
        400,
        'UNSUPPORTED_EXPORT_SCOPE',
      );
    }
    const prisma = requirePrisma(fastify);
    const { exportId, operationId } = await requestDataExport(prisma, userId, parsed.data.scope);
    return reply.status(202).send({
      success: true,
      data: { exportId, operationId, status: 'requested', scope: parsed.data.scope },
    });
  });

  // POST /data-lifecycle/exports/:id/build — generate the artifact and complete.
  // v1 artifact: a data-inventory manifest from live DB counts (M15 "what data
  // exists"). Delivered inline; artifactRef records the delivery.
  fastify.post<{ Params: { id: string } }>('/exports/:id/build', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = requirePrisma(fastify);
    const exportId = request.params.id;

    const existing = await prisma.dataExportRequest.findUnique({ where: { id: exportId } });
    if (!existing || String((existing as { userId?: string }).userId) !== userId) {
      throw createAppError('Export request not found', 404, 'EXPORT_NOT_FOUND');
    }
    if (String((existing as { status?: string }).status) !== 'requested') {
      throw createAppError(
        `Export is already ${String((existing as { status?: string }).status)}`,
        409,
        'EXPORT_STATE_CONFLICT',
      );
    }

    try {
      const manifest = await prisma.$transaction(async (tx: unknown) =>
        generateInventoryManifest(
          tx as import('../services/data-lifecycle.service').LifecycleTx,
          userId,
        ),
      );
      const artifactRef = `inline-manifest:${exportId}`;
      await completeDataExport(prisma, exportId, userId, artifactRef);
      return reply.send({ success: true, data: { exportId, status: 'completed', artifactRef, manifest } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export build failed';
      try {
        await failDataExport(prisma, exportId, userId, message);
      } catch {
        // The failure record itself failed — surface the original error.
      }
      throw createAppError(`Export build failed: ${message}`, 500, 'EXPORT_BUILD_FAILED');
    }
  });

  // GET /data-lifecycle/exports — my export requests.
  fastify.get('/exports', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = requirePrisma(fastify);
    const rows = await prisma.dataExportRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      take: 50,
    });
    return reply.send({ success: true, data: rows });
  });

  // GET /data-lifecycle/exports/:id — one export request's status.
  fastify.get<{ Params: { id: string } }>('/exports/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = requirePrisma(fastify);
    const row = await prisma.dataExportRequest.findUnique({ where: { id: request.params.id } });
    if (!row || String((row as { userId?: string }).userId) !== userId) {
      throw createAppError('Export request not found', 404, 'EXPORT_NOT_FOUND');
    }
    return reply.send({ success: true, data: row });
  });

  // POST /data-lifecycle/retention/sweep — execute enabled retention policies now.
  fastify.post('/retention/sweep', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = requirePrisma(fastify);
    const result = await runRetentionSweep(prisma, userId);
    return reply.send({ success: true, data: result });
  });

  // GET /data-lifecycle/operations — verified-completion visibility.
  fastify.get('/operations', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = requirePrisma(fastify);
    const rows = await prisma.lifecycleOperation.findMany({
      where: { requestedBy: userId },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
    return reply.send({ success: true, data: rows });
  });
}
