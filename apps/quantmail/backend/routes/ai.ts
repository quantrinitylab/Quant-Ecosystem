import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AIEmailService } from '../services/ai-email.service';
import { MailAIService } from '@quant/ai';
import { AIEngine } from '@quant/ai';

const composeAssistSchema = z.object({
  instructions: z.string().min(1).max(2000),
  context: z
    .object({
      recipient: z.string().optional(),
      subject: z.string().optional(),
      tone: z.string().optional(),
    })
    .optional(),
});

export default async function aiRoutes(fastify: FastifyInstance) {
  function getAIService(): AIEmailService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const engine = new AIEngine();
    const mailAI = new MailAIService(engine);
    return new AIEmailService(prisma as never, mailAI);
  }

  // POST /emails/:id/summarize
  fastify.post<{ Params: { id: string } }>('/:id/summarize', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const service = getAIService();
    const result = await service.summarize(request.params.id, userId);

    return reply.send({ success: true, data: result });
  });

  // POST /emails/compose-assist
  fastify.post('/compose-assist', async (request, reply) => {
    const parseResult = composeAssistSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const service = getAIService();
    const result = await service.composeAssistant(
      userId,
      parseResult.data.instructions,
      parseResult.data.context ?? {},
    );

    return reply.send({ success: true, data: result });
  });

  // POST /emails/:id/classify-priority
  fastify.post<{ Params: { id: string } }>('/:id/classify-priority', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const service = getAIService();
    const result = await service.classifyPriority(request.params.id, userId);

    return reply.send({ success: true, data: result });
  });

  // POST /emails/:id/detect-phishing
  fastify.post<{ Params: { id: string } }>('/:id/detect-phishing', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const service = getAIService();
    const result = await service.detectPhishing(request.params.id, userId);

    return reply.send({ success: true, data: result });
  });

  // GET /emails/:id/reply-suggestions
  fastify.get<{ Params: { id: string } }>('/:id/reply-suggestions', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const service = getAIService();
    const result = await service.suggestReplies(request.params.id, userId);

    return reply.send({ success: true, data: result });
  });
}
