import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { recommendationEngine } from '@quant/recommendations';

const recommendSchema = z.object({
  limit: z.number().min(1).max(50).optional(),
  type: z.enum(['personalized', 'trending', 'similar']).optional(),
});

const contentSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  category: z.string().max(200).optional(),
  tags: z.array(z.string().max(100)).optional(),
  score: z.number().optional(),
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    const parseResult = contentSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const content = parseResult.data;
    const sanitizedContent = {
      ...content,
      id: escapeHtml(content.id),
      title: escapeHtml(content.title),
      description: content.description ? escapeHtml(content.description) : undefined,
      category: content.category ? escapeHtml(content.category) : undefined,
      tags: content.tags?.map((tag) => escapeHtml(tag)),
    };

    await recommendationEngine.addContent(sanitizedContent as any);
    return reply.send({ success: true });
  });
}
