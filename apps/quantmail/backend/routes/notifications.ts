import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { z } from 'zod';

const listQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) });

function userIdFrom(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

export default async function notificationRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma: any }).prisma;

  fastify.get('/', async (request, reply) => {
    const userId = userIdFrom(request);
    const { limit } = listQuerySchema.parse(request.query);
    const active = { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where: active, orderBy: { createdAt: 'desc' }, take: limit }),
      prisma.notification.count({ where: { ...active, isRead: false } }),
    ]);
    return reply.send({ success: true, data: { notifications, unreadCount } });
  });

  fastify.post('/read-all', async (request, reply) => {
    const userId = userIdFrom(request);
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return reply.send({ success: true, data: { updated: result.count } });
  });

  fastify.patch<{ Params: { id: string } }>('/:id/read', async (request, reply) => {
    const userId = userIdFrom(request);
    const notification = await prisma.notification.findUnique({ where: { id: request.params.id } });
    if (!notification || notification.userId !== userId) {
      throw createAppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
    }
    const updated = notification.isRead ? notification : await prisma.notification.update({
      where: { id: notification.id }, data: { isRead: true, readAt: new Date() },
    });
    return reply.send({ success: true, data: updated });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = userIdFrom(request);
    const result = await prisma.notification.deleteMany({ where: { id: request.params.id, userId } });
    if (result.count === 0) throw createAppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
    return reply.send({ success: true, data: { deleted: 1 } });
  });

  fastify.delete('/', async (request, reply) => {
    const userId = userIdFrom(request);
    const result = await prisma.notification.deleteMany({ where: { userId } });
    return reply.send({ success: true, data: { deleted: result.count } });
  });
}
