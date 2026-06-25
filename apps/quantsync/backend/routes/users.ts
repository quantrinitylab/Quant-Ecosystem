import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { FollowService } from '../services/follow.service';

// ============================================================================
// QuantSync user/social-graph routes (mounted at /users).
//
//   POST   /users/:id/follow     -> follow user :id        (idempotent)
//   DELETE /users/:id/follow     -> unfollow user :id      (idempotent)
//   GET    /users/:id/follow     -> { following: boolean } for the caller
//   GET    /users/:id/followers  -> { followers: string[] }
//   GET    /users/:id/following  -> { following: string[] }
//   GET    /users/:id/counts     -> { followers, following }
//
// All authenticated (the global auth hook rejects anonymous callers).
// ============================================================================

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function usersRoutes(fastify: FastifyInstance) {
  const service = () => new FollowService((fastify as unknown as { prisma: never }).prisma);

  fastify.post<{ Params: { id: string } }>('/:id/follow', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await service().follow(userId, request.params.id);
    return reply.status(201).send({ success: true, data: result });
  });

  fastify.delete<{ Params: { id: string } }>('/:id/follow', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await service().unfollow(userId, request.params.id);
    return reply.send({ success: true, data: result });
  });

  fastify.get<{ Params: { id: string } }>('/:id/follow', async (request, reply) => {
    const userId = requireUserId(request);
    const following = await service().isFollowing(userId, request.params.id);
    return reply.send({ success: true, data: { following } });
  });

  fastify.get<{ Params: { id: string } }>('/:id/followers', async (request, reply) => {
    requireUserId(request);
    const followers = await service().listFollowerIds(request.params.id);
    return reply.send({ success: true, data: { followers } });
  });

  fastify.get<{ Params: { id: string } }>('/:id/following', async (request, reply) => {
    requireUserId(request);
    const following = await service().listFollowingIds(request.params.id);
    return reply.send({ success: true, data: { following } });
  });

  fastify.get<{ Params: { id: string } }>('/:id/counts', async (request, reply) => {
    requireUserId(request);
    const counts = await service().counts(request.params.id);
    return reply.send({ success: true, data: counts });
  });
}
