import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { MatchingService } from '../services/matching.service';

const compatibilitySchema = z.object({
  targetUserId: z.string(),
});

export default async function matchingRoutes(fastify: FastifyInstance) {
  fastify.get('/potential', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { limit } = request.query as { limit?: string };
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MatchingService(prisma as never);
    const profiles = await service.getPotentialMatches(userId, limit ? Number(limit) : 10);

    return reply.send({ success: true, data: profiles });
  });

  fastify.post('/compatibility', async (request, reply) => {
    const parseResult = compatibilitySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MatchingService(prisma as never);
    const result = await service.calculateCompatibility(userId, parseResult.data.targetUserId);

    return reply.send({ success: true, data: result });
  });

  fastify.get('/matches', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MatchingService(prisma as never);
    const matches = await service.getMatches(userId);

    return reply.send({ success: true, data: matches });
  });
}
