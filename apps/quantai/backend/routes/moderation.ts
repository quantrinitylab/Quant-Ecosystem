import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { moderationEngine } from '@quant/moderation';

export default async function moderationRoutes(fastify: FastifyInstance) {
  fastify.post('/moderate', async (request, reply) => {
    const content = request.body as any;

    try {
      const result = await moderationEngine.moderateContent(content);
      return reply.send(result);
    } catch (error: any) {
      throw createAppError(error.message, 500, 'MODERATION_ERROR');
    }
  });

  fastify.post('/batch', async (request, reply) => {
    const { contents } = request.body as any;

    try {
      const results = await moderationEngine.batchModerate(contents);
      return reply.send(results);
    } catch (error: any) {
      throw createAppError(error.message, 500, 'MODERATION_ERROR');
    }
  });

  fastify.post('/banned-words', async (request, reply) => {
    const { word } = request.body as any;
    moderationEngine.addBannedWord(word);
    return reply.send({ success: true });
  });
}
