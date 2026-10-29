import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ExportService } from '../services/export.service';
import { adaptExportPrisma } from '../services/job-delegate-adapters';
import type { StoragePort } from '../services/storage.adapter';

// ============================================================================
// QuantEdits export routes (mounted at /export).
//
//   POST   /export                        queue a job (auth) -> 201 QUEUED
//   GET    /export/:id                    job status (auth, owner)
//   GET    /export/:id/download           302 → fresh signed URL (auth, owner,
//                                         COMPLETED only; else 404
//                                         EXPORT_NOT_READY) — P0-4
//   GET    /export/project/:projectId     caller's jobs for a project (auth)
//   POST   /export/:id/cancel             cancel a QUEUED job (auth, owner)
//
// Persistence is the Prisma-backed ExportService over EditExportJob (P0-4);
// the ExportProcessor (server.ts only, storage-gated) drives jobs to a
// terminal state. This route set used to be unauthenticated over an
// in-memory singleton whose jobs never left QUEUED — both are gone. Auth
// matches every other write route in this backend: an unauthenticated
// persistent export queue would be a cost/abuse hole.
// ============================================================================

const queueExportSchema = z.object({
  projectId: z.string(),
  format: z.enum(['mp4', 'webm', 'mov', 'gif', 'png', 'jpg']),
  resolution: z.enum(['720p', '1080p', '4k', 'original']),
  quality: z.enum(['low', 'medium', 'high', 'lossless']),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function exportsRoutes(fastify: FastifyInstance) {
  // Storage port: an injected port wins (tests decorate fastify with a fake
  // or with null); production builds the real @quant/storage-backed port.
  // The adapter import is dynamic so test apps that inject a port never load
  // the storage SDK module graph — same pattern as routes/assets.ts.
  const injected = (fastify as unknown as { storagePort?: StoragePort | null }).storagePort;
  const storage: StoragePort | null =
    injected !== undefined ? injected : (await import('../services/storage.adapter')).buildStoragePort();

  // CP-1 fold-in: when the prisma carries an editJob delegate (the real
  // client), persistence runs on EditJob via the EXPORT adapter; test
  // fakes without it pass through untouched.
  const exportService = new ExportService(
    adaptExportPrisma((fastify as unknown as { prisma: never }).prisma),
    storage,
  );

  fastify.post('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parseResult = queueExportSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const exportJob = await exportService.queueExport({ userId, ...parseResult.data });

    return reply.status(201).send({ success: true, data: exportJob });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const exportJob = await exportService.getExportStatus(request.params.id, userId);

    return reply.send({ success: true, data: exportJob });
  });

  // Download (P0-4): the stable path to the rendered file. Only a COMPLETED
  // job with a stored output key can download; anything else is a precise
  // 404 EXPORT_NOT_READY naming the current status (one code for every
  // non-completed state, per spec §3.5). The response is a 302 redirect to a
  // fresh signed URL — signed URLs are minted per request, never persisted.
  fastify.get<{ Params: { id: string } }>('/:id/download', async (request, reply) => {
    const userId = requireUserId(request);
    const row = await exportService.getJobRow(request.params.id, userId);

    if (row.status !== 'COMPLETED' || !row.outputUrl) {
      throw createAppError(
        `Export is not ready for download (status: ${row.status})`,
        404,
        'EXPORT_NOT_READY',
      );
    }

    if (!storage) {
      throw createAppError('Object storage is not configured', 503, 'STORAGE_NOT_CONFIGURED');
    }

    const signedUrl = await storage.getSignedUrl(row.outputUrl, 3600);
    return reply.redirect(signedUrl);
  });

  fastify.get('/project/:projectId', async (request, reply) => {
    const userId = requireUserId(request);
    const { projectId } = request.params as { projectId: string };
    const exports = await exportService.listExports(projectId, userId);

    return reply.send({ success: true, data: exports });
  });

  fastify.post<{ Params: { id: string } }>('/:id/cancel', async (request, reply) => {
    const userId = requireUserId(request);
    const exportJob = await exportService.cancelExport(request.params.id, userId);

    return reply.send({ success: true, data: exportJob });
  });
}
