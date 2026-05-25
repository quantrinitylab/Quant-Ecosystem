import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { HistoryService } from '../services/history.service';

const addHistorySchema = z.object({
  videoId: z.string(),
  watchDuration: z.number().min(0),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

// Singleton history service (in-memory for now)
const historyService = new HistoryService();

export default async function historyRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = addHistorySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const entry = await historyService.addToHistory(
      userId,
      parseResult.data.videoId,
      parseResult.data.watchDuration,
    );

    return reply.status(201).send({ success: true, data: entry });
  });

  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const result = await historyService.getHistory(userId, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  fastify.delete('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    await historyService.clearHistory(userId);

    return reply.send({ success: true });
  });
}
