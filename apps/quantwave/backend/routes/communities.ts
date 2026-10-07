import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CommunityService } from '../services/community.service';

const createCommunitySchema = z.object({
  name: z.string().min(3).max(50),
  slug: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().optional(),
});

export default async function communitiesRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;
  const communityService = new CommunityService(prisma);

  fastify.post('/', async (request, reply) => {
    const parseResult = createCommunitySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const community = await communityService.createCommunity(userId, parseResult.data);

    return reply.send(community);
  });

  fastify.post('/:id/join', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;

    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await communityService.joinCommunity(userId, id);
    return reply.send(result);
  });

  fastify.get('/trending', async (request, reply) => {
    const communities = await communityService.getTrendingCommunities();
    return reply.send(communities);
  });

  // --- Membership / moderator tools -----------------------------------------

  const roleSchema = z.object({ role: z.enum(['ADMIN', 'MODERATOR', 'MEMBER']) });

  function requireUserId(request: unknown): string {
    const userId = (request as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    return userId;
  }

  fastify.get('/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = request.query as { page?: string; pageSize?: string };
    const result = await communityService.listMembers(id, {
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    });
    return reply.send({ success: true, data: result });
  });

  fastify.post('/:id/leave', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = requireUserId(request);
    const result = await communityService.leaveCommunity(userId, id);
    return reply.send({ success: true, data: result });
  });

  // Change a member's role (admin/owner only — enforced in the service).
  fastify.patch('/:id/members/:userId/role', async (request, reply) => {
    const { id, userId: targetUserId } = request.params as { id: string; userId: string };
    const actorId = requireUserId(request);
    const parsed = roleSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const result = await communityService.setMemberRole(
      actorId,
      id,
      targetUserId,
      parsed.data.role,
    );
    return reply.send({ success: true, data: result });
  });

  // Remove (kick) a member (moderator+ only — enforced in the service).
  fastify.delete('/:id/members/:userId', async (request, reply) => {
    const { id, userId: targetUserId } = request.params as { id: string; userId: string };
    const actorId = requireUserId(request);
    const result = await communityService.removeMember(actorId, id, targetUserId);
    return reply.send({ success: true, data: result });
  });
}
