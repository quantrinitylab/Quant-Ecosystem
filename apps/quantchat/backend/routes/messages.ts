import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError, enableIdempotency } from '@quant/server-core';
import { MessageService } from '../services/message.service';
import { publishConversationEvent } from '../services/realtime-publisher';

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
  // K4: Idempotency-Key support on message send (and other mutating routes).
  enableIdempotency(fastify);

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

    // K25 — realtime fan-out (contract §18/§19). The REST send path is the
    // primary mutation path; publish a `chat.message.created.v1` envelope so
    // connected sockets receive the message live instead of waiting for a
    // poll. Realtime failure never fails this response (logged inside).
    const sentMessage = message as unknown as {
      id: string;
      conversationId?: string;
      version?: number;
    };
    const sendConversationId =
      typeof sentMessage.conversationId === 'string' && sentMessage.conversationId
        ? sentMessage.conversationId
        : request.params.id;
    void publishConversationEvent(fastify, sendConversationId, {
      eventType: 'chat.message.created.v1',
      resourceRef: sentMessage.id,
      aggregateVersion:
        typeof sentMessage.version === 'number' ? sentMessage.version : 1,
      data: message,
    });

    // QM-UIUX-054: this handler previously called
    // `CrossAppDispatcher.dispatch()` here to "notify" conversation members.
    // That facade only computed routing decisions in memory — it never
    // persisted or sent anything, and the result was discarded — so the call
    // was theater and has been removed with the facade. Durable member
    // notifications, when built, belong in the real path every other app
    // uses: a Prisma `Notification` row (see QuantMail QM-UIUX-052), not a
    // routing-decision calculator. Live delivery to connected clients is
    // already handled above via publishConversationEvent.

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

    // K25 — realtime fan-out for edits (contract §28 `chat.message.updated.v1`).
    const edited = message as unknown as {
      id: string;
      conversationId?: string;
      version?: number;
    };
    if (typeof edited.conversationId === 'string' && edited.conversationId) {
      void publishConversationEvent(fastify, edited.conversationId, {
        eventType: 'chat.message.updated.v1',
        resourceRef: edited.id,
        aggregateVersion: typeof edited.version === 'number' ? edited.version : 1,
        data: message,
      });
    }

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

    // K25 — realtime fan-out for deletes (contract §28 `chat.message.deleted.v1`).
    const deleted = message as unknown as {
      id: string;
      conversationId?: string;
      version?: number;
    };
    if (typeof deleted.conversationId === 'string' && deleted.conversationId) {
      void publishConversationEvent(fastify, deleted.conversationId, {
        eventType: 'chat.message.deleted.v1',
        resourceRef: deleted.id,
        aggregateVersion: typeof deleted.version === 'number' ? deleted.version : 1,
        data: { id: deleted.id, conversationId: deleted.conversationId },
      });
    }

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

  // POST /messages/:id/view-once - Consume a view-once snap (returns 410 on subsequent requests)
  fastify.post<{ Params: { id: string } }>('/messages/:id/view-once', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MessageService(prisma as never);
    const result = await service.consumeSnap(request.params.id, userId);

    return reply.send({ success: true, data: result });
  });

  // GET /messages/:id/view-once - Inspect/consume view-once snap
  fastify.get<{ Params: { id: string } }>('/messages/:id/view-once', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MessageService(prisma as never);
    const result = await service.consumeSnap(request.params.id, userId);

    return reply.send({ success: true, data: result });
  });
}
