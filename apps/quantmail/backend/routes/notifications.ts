import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { z } from 'zod';
import { getPushPublicKey, isPushConfigured } from '../services/push-delivery.service';
import { pruneExpiredNotifications } from '../services/notification-retention.service';
import {
  MAIL_NOTIFICATION_MODES,
  readUserMailNotificationMode,
  writeUserMailNotificationMode,
} from '../services/mail-notification-mode.service';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  // Opaque cursor paging (QM notifications-pagination fix): the UI used to be
  // hard-capped at one `limit` window while `unreadCount` counted ALL unread,
  // so rows beyond the newest window were unreachable. A cursor is the last
  // row of the previous page, encoded as base64url JSON — no offset, so rows
  // inserted between pages never shift a page boundary, and a forged cursor
  // can only ever narrow the caller's own window (the userId filter applies
  // regardless). `id` breaks createdAt ties deterministically with the
  // matching `id desc` sort below.
  cursor: z.string().optional(),
});

interface NotificationsCursor {
  createdAt: string;
  id: string;
}

function encodeNotificationsCursor(row: { createdAt: Date | string; id: string }): string {
  const createdAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt;
  return Buffer.from(JSON.stringify({ createdAt, id: row.id }), 'utf8').toString('base64url');
}

function decodeNotificationsCursor(cursor: string): NotificationsCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof (parsed as { createdAt?: unknown }).createdAt !== 'string' ||
      typeof (parsed as { id?: unknown }).id !== 'string' ||
      Number.isNaN(Date.parse((parsed as { createdAt: string }).createdAt))
    ) {
      return null;
    }
    return parsed as NotificationsCursor;
  } catch {
    return null;
  }
}

const mailNotificationModeBodySchema = z.object({ mode: z.enum(MAIL_NOTIFICATION_MODES) });

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
    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      throw createAppError('Invalid notifications query', 400, 'VALIDATION_ERROR');
    }
    const { limit, cursor: cursorRaw } = parsedQuery.data;
    const cursor = cursorRaw === undefined ? null : decodeNotificationsCursor(cursorRaw);
    if (cursorRaw !== undefined && cursor === null) {
      throw createAppError('Invalid notifications cursor', 400, 'VALIDATION_ERROR');
    }
    const now = new Date();
    // Retention (QM fix: unbounded accumulation): expired rows are physically
    // removed on read, scoped to the caller. This keeps retention
    // self-enforcing even when the retention sweep never fires — expired
    // rows are already invisible to the list filter below, so removing them
    // changes nothing the caller could see.
    await pruneExpiredNotifications(prisma, { userId, now });
    const active = { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    // Cursor predicate: strictly older than the cursor row (createdAt, then
    // id). Combined with userId + the active filter — never a replacement.
    const cursorWhere = cursor
      ? {
          AND: [
            {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
              ],
            },
          ],
        }
      : {};
    // Fetch one extra row: its presence is what makes `hasMore` true, so
    // the UI never shows a dead "Load more" on the last page.
    const [rows, unreadCount, totalCount] = await Promise.all([
      prisma.notification.findMany({
        where: { ...active, ...cursorWhere },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      prisma.notification.count({ where: { ...active, isRead: false } }),
      prisma.notification.count({ where: active }),
    ]);
    const hasMore = rows.length > limit;
    const notifications = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && notifications.length > 0
        ? encodeNotificationsCursor(notifications[notifications.length - 1])
        : null;
    return reply.send({
      success: true,
      data: { notifications, unreadCount, totalCount, hasMore, nextCursor },
    });
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
  // installation, but a row belongs to its owner: the lookup is scoped by
  // userId, so a re-register with fresher keys refreshes the CALLER's row —
  // and an endpoint that is registered to somebody else is never overwritten
  // or reassigned (BOLA). The caller gets their own row for that endpoint
  // instead; endpoints carry no unique constraint and rows are always read
  // back per userId, so per-user rows are the correct model.
  fastify.post('/push/subscribe', async (request, reply) => {
    const userId = userIdFrom(request);
    const parsed = pushSubscribeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid push subscription payload', 400, 'VALIDATION_ERROR');
    }
    const { endpoint, keys, expirationTime } = parsed.data;
    const expiresAt = expirationTime ? new Date(expirationTime) : null;

    const existing = await prisma.pushSubscription.findFirst({ where: { endpoint, userId } });
    if (existing) {
      await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: { p256dh: keys.p256dh, auth: keys.auth, expiresAt },
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

  // -------------------------------------------------------------------------
  // Mail notification mode (QM: "important mail only" gap).
  //
  // GET /notifications/mail-notification-mode — the caller's mode: 'all' (the
  // old every-mail behaviour, and the default), 'important' (only important
  // mail creates a notification), or 'off' (no mail notifications at all).
  // The inbound webhook reads the same mode before creating a `new_email`
  // notification, so one setting covers the in-app bell, web push, and the
  // desktop watcher's feed.
  // -------------------------------------------------------------------------
  fastify.get('/mail-notification-mode', async (request, reply) => {
    const userId = userIdFrom(request);
    const mode = await readUserMailNotificationMode(prisma, userId, {
      warn: (obj, msg) => fastify.log.warn(obj as object, msg),
    });
    return reply.send({ success: true, data: { mode } });
  });

  // PUT /notifications/mail-notification-mode — change the caller's mode. The
  // mode merges into User.preferences JSON, so unrelated stored keys survive.
  fastify.put('/mail-notification-mode', async (request, reply) => {
    const userId = userIdFrom(request);
    const parsed = mailNotificationModeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid notification mode', 400, 'VALIDATION_ERROR');
    }
    const mode = await writeUserMailNotificationMode(prisma, userId, parsed.data.mode);
    return reply.send({ success: true, data: { mode } });
  });
}
