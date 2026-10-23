import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { createAppError, enableIdempotency } from '@quant/server-core';
import {
  MediaService,
  createStorageFromEnv,
  type MediaObjectStorage,
} from '../services/media.service';

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
});

// QC-F-573: finalize verifies the uploaded bytes in object storage and only
// then persists the durable Media row. durationMs is the recorder's real
// elapsed time (whole seconds stored).
const finalizeSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  durationMs: z.number().int().min(0).max(600000).optional(),
});

export interface MediaRoutesOptions {
  /** Test/ops seam: overrides the fastify-decorated prisma client. */
  prisma?: PrismaClient;
  /** Test/ops seam: overrides the env-derived object storage. */
  storage?: MediaObjectStorage | null;
}

export default async function mediaRoutes(
  fastify: FastifyInstance,
  opts?: MediaRoutesOptions,
) {
  // K4: Idempotency-Key support on media uploads.
  enableIdempotency(fastify);

  const prisma =
    opts?.prisma ?? (fastify as unknown as { prisma: PrismaClient }).prisma;
  const storage = opts?.storage !== undefined ? opts.storage : createStorageFromEnv();
  const service = new MediaService(prisma, storage);

  // POST /media/upload-url - Generate presigned upload URL
  fastify.post('/upload-url', async (request, reply) => {
    const parseResult = uploadUrlSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.generateUploadUrl(
      userId,
      parseResult.data.filename,
      parseResult.data.contentType,
    );

    return reply.status(201).send({ success: true, data: result });
  });

  // POST /media/:id/finalize - Verify the uploaded object in storage and
  // persist the durable Media row. Idempotent on :id for the owner
  // (re-finalize returns the same row).
  fastify.post<{ Params: { id: string } }>('/:id/finalize', async (request, reply) => {
    const parseResult = finalizeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const meta = await service.finalizeUpload(request.params.id, userId, {
      filename: parseResult.data.filename,
      contentType: parseResult.data.contentType,
      durationMs: parseResult.data.durationMs,
    });

    return reply.status(200).send({ success: true, data: meta });
  });

  // GET /media/:id - Get media metadata (owner-only, QC-F-031)
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const meta = await service.getMediaMetadata(request.params.id, userId);
    return reply.send({ success: true, data: meta });
  });
}
