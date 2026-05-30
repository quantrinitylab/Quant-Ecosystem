import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { UnifiedAIService } from '@quant/ai';

const askBodySchema = z.object({
  question: z.string().min(1, 'Question is required'),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
});

export default async function askRoutes(fastify: FastifyInstance) {
  // POST /api/ask - Single-shot Q&A
  fastify.post('/ask', async (request, reply) => {
    const parseResult = askBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { question, model, systemPrompt } = parseResult.data;
    const service = new UnifiedAIService();

    const response = await service.generateText(question, {
      model,
      systemPrompt,
      userId,
    });

    return reply.send({
      success: true,
      data: {
        answer: response.content,
        model: response.model,
        usage: response.usage,
      },
    });
  });
}
