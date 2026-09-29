import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { DmService } from '../services/dm.service';

// ============================================================================
// QuantNeon Direct-Messages routes (mounted at /dm).
//
//   GET    /dm/conversations                 -> caller's conversations + unread
//   POST   /dm/conversations  { userId }     -> find-or-create a 1:1 DM
//   GET    /dm/conversations/:id/messages    -> messages (membership-gated)
//   POST   /dm/conversations/:id/messages    -> send a text message
//   POST   /dm/conversations/:id/read        -> mark read up to now
//
// All authenticated (the global auth hook rejects anonymous callers).
// ============================================================================

const startSchema = z.object({ userId: z.string().min(1) });
const sendSchema = z.object({ content: z.string().min(1).max(10000) });
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function dmRoutes(fastify: FastifyInstance) {
  const service = () => new DmService((fastify as unknown as { prisma: never }).prisma);

  fastify.get('/conversations', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await service().listConversations(userId);
    return reply.send({ success: true, data });
  });

  fastify.post('/conversations', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = startSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await service().startDirect(userId, parsed.data.userId);
    return reply.status(201).send({ success: true, data });
  });

  fastify.get<{ Params: { id: string } }>('/conversations/:id/messages', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const data = await service().getMessages(userId, request.params.id, parsed.data);
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>(
    '/conversations/:id/messages',
    async (request, reply) => {
      const userId = requireUserId(request);
      const parsed = sendSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;
      const data = await service().sendMessage(userId, request.params.id, parsed.data.content);
      return reply.status(201).send({ success: true, data });
    },
  );

  fastify.post<{ Params: { id: string } }>('/conversations/:id/read', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await service().markRead(userId, request.params.id);
    return reply.send({ success: true, data });
  });
}
