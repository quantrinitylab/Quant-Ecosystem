import type { FastifyInstance } from 'fastify';
import {
  AIEngine,
  createMemoryService,
  createInMemoryMemoryDb,
  UserStyleMemory,
  UserContactMemory,
} from '@quant/ai';
import { createAppError } from '@quant/server-core';
import { AISmartRepliesService, SmartReplyInputSchema } from '../services/ai-smart-replies.service';

export default async function aiRoutes(fastify: FastifyInstance) {
  const ai = new AIEngine();

  // Memory composition root: real Prisma with DATABASE_URL, else in-memory.
  const memoryDb = process.env['DATABASE_URL']
    ? ((fastify as unknown as { prisma?: unknown }).prisma ?? createInMemoryMemoryDb())
    : createInMemoryMemoryDb();
  const memoryBackend = createMemoryService({ prisma: memoryDb as never });
  const service = new AISmartRepliesService(
    ai,
    new UserStyleMemory(memoryBackend),
    new UserContactMemory(memoryBackend),
  );

  fastify.post('/smart-replies', async (request, reply) => {
    const parseResult = SmartReplyInputSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId = (request as any).auth?.userId || (request as any).user?.id;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await service.generateReplies(parseResult.data, userId);

    return reply.send({ success: true, data: result });
  });
}
