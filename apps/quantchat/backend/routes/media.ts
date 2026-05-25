import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { MediaService } from '../services/media.service';

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
});

export default async function mediaRoutes(fastify: FastifyInstance) {
  const service = new MediaService();

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

  // GET /media/:id - Get media metadata
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const meta = await service.getMediaMetadata(request.params.id);
    return reply.send({ success: true, data: meta });
  });
}
