import type { FastifyInstance } from 'fastify';
import { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import {
  AIVideoAssistantService,
  VideoMetaInputSchema,
  DescriptionInputSchema,
} from '../services/ai-video-assistant.service';

export default async function aiRoutes(fastify: FastifyInstance) {
  const ai = new AIEngine();
  const service = new AIVideoAssistantService(ai);

  fastify.post('/metadata', async (request, reply) => {
    const parseResult = VideoMetaInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId =
      (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.generateMetadata(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });

  fastify.post('/description', async (request, reply) => {
    const parseResult = DescriptionInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId =
      (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.generateDescription(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });
}
