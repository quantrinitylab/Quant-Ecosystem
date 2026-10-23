// ============================================================================
// QuantChat - Push Notifications Backend Routes (Task 10.2)
//
//   POST /notifications/subscribe  -> store a browser PushSubscription (Req 9.1)
//   POST /notifications/send       -> dispatch a notification to a user's subs
//   GET  /notifications/settings   -> read category toggles
//   PUT  /notifications/settings   -> update category toggles (Req 9.6)
//
//   QC-F-101: durable inbox (Prisma `Notification` rows — the same table the
//   sibling apps write):
//   GET   /notifications          -> the caller's inbox (newest first)
//   POST  /notifications/read-all -> mark the caller's unread rows read
//   PATCH /notifications/:id/read -> mark one of the caller's rows read
//
// Subscriptions persist to the Prisma `PushSubscription` model when a Prisma
// client is decorated on the app; otherwise they fall back to an in-memory
// store so the endpoints remain functional in dev/test. Delivery uses the
// graceful `dispatchNotification` transport (degrades when `web-push` is
// absent — Task 10.2).
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  dispatchNotification,
  type NotificationCategory,
  type NotificationPayload,
  type PushSubscriptionRecord,
} from '../lib/notification-dispatch';
import { resolveNotificationDeepLink } from '../lib/notification-deeplink';
import type { NotificationPrismaLike } from '../services/notification.service';

const CATEGORIES: readonly NotificationCategory[] = [
  'MESSAGES',
  'CALLS',
  'STORIES',
  'STREAKS',
  'REELS',
  'SYSTEM',
];

// --- Schemas --------------------------------------------------------------

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  expirationTime: z.number().nullable().optional(),
});

const subscribeBodySchema = z.object({
  subscription: subscriptionSchema,
});

const sendBodySchema = z.object({
  userId: z.string().min(1).optional(),
  category: z.enum(CATEGORIES as unknown as [NotificationCategory, ...NotificationCategory[]]),
  title: z.string().min(1),
  body: z.string().default(''),
  contentId: z.string().optional(),
  deepLink: z.string().optional(),
  priority: z.enum(['high', 'normal']).default('normal'),
  tag: z.string().optional(),
});

const settingsBodySchema = z.object({
  categories: z.record(
    z.enum(CATEGORIES as unknown as [NotificationCategory, ...NotificationCategory[]]),
    z.boolean(),
  ),
});

// QC-F-101: inbox list query — QuantMail's listQuerySchema style. No silent
// clamping: out-of-range `limit` is a 400, not a quiet correction.
//
// `unreadOnly` is deliberately NOT `z.coerce.boolean()`: coercion maps the
// string 'false' to true (non-empty string), which would silently flip
// `?unreadOnly=false` into an unread-only filter. Only true/'true' counts.
const inboxQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  sourceApp: z.string().min(1).optional(),
  unreadOnly: z.preprocess((v) => v === true || v === 'true', z.boolean()),
});

// --- Auth helper ----------------------------------------------------------

interface AuthedRequest {
  auth?: { userId?: string };
  user?: { id?: string };
}

function getUserId(request: unknown): string | undefined {
  const r = request as AuthedRequest;
  return r.auth?.userId ?? r.user?.id;
}

