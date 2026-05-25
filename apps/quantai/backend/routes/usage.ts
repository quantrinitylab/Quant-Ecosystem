import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { UsageService } from '../services/usage.service';

const usageQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).optional(),
});

export default async function usageRoutes(fastify: FastifyInstance) {
  // GET /usage - Get usage stats
  fastify.get('/', async (request, reply) => {
    const queryResult = usageQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new UsageService(prisma as never);
    const period = queryResult.data.period ?? 'day';
    const usage = await service.getUsage(userId, period);

    return reply.send({ success: true, data: usage });
  });

  // GET /usage/billing - Get billing info
  fastify.get('/billing', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new UsageService(prisma as never);
    const billing = await service.getBilling(userId);

    return reply.send({ success: true, data: billing });
  });
}
