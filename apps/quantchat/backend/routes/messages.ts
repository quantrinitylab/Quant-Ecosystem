import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CrossAppDispatcher } from '@quant/notifications';
import { MessageService } from '../services/message.service';

const notifier = new CrossAppDispatcher('quantchat');

const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  type: z
    .enum(['text', 'image', 'video', 'audio', 'file', 'location', 'snap_photo', 'snap_video'])
    .optional(),
  mediaUrl: z.string().optional(),
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

    // Notify conversation participants about the new message. Recipients are
    // resolved from the conversation's active members (excluding the sender);
    // a notification failure must never block message delivery.
    try {
      const memberClient = prisma as {
        conversationMember: {
          findMany: (args: {
            where: { conversationId: string; leftAt: null };
            select: { userId: true };
          }) => Promise<Array<{ userId: string }>>;
        };
      };
      const members = await memberClient.conversationMember.findMany({
        where: { conversationId: request.params.id, leftAt: null },
        select: { userId: true },
      });
      const recipientIds = members.map((m) => m.userId).filter((memberId) => memberId !== userId);

      if (recipientIds.length > 0) {
        notifier.dispatch({
          type: 'message',
          title: `New message in conversation`,
          body: parseResult.data.content.slice(0, 100),
          recipientIds,
          priority: 'normal',
          data: { conversationId: request.params.id, senderId: userId },
        });
      }
    } catch {
      /* notification failure should not block message sending */
    }

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
