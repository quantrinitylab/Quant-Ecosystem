import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { MatchingService } from '../services/matching.service';

const swipeSchema = z.object({
  targetUserId: z.string(),
  direction: z.enum(['LEFT', 'RIGHT', 'SUPER_LIKE']),
});

export default async function matchingRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;
  const matchingService = new MatchingService(prisma);

  fastify.get('/matches', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const matches = await matchingService.findMatches(userId);
    return reply.send(matches);
  });

  fastify.post('/swipe', async (request, reply) => {
    const parseResult = swipeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await matchingService.recordSwipe(
      userId,
      parseResult.data.targetUserId,
      parseResult.data.direction,
    );

    return reply.send(result);
  });
}
