import type { FastifyInstance } from 'fastify';
import { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import {
  AICaptionService,
  CaptionInputSchema,
  FilterSuggestInputSchema,
} from '../services/ai-caption.service';

export default async function aiRoutes(fastify: FastifyInstance) {
  const ai = new AIEngine();
  const service = new AICaptionService(ai);

  fastify.post('/captions', async (request, reply) => {
    const parseResult = CaptionInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId =
      (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.generateCaptions(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });

  fastify.post('/filters', async (request, reply) => {
    const parseResult = FilterSuggestInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId =
      (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.suggestFilters(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });
}
