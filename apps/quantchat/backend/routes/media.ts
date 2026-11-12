import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError, enableIdempotency } from '@quant/server-core';
import { MediaService } from '../services/media.service';
import { snapMediaResponseHeaders } from '../lib/media-url';

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
});

export default async function mediaRoutes(fastify: FastifyInstance) {
  // K4: Idempotency-Key support on media uploads.
  enableIdempotency(fastify);

  // Phase 1B: prefer the app-level shared MediaService (decorated in
  // app.ts) so the disappearing sweep worker's expiry flags are visible
  // here. Route unit tests that skip app.ts get a local instance.
  const service =
    (fastify as unknown as { mediaService?: MediaService }).mediaService ?? new MediaService();

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

  // GET /media/:id - Get media metadata (owner-only, QC-F-031)
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const meta = await service.getMediaMetadata(request.params.id, userId);
    // Phase 1B: the service throws 410 MEDIA_EXPIRED for expired snaps —
    // the route passes it through unchanged (no mapping to 404).
    return reply.send({ success: true, data: meta });
  });

  // POST /media/:id/view-url - Short-lived signed snap view URL (Phase 1B)
  //
  // Snap/story media is never served with long/permanent CDN cache
  // headers: the response carries 'Cache-Control: private, no-store' and
  // the URL itself expires in 15 minutes by default (configurable via
  // SNAP_VIEW_URL_EXPIRY_SECONDS, hard-capped at 1 hour).
  fastify.post<{ Params: { id: string } }>('/:id/view-url', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.generateSnapViewUrl(request.params.id, userId);

    const headers = snapMediaResponseHeaders();
    for (const [name, value] of Object.entries(headers)) {
      reply.header(name, value);
    }
    return reply.status(201).send({ success: true, data: result });
  });
}