function requireUserId(request: unknown): string {
  const userId = getUserId(request);
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

// --- Prisma (optional) ----------------------------------------------------

interface PrismaPushClient {
  pushSubscription: {
    upsert: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
}

function getPrisma(fastify: FastifyInstance): PrismaPushClient | null {
  const prisma = (fastify as unknown as { prisma?: PrismaPushClient }).prisma;
  return prisma && prisma.pushSubscription ? prisma : null;
}

// --- QC-F-101: durable inbox prisma ----------------------------------------
// The inbox reads/writes real `Notification` rows. Unlike the push paths
// above there is NO in-memory fallback here: an empty real inbox and "no
// database at all" are two different truths, and conflating them would be
// the old theatre. Delegate missing -> 503 DB_UNAVAILABLE, fail-honest.
function getNotificationPrisma(fastify: FastifyInstance): NotificationPrismaLike | null {
  const prisma = (fastify as unknown as { prisma?: NotificationPrismaLike }).prisma;
  return prisma && prisma.notification ? prisma : null;
}

function requireNotificationPrisma(fastify: FastifyInstance): NotificationPrismaLike {
  const prisma = getNotificationPrisma(fastify);
  if (!prisma) {
    throw createAppError('Database unavailable', 503, 'DB_UNAVAILABLE');
  }
  return prisma;
}

// --- In-memory fallback stores (dev/test) ---------------------------------

const memorySubscriptions = new Map<string, PushSubscriptionRecord[]>();
const memorySettings = new Map<string, Record<NotificationCategory, boolean>>();

function defaultSettings(): Record<NotificationCategory, boolean> {
  return CATEGORIES.reduce(
    (acc, c) => {
      acc[c] = true;
      return acc;
    },
    {} as Record<NotificationCategory, boolean>,
  );
}

async function storeSubscription(
  fastify: FastifyInstance,
  userId: string,
  sub: PushSubscriptionRecord,
): Promise<void> {
  const prisma = getPrisma(fastify);
  if (prisma) {
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        expiresAt: sub.expirationTime ? new Date(sub.expirationTime) : null,
      },
      update: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        expiresAt: sub.expirationTime ? new Date(sub.expirationTime) : null,
      },
    });
    return;
  }
  const list = memorySubscriptions.get(userId) ?? [];
  const filtered = list.filter((s) => s.endpoint !== sub.endpoint);
  filtered.push(sub);
  memorySubscriptions.set(userId, filtered);
}

async function loadSubscriptions(
  fastify: FastifyInstance,
  userId: string,
): Promise<PushSubscriptionRecord[]> {
  const prisma = getPrisma(fastify);
  if (prisma) {
    const rows = await prisma.pushSubscription.findMany({ where: { userId } });
    return rows.map((row) => ({
      endpoint: String(row['endpoint']),
      keys: { p256dh: String(row['p256dh']), auth: String(row['auth']) },
      expirationTime: row['expiresAt'] ? new Date(row['expiresAt'] as string).getTime() : null,
    }));
  }
  return memorySubscriptions.get(userId) ?? [];
}

async function pruneSubscriptions(
  fastify: FastifyInstance,
  userId: string,
  endpoints: string[],
): Promise<void> {
  if (endpoints.length === 0) return;
  const prisma = getPrisma(fastify);
  if (prisma) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: endpoints } },
    });
    return;
  }
  const list = memorySubscriptions.get(userId) ?? [];
  memorySubscriptions.set(
    userId,
    list.filter((s) => !endpoints.includes(s.endpoint)),
  );
}

// --- Routes ---------------------------------------------------------------

