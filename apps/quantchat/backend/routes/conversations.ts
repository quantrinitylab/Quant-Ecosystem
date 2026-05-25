import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ConversationService } from '../services/conversation.service';

const createConversationSchema = z.object({
  participantIds: z.array(z.string()).min(1),
  type: z.enum(['direct', 'group']),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

const updateConversationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isArchived: z.boolean().optional(),
});

const addMemberSchema = z.object({
  userId: z.string(),
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function conversationsRoutes(fastify: FastifyInstance) {
  // POST /conversations - Create a conversation
  fastify.post('/', async (request, reply) => {
    const parseResult = createConversationSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ConversationService(prisma as never);
    const conversation = await service.createConversation({
      creatorId: userId,
      participantIds: parseResult.data.participantIds,
      type: parseResult.data.type,
      name: parseResult.data.name,
      description: parseResult.data.description,
    });

    return reply.status(201).send({ success: true, data: conversation });
  });

  // GET /conversations - List user conversations
  fastify.get('/', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ConversationService(prisma as never);
    const result = await service.getUserConversations(userId, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  // GET /conversations/:id - Get a conversation
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ConversationService(prisma as never);
    const conversation = await service.getConversation(request.params.id);

    if (!conversation) {
      throw createAppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
    }

    return reply.send({ success: true, data: conversation });
  });

  // PUT /conversations/:id - Update a conversation
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateConversationSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ConversationService(prisma as never);
    const conversation = await service.updateConversation(request.params.id, parseResult.data);

    return reply.send({ success: true, data: conversation });
  });

  // POST /conversations/:id/members - Add a member
  fastify.post<{ Params: { id: string } }>('/:id/members', async (request, reply) => {
    const parseResult = addMemberSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new ConversationService(prisma as never);
    const member = await service.addMember(
      request.params.id,
      parseResult.data.userId,
      parseResult.data.role,
    );

    return reply.status(201).send({ success: true, data: member });
  });

  // DELETE /conversations/:id/members/:userId - Remove a member
  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/:id/members/:userId',
    async (request, reply) => {
      const prisma = (fastify as unknown as { prisma: unknown }).prisma;
      const service = new ConversationService(prisma as never);
      await service.removeMember(request.params.id, request.params.userId);

      return reply.send({ success: true });
    },
  );
}
