import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { InteractionService } from '../services/interaction.service';

// ============================================================================
// QuantSync interaction routes (mounted at /interactions).
//
//   GET  /interactions/bookmarks      -> the caller's bookmarked posts
//   POST /interactions/:id/upvote     -> toggle/cast an upvote
//   POST /interactions/:id/downvote   -> toggle/cast a downvote
//   POST /interactions/:id/bookmark   -> toggle a bookmark
//   POST /interactions/:id/share      -> record a share
//
// All authenticated + strictly per-caller.
// ============================================================================

const paginationSchema = z.object({
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

function buildService(fastify: FastifyInstance): InteractionService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new InteractionService(prisma as never);
}

export default async function interactionsRoutes(fastify: FastifyInstance) {
  fastify.get('/bookmarks', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const result = await buildService(fastify).listBookmarks(userId, parsed.data);
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/upvote', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await buildService(fastify).vote(userId, request.params.id, 'up');
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/downvote', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await buildService(fastify).vote(userId, request.params.id, 'down');
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/bookmark', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await buildService(fastify).toggleBookmark(userId, request.params.id);
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/share', async (request, reply) => {
    requireUserId(request);
    const result = await buildService(fastify).share(request.params.id);
    return reply.send({ success: true, data: result });
  });
}
