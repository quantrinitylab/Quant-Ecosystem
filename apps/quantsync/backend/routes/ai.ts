import type { FastifyInstance } from 'fastify';
import { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import {
  AIContentService,
  PostDraftInputSchema,
  HashtagInputSchema,
  FactCheckInputSchema,
  ContentSuggestionsInputSchema,
} from '../services/ai-content.service';

export default async function aiRoutes(fastify: FastifyInstance) {
  const ai = new AIEngine();
  const service = new AIContentService(ai);

  fastify.post('/draft-post', async (request, reply) => {
    const parseResult = PostDraftInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId = (request as any).auth?.userId || (request as any).user?.id;
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

    const userId = (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.suggestHashtags(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });

  // Assistive only — a verdict here never blocks a post. See AIContentService.factCheck.
  fastify.post('/fact-check', async (request, reply) => {
    const parseResult = FactCheckInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId = (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.factCheck(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });

  // GET: the proxy forwards query params (`?topic=&count=`), not a body.
  fastify.get('/suggestions', async (request, reply) => {
    const parseResult = ContentSuggestionsInputSchema.safeParse(request.query);
    if (!parseResult.success) {
      throw createAppError('Invalid query parameters', 400, 'VALIDATION_ERROR');
    }

    const userId = (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.contentSuggestions(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });
}
