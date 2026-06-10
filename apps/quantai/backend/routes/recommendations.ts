import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { recommendationEngine } from '@quant/recommendation';

const recommendSchema = z.object({
  limit: z.number().min(1).max(50).optional(),
  type: z.enum(['personalized', 'trending', 'similar']).optional(),
});

export default async function recommendationRoutes(fastify: FastifyInstance) {
  fastify.get('/for-me', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parseResult = recommendSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const { limit = 10, type = 'personalized' } = parseResult.data;

    try {
      const recommendations = await recommendationEngine.recommendForUser(userId, limit);
      return reply.send(recommendations);
    } catch (error: any) {
      throw createAppError(error.message, 500, 'RECOMMENDATION_ERROR');
    }
  });

  fastify.post('/interact', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { contentId, type, value } = request.body as any;

    await recommendationEngine.recordInteraction(userId, contentId, type, value);
    return reply.send({ success: true });
  });

  fastify.post('/content', async (request, reply) => {
    const content = request.body as any;
    await recommendationEngine.addContent(content);
    return reply.send({ success: true });
  });
}
