import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ReelService } from '../services/reel.service';

const createReelSchema = z.object({
  videoUrl: z.string().min(1),
  thumbnailUrl: z.string().optional(),
  caption: z.string().max(2200).optional(),
  soundName: z.string().optional(),
  soundId: z.string().optional(),
  duration: z.number().positive().optional(),
});

const commentSchema = z.object({
  text: z.string().min(1).max(2200),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function getService(fastify: FastifyInstance): ReelService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new ReelService(prisma as never);
}

export default async function reelsRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = createReelSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const reel = await getService(fastify).createReel({ ...parsed.data, creatorId: userId });
    return reply.status(201).send({ success: true, data: { reel } });
  });

  fastify.get('/feed', async (request, reply) => {
    const viewerId = (request as { auth?: { userId?: string } }).auth?.userId ?? '';
    const query = paginationSchema.safeParse(request.query);
    if (!query.success) throw query.error;

    const reels = await getService(fastify).getFeed(viewerId, query.data);
    return reply.send({ success: true, data: { reels } });
  });

  fastify.post<{ Params: { id: string } }>('/:id/like', async (request, reply) => {
    const userId = getUserId(request);
    const result = await getService(fastify).toggleLike(request.params.id, userId);
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/comment', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = commentSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const comment = await getService(fastify).addComment(
      request.params.id,
      userId,
      parsed.data.text,
    );
    return reply.status(201).send({ success: true, data: { comment } });
  });

  fastify.get<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const comments = await getService(fastify).getComments(request.params.id);
    return reply.send({ success: true, data: { comments } });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const viewerId = (request as { auth?: { userId?: string } }).auth?.userId;
    const reel = await getService(fastify).getReel(request.params.id, viewerId);
    return reply.send({ success: true, data: { reel } });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getUserId(request);
    const result = await getService(fastify).deleteReel(request.params.id, userId);
    return reply.send({ success: true, data: result });
  });
}
