import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { FeedService } from '../services/feed.service';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const trendingSchema = z.object({
  timeframe: z.enum(['1h', '24h', '7d']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function feedRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new FeedService(prisma as never);
    const result = await service.getFeed(userId, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  fastify.get('/explore', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new FeedService(prisma as never);
    const result = await service.getExploreFeed(queryResult.data);

    return reply.send({ success: true, data: result });
  });

  fastify.get('/trending', async (request, reply) => {
    const queryResult = trendingSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const { timeframe, ...pagination } = queryResult.data;
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new FeedService(prisma as never);
    const result = await service.getTrending(timeframe as '1h' | '24h' | '7d', pagination);

    return reply.send({ success: true, data: result });
  });
}
