import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { MessageService } from '../services/message.service';

const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  type: z.enum(['text', 'image', 'video', 'audio', 'file', 'location']).optional(),
  mediaUrl: z.string().url().optional(),
  replyToId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const editMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function messagesRoutes(fastify: FastifyInstance) {
  // POST /conversations/:id/messages - Send a message
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
    const service = new MessageService(prisma as never);
    const message = await service.sendMessage({
      conversationId: request.params.id,
      senderId: userId,
      content: parseResult.data.content,
      type: parseResult.data.type,
      mediaUrl: parseResult.data.mediaUrl,
      replyToId: parseResult.data.replyToId,
      metadata: parseResult.data.metadata,
    });

    return reply.status(201).send({ success: true, data: message });
  });

  // GET /conversations/:id/messages - List messages
  fastify.get<{ Params: { id: string } }>('/:id/messages', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MessageService(prisma as never);
    const result = await service.getMessages(request.params.id, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  // PUT /messages/:id - Edit a message
  fastify.put<{ Params: { id: string } }>('/messages/:id', async (request, reply) => {
    const parseResult = editMessageSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MessageService(prisma as never);
    const message = await service.editMessage(request.params.id, userId, parseResult.data.content);

    return reply.send({ success: true, data: message });
  });

  // DELETE /messages/:id - Delete a message
  fastify.delete<{ Params: { id: string } }>('/messages/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MessageService(prisma as never);
    const message = await service.deleteMessage(request.params.id, userId);

    return reply.send({ success: true, data: message });
  });

  // POST /messages/:id/pin - Pin a message
  fastify.post<{ Params: { id: string } }>('/messages/:id/pin', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MessageService(prisma as never);
    const message = await service.pinMessage(request.params.id, userId);

    return reply.send({ success: true, data: message });
  });
}
