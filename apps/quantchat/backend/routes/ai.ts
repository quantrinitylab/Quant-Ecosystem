import type { FastifyInstance } from 'fastify';
import { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import {
  AISmartRepliesService,
  SmartReplyInputSchema,
} from '../services/ai-smart-replies.service';

export default async function aiRoutes(fastify: FastifyInstance) {
  const ai = new AIEngine();
  const service = new AISmartRepliesService(ai);

  fastify.post('/smart-replies', async (request, reply) => {
    const parseResult = SmartReplyInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId =
      (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.generateReplies(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });
}