export default async function notificationsRoutes(fastify: FastifyInstance) {
  // POST /notifications/subscribe — persist the browser's PushSubscription.
  fastify.post('/subscribe', async (request, reply) => {
    const parsed = subscribeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid subscription payload', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const { subscription } = parsed.data;

    await storeSubscription(fastify, userId, {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      expirationTime: subscription.expirationTime ?? null,
    });

    return reply.status(201).send({ success: true });
  });

  // POST /notifications/send — dispatch to a user's subscribed devices.
  fastify.post('/send', async (request, reply) => {
    const parsed = sendBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid notification payload', 400, 'VALIDATION_ERROR');
    }
    // QC-F-021: the target is the authenticated caller, never a body-supplied
    // stranger. Previously ANY logged-in user could push arbitrary
    // title/body/deepLink notifications to ANY userId (and, at route level,
    // a body userId even skipped the auth requirement entirely). Server-side
    // notifications to other users are dispatched in-process via
    // dispatchNotification (see backend services) and never traverse this
    // HTTP route — no legitimate cross-user caller of this endpoint exists.
    // Identity comes only from verified auth (QC-F-018 pattern).
    const callerId = requireUserId(request);
    const targetUserId = parsed.data.userId ?? callerId;
    if (targetUserId !== callerId) {
      throw createAppError(
        'You can only send notifications to yourself',
        403,
        'FORBIDDEN',
      );
    }

    // Respect the user's per-category toggle (Req 9.6).
    const settings = memorySettings.get(targetUserId) ?? defaultSettings();
    if (settings[parsed.data.category] === false) {
      return reply.send({
        success: true,
        data: { delivered: 0, failed: 0, suppressed: true, reason: 'category-disabled' },
      });
    }

    const subscriptions = await loadSubscriptions(fastify, targetUserId);
    if (subscriptions.length === 0) {
      return reply.send({
        success: true,
        data: { delivered: 0, failed: 0, transportAvailable: false, reason: 'no-subscriptions' },
      });
    }

    const payload: NotificationPayload = {
      userId: targetUserId,
      category: parsed.data.category,
      title: parsed.data.title,
      body: parsed.data.body,
      contentId: parsed.data.contentId,
      // QC-F-142 §3.4: the deep link is computed HERE, server-side, from
      // category + contentId. A caller-supplied `deepLink` is accepted by
      // the schema for compatibility but NEVER trusted: the service
      // worker opens it verbatim, so honouring it would let any caller
      // land the user on a dead route (the old '/notifications' 404) or an
      // arbitrary path. The resolver only ever returns real routes.
      deepLink: resolveNotificationDeepLink(parsed.data.category, parsed.data.contentId),
      priority: parsed.data.priority,
      tag: parsed.data.tag,
    };

    const result = await dispatchNotification(payload, subscriptions);

    // Prune subscriptions the push service reported as gone (Req 9.8).
    if (result.expiredEndpoints.length > 0) {
      await pruneSubscriptions(fastify, targetUserId, result.expiredEndpoints);
    }

    return reply.send({ success: true, data: result });
  });

  // GET /notifications/settings — current category toggles.
  fastify.get('/settings', async (request, reply) => {
    const userId = requireUserId(request);
    const settings = memorySettings.get(userId) ?? defaultSettings();
    return reply.send({ success: true, data: { categories: settings } });
  });

  // PUT /notifications/settings — update category toggles (Req 9.6).
  fastify.put('/settings', async (request, reply) => {
    const parsed = settingsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid settings payload', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const merged = { ...defaultSettings(), ...(memorySettings.get(userId) ?? {}) };
    for (const [category, enabled] of Object.entries(parsed.data.categories)) {
      merged[category as NotificationCategory] = enabled;
    }
    memorySettings.set(userId, merged);
    return reply.send({ success: true, data: { categories: merged } });
  });

  // --- QC-F-101: durable inbox -------------------------------------------
  // Contract (QuantMail's routes/notifications.ts, verbatim vocabulary):
  // identity comes ONLY from auth — there is no userId query/body param,
  // so one caller can never read another's inbox. Expired rows are never
  // listed. Query errors are 400, never silent clamps.

  // GET /notifications — the caller's inbox, newest first.
  fastify.get('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = inboxQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw createAppError('Invalid query parameters', 400, 'VALIDATION_ERROR');
    }
    const prisma = requireNotificationPrisma(fastify);

    const now = new Date();
    const where: Record<string, unknown> = {
      userId,
      // Expired rows exist in the table but never reach a listing (QuantMail :41).
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    if (parsed.data.sourceApp) where['sourceApp'] = parsed.data.sourceApp;
    if (parsed.data.unreadOnly) where['isRead'] = false;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parsed.data.limit,
      }),
      prisma.notification.count({ where }),
    ]);
    const unreadWhere = { ...where, isRead: false };
    const unreadCount = await prisma.notification.count({ where: unreadWhere });

    return reply.send({
      success: true,
      data: { notifications, unreadCount, total },
    });
  });

  // POST /notifications/read-all — mark the caller's unread rows read.
  fastify.post('/read-all', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = requireNotificationPrisma(fastify);

    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return reply.send({ success: true, data: { updated: result.count } });
  });

  // PATCH /notifications/:id/read — mark one row read. Another user's row
  // is 404, not 403: its existence must not leak (QuantMail :58-68).
  fastify.patch('/:id/read', async (request, reply) => {
    const userId = requireUserId(request);
    const { id } = request.params as { id: string };
    const prisma = requireNotificationPrisma(fastify);

    const row = await prisma.notification.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      throw createAppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
    }
    if (row.isRead) {
      return reply.send({ success: true, data: row });
    }
    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    return reply.send({ success: true, data: updated });
  });
}
