import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { NotificationService } from '../services/notification.service';

// ============================================================================
// QuantSync notification routes (mounted at /notifications).
//
//   GET  /notifications              -> the caller's notifications (paginated)
//   GET  /notifications/unread-count -> { count } of unread notifications
//   POST /notifications/:id/read     -> mark one read (ownership-checked)
//   POST /notifications/read-all     -> mark all of the caller's unread read
//
// All routes are authenticated (the global auth hook rejects anonymous
// callers). `/unread-count` and `/read-all` are static and declared before any
// dynamic path so they can never be shadowed by `/:id/...`.
// ============================================================================

const paginationSchema = z.object({
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

function service(fastify: FastifyInstance): NotificationService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new NotificationService(prisma as never);
}

export default async function notificationsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const data = await service(fastify).list(userId, {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
    return reply.send({ success: true, data });
  });

  fastify.get('/unread-count', async (request, reply) => {
    const userId = requireUserId(request);
    const count = await service(fastify).unreadCount(userId);
    return reply.send({ success: true, data: { count } });
  });

  fastify.post('/read-all', async (request, reply) => {
    const userId = requireUserId(request);
    const result = await service(fastify).markAllRead(userId);
    return reply.send({ success: true, data: result });
  });

  fastify.post<{ Params: { id: string } }>('/:id/read', async (request, reply) => {
    const userId = requireUserId(request);
    const notification = await service(fastify).markRead(userId, request.params.id);
    return reply.send({ success: true, data: { notification } });
  });
}
