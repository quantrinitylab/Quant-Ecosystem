import type { FastifyInstance } from 'fastify';
import { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import {
  AIContentService,
  PostDraftInputSchema,
  HashtagInputSchema,
} from '../services/ai-content.service';

export default async function aiRoutes(fastify: FastifyInstance) {
  const ai = new AIEngine();
  const service = new AIContentService(ai);

  fastify.post('/draft-post', async (request, reply) => {
    const parseResult = PostDraftInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId =
      (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.draftPost(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });

  fastify.post('/hashtags', async (request, reply) => {
    const parseResult = HashtagInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId =
      (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.suggestHashtags(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });
}
