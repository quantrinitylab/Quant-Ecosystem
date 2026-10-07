import type { FastifyInstance } from 'fastify';
import { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import {
  AIAdCopyService,
  AdCopyInputSchema,
  HeadlineInputSchema,
} from '../services/ai-ad-copy.service';

export default async function aiRoutes(fastify: FastifyInstance) {
  const ai = new AIEngine();
  const service = new AIAdCopyService(ai);

  fastify.post('/ad-copy', async (request, reply) => {
    const parseResult = AdCopyInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId =
      (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.generateAdCopy(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });

  fastify.post('/headlines', async (request, reply) => {
    const parseResult = HeadlineInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId =
      (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.generateHeadlines(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });
}
