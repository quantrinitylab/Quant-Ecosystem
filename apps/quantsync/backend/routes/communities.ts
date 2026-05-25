import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CommunityService } from '../services/community.service';

const createCommunitySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  avatarUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  category: z.string().optional(),
  rules: z.array(z.unknown()).optional(),
  isPrivate: z.boolean().optional(),
});

const updateCommunitySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(5000).optional(),
  avatarUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  category: z.string().optional(),
  rules: z.array(z.unknown()).optional(),
  isPrivate: z.boolean().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function communitiesRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = createCommunitySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommunityService(prisma as never);
    const community = await service.createCommunity(userId, parseResult.data);

    return reply.status(201).send({ success: true, data: community });
  });

  fastify.get('/', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommunityService(prisma as never);
    const result = await service.listCommunities(queryResult.data);

    return reply.send({ success: true, data: result });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommunityService(prisma as never);
    const community = await service.getCommunity(request.params.id);

    return reply.send({ success: true, data: community });
  });

  fastify.post<{ Params: { id: string } }>('/:id/join', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommunityService(prisma as never);
    const member = await service.joinCommunity(request.params.id, userId);

    return reply.status(201).send({ success: true, data: member });
  });

  fastify.post<{ Params: { id: string } }>('/:id/leave', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommunityService(prisma as never);
    await service.leaveCommunity(request.params.id, userId);

    return reply.send({ success: true });
  });

  fastify.get<{ Params: { id: string } }>('/:id/members', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommunityService(prisma as never);
    const result = await service.listMembers(request.params.id, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  fastify.put<{ Params: { id: string } }>('/:id/settings', async (request, reply) => {
    const parseResult = updateCommunitySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new CommunityService(prisma as never);
    const community = await service.updateSettings(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: community });
  });
}
