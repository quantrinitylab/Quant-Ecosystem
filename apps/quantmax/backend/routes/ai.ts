import type { FastifyInstance } from 'fastify';
import { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import {
  AIDatingService,
  BioInputSchema,
  IcebreakerInputSchema,
} from '../services/ai-dating.service';

export default async function aiRoutes(fastify: FastifyInstance) {
  const ai = new AIEngine();
  const service = new AIDatingService(ai);

  fastify.post('/write-bio', async (request, reply) => {
    const parseResult = BioInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId =
      (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.writeBio(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });

  fastify.post('/icebreakers', async (request, reply) => {
    const parseResult = IcebreakerInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId =
      (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.generateIcebreakers(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });
}
