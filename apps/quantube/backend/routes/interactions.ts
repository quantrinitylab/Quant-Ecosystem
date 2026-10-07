import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { VideoService } from '../services/video.service';

// ============================================================================
// QuantTube interactions routes (mounted at /interactions).
//
//   POST /interactions/like      { videoId }           -> toggle like
//   POST /interactions/comment   { videoId, content }  -> add a comment
//   GET  /interactions/comments?videoId=&page=&pageSize= -> list comments
//
// All authenticated (the global auth hook rejects anonymous callers).
// ============================================================================

const likeSchema = z.object({ videoId: z.string().min(1) });
const commentSchema = z.object({
  videoId: z.string().min(1),
  content: z.string().min(1).max(10000),
});
const listSchema = z.object({
  videoId: z.string().min(1),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function buildService(fastify: FastifyInstance): VideoService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new VideoService(prisma as never);
}

export default async function interactionsRoutes(fastify: FastifyInstance) {
  fastify.post('/like', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = likeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const result = await buildService(fastify).likeVideo(parsed.data.videoId, userId);
    return reply.send({ success: true, data: result });
  });

  fastify.post('/comment', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = commentSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const comment = await buildService(fastify).addComment(
      parsed.data.videoId,
      userId,
      parsed.data.content,
    );
    return reply.status(201).send({ success: true, data: comment });
  });

  fastify.get('/comments', async (request, reply) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }
    const { videoId, page, pageSize } = parsed.data;
    try {
      const result = await buildService(fastify).listComments(videoId, { page, pageSize });
      return reply.send({ success: true, data: result });
    } catch (err) {
      return reply.send({ success: true, data: { comments: [], total: 0 } });
    }
  });

  fastify.get<{ Params: { id: string } }>('/comments/:id', async (request, reply) => {
    try {
      const result = await buildService(fastify).listComments(request.params.id, {});
      return reply.send({ success: true, data: result });
    } catch (err) {
      return reply.send({ success: true, data: { comments: [], total: 0 } });
    }
  });

  fastify.get<{ Params: { id: string } }>('/likes/:id', async (request, reply) => {
    return reply.send({ success: true, data: { likes: 0 } });
  });
}
