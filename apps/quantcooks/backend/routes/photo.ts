import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { PhotoEditService } from '../services/photo-edit.service';
import { adaptPhotoPrisma } from '../services/job-delegate-adapters';
import { PHOTO_OUTPUT_FORMATS } from '../services/photo-edit.service';
import type { StoragePort } from '../services/storage.adapter';
import {
  resolvePhotoCraftBin,
  NodePhotoCraftRunner,
  editTimeoutFromEnv,
  MAX_PHOTO_OPERATIONS,
  type PhotoCraftRunner,
} from '../services/photocraft.adapter';

// ============================================================================
// QuantCooks photo routes (mounted at /photo, C-3B).
//
//   POST   /photo/edits        queue a companion photo edit -> 201 QUEUED
//   GET    /photo/edits/:id    job status (auth, owner)
//   GET    /photo/edits        caller's jobs (auth; ?projectId=)
//
// Persistence is the Prisma-backed PhotoEditService over EditPhotoEditJob;
// the PhotoEditProcessor (server.ts only, binary-gated) drives jobs to a
// terminal state: source bytes are pulled from P0-3 storage, edited by the
// companion, and land as NEW P0-3 assets in the source's project.
//
// Fail-closed configuration (CP-1 §8): when the companion binary is not
// configured (PHOTOCRAFT_BIN unset or not executable), creation refuses
// with 503 PHOTO_NOT_CONFIGURED naming the companion and NO job row is
// created. Reads of persisted jobs keep working (metadata reads).
//
// Injection seams mirror routes/craft.ts: a decorated `storagePort` wins
// over the lazily built real port; a decorated `photoCraftBin` (string |
// null) or `photoCraftRunner` wins over env resolution, so tests point the
// surface at a fake binary without touching process.env.
// ============================================================================

const createEditSchema = z.object({
  sourceAssetId: z.string().min(1),
  operations: z
    .array(
      z.object({
        id: z.string().min(1),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(MAX_PHOTO_OPERATIONS),
  outputFormat: z.enum(PHOTO_OUTPUT_FORMATS).optional(),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function photoRoutes(fastify: FastifyInstance) {
  const decorated = fastify as unknown as {
    prisma: never;
    storagePort?: StoragePort | null;
    photoCraftBin?: string | null;
    photoCraftRunner?: PhotoCraftRunner | null;
  };

  const storage: StoragePort | null =
    decorated.storagePort !== undefined
      ? decorated.storagePort
      : (await import('../services/storage.adapter')).buildStoragePort();

  const runner: PhotoCraftRunner | null =
    decorated.photoCraftRunner !== undefined
      ? decorated.photoCraftRunner
      : decorated.photoCraftBin !== undefined
        ? decorated.photoCraftBin
          ? new NodePhotoCraftRunner(decorated.photoCraftBin, editTimeoutFromEnv())
          : null
        : (() => {
            const bin = resolvePhotoCraftBin();
            return bin ? new NodePhotoCraftRunner(bin, editTimeoutFromEnv()) : null;
          })();

  // CP-1 fold-in: persistence on EditJob via the PHOTO_EDIT adapter
  // when the prisma carries an editJob delegate; test fakes pass through.
  const photoService = new PhotoEditService(adaptPhotoPrisma(decorated.prisma), storage, runner);

  fastify.post('/edits', async (request, reply) => {
    const userId = requireUserId(request);
    const parseResult = createEditSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const job = await photoService.createEdit({ ...parseResult.data, userId });
    return reply.status(201).send({ success: true, data: job });
  });

  fastify.get<{ Params: { id: string } }>('/edits/:id', async (request) => {
    const userId = requireUserId(request);
    const job = await photoService.getEdit(request.params.id, userId);
    return { success: true, data: job };
  });

  fastify.get<{ Querystring: { projectId?: string } }>('/edits', async (request) => {
    const userId = requireUserId(request);
    const jobs = await photoService.listEdits(userId, request.query.projectId || undefined);
    return { success: true, data: jobs };
  });
}
