import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { SwipeService } from '../services/swipe.service';

const swipeSchema = z.object({
  targetId: z.string(),
  direction: z.enum(['LEFT', 'RIGHT', 'SUPER_LIKE']),
});

export default async function swipesRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = swipeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SwipeService(prisma as never);
    const result = await service.swipe(
      userId,
      parseResult.data.targetId,
      parseResult.data.direction,
    );

    return reply.status(201).send({ success: true, data: result });
  });

  fastify.get('/history', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SwipeService(prisma as never);
    const history = await service.getSwipeHistory(userId);

    return reply.send({ success: true, data: history });
  });
}
