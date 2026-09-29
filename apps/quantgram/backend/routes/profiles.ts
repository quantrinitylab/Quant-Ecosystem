import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ProfileService } from '../services/profile.service';

const updateProfileSchema = z.object({
  bio: z.string().max(500).optional(),
  website: z.string().max(300).optional(),
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().optional(),
});

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function getService(fastify: FastifyInstance): ProfileService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new ProfileService(prisma as never);
}

export default async function profilesRoutes(fastify: FastifyInstance) {
  // The caller's own profile (id + public fields) — used by clients to resolve
  // "me" (e.g. DM message ownership).
  fastify.get('/me', async (request, reply) => {
    const userId = getUserId(request);
    const profile = await getService(fastify).getProfile(userId, userId);
    return reply.send({ success: true, data: { profile } });
  });

  // Edit the caller's own profile.
  fastify.patch('/me', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const profile = await getService(fastify).updateMe(userId, parsed.data);
    return reply.send({ success: true, data: { profile } });
  });

  // Close friends list for the caller.
  fastify.get('/close-friends', async (request, reply) => {
    const userId = getUserId(request);
    const friends = await getService(fastify).listCloseFriends(userId);
    return reply.send({ success: true, data: { friends } });
  });

  fastify.post<{ Params: { id: string } }>('/:id/close-friend', async (request, reply) => {
    const userId = getUserId(request);
    const result = await getService(fastify).addCloseFriend(userId, request.params.id);
    return reply.send({ success: true, data: result });
  });

  fastify.delete<{ Params: { id: string } }>('/:id/close-friend', async (request, reply) => {
    const userId = getUserId(request);
    const result = await getService(fastify).removeCloseFriend(userId, request.params.id);
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/follow', async (request, reply) => {
    const userId = getUserId(request);
    const result = await getService(fastify).follow(userId, request.params.id);
    return reply.send({ success: true, data: result });
  });

  fastify.delete<{ Params: { id: string } }>('/:id/follow', async (request, reply) => {
    const userId = getUserId(request);
    const result = await getService(fastify).unfollow(userId, request.params.id);
    return reply.send({ success: true, data: result });
  });

  fastify.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/:id/followers',
    async (request, reply) => {
      const viewerId = (request as { auth?: { userId?: string } }).auth?.userId ?? '';
      const limit = Math.min(Math.max(Number(request.query.limit ?? 50) || 50, 1), 100);
      const users = await getService(fastify).listFollowers(request.params.id, viewerId, limit);
      return reply.send({ success: true, data: { users } });
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/:id/following',
    async (request, reply) => {
      const viewerId = (request as { auth?: { userId?: string } }).auth?.userId ?? '';
      const limit = Math.min(Math.max(Number(request.query.limit ?? 50) || 50, 1), 100);
      const users = await getService(fastify).listFollowing(request.params.id, viewerId, limit);
      return reply.send({ success: true, data: { users } });
    },
  );

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const viewerId = (request as { auth?: { userId?: string } }).auth?.userId ?? '';
    const profile = await getService(fastify).getProfile(request.params.id, viewerId);
    return reply.send({ success: true, data: { profile } });
  });
}
