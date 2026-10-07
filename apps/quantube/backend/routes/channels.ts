import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ChannelService } from '../services/channel.service';

const createChannelSchema = z.object({
  name: z.string().min(1).max(200),
  handle: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  avatarUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
});

const updateChannelSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  avatarUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
});

export default async function channelsRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = createChannelSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ChannelService(prisma as never);
    const channel = await service.createChannel({ ...parseResult.data, userId });

    return reply.status(201).send({ success: true, data: channel });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ChannelService(prisma as never);
    const channel = await service.getChannel(request.params.id);

    return reply.send({ success: true, data: channel });
  });

  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateChannelSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ChannelService(prisma as never);
    const channel = await service.updateChannel(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: channel });
  });

  fastify.post<{ Params: { id: string } }>('/:id/subscribe', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ChannelService(prisma as never);
    const channel = await service.subscribe(request.params.id, userId);

    return reply.send({ success: true, data: channel });
  });

  fastify.post<{ Params: { id: string } }>('/:id/unsubscribe', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ChannelService(prisma as never);
    const channel = await service.unsubscribe(request.params.id, userId);

    return reply.send({ success: true, data: channel });
  });

  fastify.get<{ Params: { id: string } }>('/:id/stats', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ChannelService(prisma as never);
    const stats = await service.getChannelStats(request.params.id);

    return reply.send({ success: true, data: stats });
  });
}
