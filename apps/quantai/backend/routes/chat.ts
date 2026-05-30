import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ChatService } from '../services/chat.service';

const sendMessageSchema = z.object({
  content: z.string().min(1).max(100000),
  attachments: z.array(z.record(z.unknown())).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function chatRoutes(fastify: FastifyInstance) {
  // POST /sessions/:id/messages - Send a message
  fastify.post<{ Params: { id: string } }>('/:id/messages', async (request, reply) => {
    const parseResult = sendMessageSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const engine = (fastify as unknown as { aiEngine: unknown }).aiEngine;
    const service = new ChatService(prisma as never, engine as never);
    const result = await service.sendMessage(
      request.params.id,
      userId,
      parseResult.data.content,
      parseResult.data.attachments,
    );

    return reply.status(201).send({ success: true, data: result });
  });

  // POST /sessions/:id/messages/stream - Stream a message (SSE)
  fastify.post<{ Params: { id: string } }>('/:id/messages/stream', async (request, reply) => {
    const parseResult = sendMessageSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const engine = (fastify as unknown as { aiEngine: unknown }).aiEngine;
    const service = new ChatService(prisma as never, engine as never);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      const stream = service.streamMessage(request.params.id, userId, parseResult.data.content);

      for await (const chunk of stream) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      reply.raw.write('data: [DONE]\n\n');
    } catch {
      reply.raw.write(`data: ${JSON.stringify({ error: 'AI service unavailable' })}\n\n`);
    }

    reply.raw.end();
  });

  // GET /sessions/:id/messages - Get message history
  fastify.get<{ Params: { id: string } }>('/:id/messages', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const engine = (fastify as unknown as { aiEngine: unknown }).aiEngine;
    const service = new ChatService(prisma as never, engine as never);
    const result = await service.getHistory(request.params.id, userId, queryResult.data);

    return reply.send({ success: true, data: result });
  });
}
