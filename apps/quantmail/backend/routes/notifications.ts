import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { z } from 'zod';
import { getPushPublicKey, isPushConfigured } from '../services/push-delivery.service';

const listQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) });

// QM-UIUX-053: the browser's `PushSubscription.toJSON()` shape. Deliberately
// no `userId` field — the owner comes from the authenticated session, never
// from the body, so one user can never register (or remove) a subscription
// in somebody else's name. Unknown body fields are stripped by zod.
const pushSubscribeBodySchema = z.object({
  endpoint: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), 'endpoint must be an https URL'),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  expirationTime: z.number().nullable().optional(),
});

const pushUnsubscribeBodySchema = z.object({
  endpoint: z.string().url(),
});

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

  // -------------------------------------------------------------------------
  // Web Push subscriptions (QM-UIUX-053). Registration persists even when the
  // server has no VAPID keys yet: the row is real either way, delivery is
  // what waits on provisioning (see services/push-delivery.service.ts).
  // -------------------------------------------------------------------------

  // GET /notifications/push/vapid-public-key — what the browser needs to
  // subscribe, and whether the server can deliver at all yet.
  fastify.get('/push/vapid-public-key', async (request, reply) => {
    userIdFrom(request);
    return reply.send({
      success: true,
      data: { configured: isPushConfigured(), publicKey: getPushPublicKey() },
    });
  });

  // POST /notifications/push/subscribe — register (or refresh) this browser's
  // subscription for the signed-in user. The endpoint identifies the browser
  // installation, so a re-register with fresher keys updates the same row —
  // including handing it to whoever is signed in on that browser now.
  fastify.post('/push/subscribe', async (request, reply) => {
    const userId = userIdFrom(request);
    const parsed = pushSubscribeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid push subscription payload', 400, 'VALIDATION_ERROR');
    }
    const { endpoint, keys, expirationTime } = parsed.data;
    const expiresAt = expirationTime ? new Date(expirationTime) : null;

    const existing = await prisma.pushSubscription.findFirst({ where: { endpoint } });
    if (existing) {
      await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: { userId, p256dh: keys.p256dh, auth: keys.auth, expiresAt },
      });
    } else {
      await prisma.pushSubscription.create({
        data: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, expiresAt },
      });
    }
    return reply.status(201).send({ success: true, data: { subscribed: true } });
  });

  // POST /notifications/push/unsubscribe — remove the caller's own
  // subscription for one endpoint. Scoped by userId: naming somebody else's
  // endpoint removes nothing.
  fastify.post('/push/unsubscribe', async (request, reply) => {
    const userId = userIdFrom(request);
    const parsed = pushUnsubscribeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid push unsubscribe payload', 400, 'VALIDATION_ERROR');
    }
    const result = await prisma.pushSubscription.deleteMany({
      where: { userId, endpoint: parsed.data.endpoint },
    });
    return reply.send({ success: true, data: { removed: result.count } });
  });
}
