import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { NotificationService } from '../services/notification.service';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function getService(fastify: FastifyInstance): NotificationService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new NotificationService(prisma as never);
}

export default async function notificationsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const userId = getUserId(request);
    const query = paginationSchema.safeParse(request.query);
    if (!query.success) throw query.error;

    const notifications = await getService(fastify).list(userId, query.data);
    return reply.send({ success: true, data: { notifications } });
  });

  fastify.get('/unread-count', async (request, reply) => {
    const userId = getUserId(request);
    const count = await getService(fastify).unreadCount(userId);
    return reply.send({ success: true, data: { count } });
  });

  fastify.post('/read-all', async (request, reply) => {
    const userId = getUserId(request);
    const result = await getService(fastify).markAllRead(userId);
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/read', async (request, reply) => {
    const userId = getUserId(request);
    const result = await getService(fastify).markRead(request.params.id, userId);
    return reply.send({ success: true, data: result });
  });
}
