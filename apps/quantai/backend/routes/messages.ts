import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ChatService, type AIEngineInterface } from '../services/chat.service';

const feedbackSchema = z.object({
  // 'POSITIVE' | 'NEGATIVE' to set, null to clear.
  feedback: z.union([z.enum(['POSITIVE', 'NEGATIVE']), z.null()]),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(100000),
  attachments: z.array(z.record(z.string(), z.unknown())).optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

/**
 * Message-scoped routes mounted under the /sessions prefix. Persisted chat:
 * history + send (both backed by ChatService -> AISession/AIMessage), token
 * streaming over SSE, plus thumbs-up / thumbs-down feedback on assistant
 * messages.
 */
export default async function messagesRoutes(fastify: FastifyInstance) {
  function getService(): ChatService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const engine = (fastify as unknown as { aiEngine?: AIEngineInterface }).aiEngine;
    return new ChatService(prisma as never, engine);
  }

  // GET /sessions/:id/messages - Paginated message history for a conversation
  fastify.get<{ Params: { id: string } }>('/:id/messages', async (request, reply) => {
    const queryResult = historyQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }
    const userId = getUserId(request);
    const result = await getService().getHistory(request.params.id, userId, queryResult.data);
    return reply.send({ success: true, data: result });
  });

  // POST /sessions/:id/messages - Persist a user message, generate + persist the reply
  fastify.post<{ Params: { id: string } }>('/:id/messages', async (request, reply) => {
    const parseResult = sendMessageSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const userId = getUserId(request);
    const { content, attachments } = parseResult.data;
    const result = await getService().sendMessage(request.params.id, userId, content, attachments);
    return reply.status(201).send({ success: true, data: result });
  });

  // POST /sessions/:id/messages/stream - Stream the reply token-by-token over SSE
  // while persisting both the user message and the final assistant message.
  fastify.post<{ Params: { id: string } }>('/:id/messages/stream', async (request, reply) => {
    const parseResult = sendMessageSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    // Auth + validation happen BEFORE hijacking so failures return normal JSON.
    const userId = getUserId(request);
    const { content } = parseResult.data;

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const write = (payload: unknown) => raw.write(`data: ${JSON.stringify(payload)}\n\n`);

    try {
      for await (const chunk of getService().streamMessage(request.params.id, userId, content)) {
        if (chunk.content) write({ content: chunk.content });
      }
    } catch (err) {
      const e = err as { statusCode?: number; code?: string; message?: string };
      write({ error: e.message ?? 'Stream failed', code: e.code ?? 'STREAM_ERROR' });
    } finally {
      raw.write('data: [DONE]\n\n');
      raw.end();
    }
  });

  // POST /sessions/:id/messages/:messageId/feedback
  fastify.post<{ Params: { id: string; messageId: string } }>(
    '/:id/messages/:messageId/feedback',
    async (request, reply) => {
      const parseResult = feedbackSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      const userId = getUserId(request);
      const message = await getService().setFeedback(
        request.params.id,
        userId,
        request.params.messageId,
        parseResult.data.feedback,
      );

      return reply.send({ success: true, data: message });
    },
  );
}
