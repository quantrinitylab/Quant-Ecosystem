import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { FollowService } from '../services/follow.service';

// ============================================================================
// QuantSync follow-graph routes (mounted at /follow).
//
//   GET    /follow/feed               -> the caller's "Following" home feed
//   POST   /follow/:userId            -> follow that user
//   DELETE /follow/:userId            -> unfollow that user
//   GET    /follow/:userId/status     -> { following: boolean }
//   GET    /follow/:userId/followers  -> accounts following that user
//   GET    /follow/:userId/following  -> accounts that user follows
//
// All routes are authenticated (the global auth hook rejects anonymous
// callers). `/feed` is declared before `/:userId` so the static path wins.
// ============================================================================

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const limitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function service(fastify: FastifyInstance): FollowService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new FollowService(prisma as never);
}

export default async function followRoutes(fastify: FastifyInstance) {
  fastify.get('/feed', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const data = await service(fastify).getFollowingFeed(
      userId,
      parsed.data.page ?? 1,
      parsed.data.pageSize ?? 20,
    );
    return reply.send({ success: true, data });
  });

  fastify.get('/suggestions', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = limitSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const users = await service(fastify).getSuggestions(userId, parsed.data.limit ?? 20);
    return reply.send({ success: true, data: { users } });
  });

  fastify.post<{ Params: { userId: string } }>('/:userId', async (request, reply) => {
    const followerId = requireUserId(request);
    const result = await service(fastify).follow(followerId, request.params.userId);
    return reply.send({ success: true, data: result });
  });

  fastify.delete<{ Params: { userId: string } }>('/:userId', async (request, reply) => {
    const followerId = requireUserId(request);
    const result = await service(fastify).unfollow(followerId, request.params.userId);
    return reply.send({ success: true, data: result });
  });

  fastify.get<{ Params: { userId: string } }>('/:userId/status', async (request, reply) => {
    const followerId = requireUserId(request);
    const following = await service(fastify).isFollowing(followerId, request.params.userId);
    return reply.send({ success: true, data: { following } });
  });

  fastify.get<{ Params: { userId: string }; Querystring: { limit?: string } }>(
    '/:userId/followers',
    async (request, reply) => {
      const viewerId = requireUserId(request);
      const parsed = limitSchema.safeParse(request.query);
      if (!parsed.success) throw parsed.error;
      const users = await service(fastify).listFollowers(
        request.params.userId,
        viewerId,
        parsed.data.limit ?? 50,
      );
      return reply.send({ success: true, data: { users } });
    },
  );

  fastify.get<{ Params: { userId: string }; Querystring: { limit?: string } }>(
    '/:userId/following',
    async (request, reply) => {
      const viewerId = requireUserId(request);
      const parsed = limitSchema.safeParse(request.query);
      if (!parsed.success) throw parsed.error;
      const users = await service(fastify).listFollowing(
        request.params.userId,
        viewerId,
        parsed.data.limit ?? 50,
      );
      return reply.send({ success: true, data: { users } });
    },
  );
}
