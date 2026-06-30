import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { VideoService, VideoNotFoundError, VideoValidationError } from '../services/video.service';

// ============================================================================
// QuantMax short-video routes (mounted at /videos).
//
//   POST /videos            -> create a video (upload metadata)
//   GET  /videos            -> feed (paginated)
//   GET  /videos/user/:userId -> a creator's videos (paginated, excludes deleted)
//   GET  /videos/:id        -> a video (counts a view)
//   POST /videos/:id/like   -> toggle the caller's like
//   DELETE /videos/:id      -> soft-delete the caller's own video
// ============================================================================

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

function getService(fastify: FastifyInstance): VideoService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new VideoService(prisma as never);
}

const createSchema = z.object({
  videoUrl: z.string().min(1).max(2048),
  thumbnailUrl: z.string().max(2048).optional(),
  caption: z.string().max(2200).optional(),
  duration: z.coerce.number().int().min(0).max(600).optional(),
  soundId: z.string().max(128).optional(),
  hashtags: z.array(z.string().max(100)).max(30).optional(),
});

const feedSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

export default async function videosRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    try {
      const video = await getService(fastify).createVideo({ userId, ...parsed.data });
      return reply.status(201).send({ success: true, data: { video } });
    } catch (err) {
      if (err instanceof VideoValidationError) {
        throw createAppError(err.message, 422, 'VALIDATION_ERROR');
      }
      throw err;
    }
  });

  fastify.get('/', async (request, reply) => {
    getUserId(request);
    const parsed = feedSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const feed = await getService(fastify).listFeed(parsed.data);
    return reply.send({ success: true, data: feed });
  });

  fastify.get<{ Params: { userId: string }; Querystring: unknown }>(
    '/user/:userId',
    async (request, reply) => {
      getUserId(request);
      const parsed = feedSchema.safeParse(request.query);
      if (!parsed.success) throw parsed.error;
      const result = await getService(fastify).listByUser(request.params.userId, parsed.data);
      return reply.send({ success: true, data: result });
    },
  );

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    getUserId(request);
    try {
      const video = await getService(fastify).getVideo(request.params.id);
      return reply.send({ success: true, data: { video } });
    } catch (err) {
      if (err instanceof VideoNotFoundError) throw createAppError(err.message, 404, 'NOT_FOUND');
      throw err;
    }
  });

  fastify.post<{ Params: { id: string } }>('/:id/like', async (request, reply) => {
    const userId = getUserId(request);
    try {
      const result = await getService(fastify).toggleLike(userId, request.params.id);
      return reply.send({ success: true, data: result });
    } catch (err) {
      if (err instanceof VideoNotFoundError) throw createAppError(err.message, 404, 'NOT_FOUND');
      throw err;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getUserId(request);
    const result = await getService(fastify).deleteVideo(request.params.id, userId);
    return reply.send({ success: true, data: result });
  });
}
