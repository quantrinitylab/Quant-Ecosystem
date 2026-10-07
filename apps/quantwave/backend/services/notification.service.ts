// ============================================================================
// QuantSync - Notification Service
// ============================================================================
//
// The shared `Notification` Prisma model existed but QuantSync's backend never
// read from or wrote to it, so users had no way to list or read their
// notifications. This service wires that model into QuantSync with a durable,
// Prisma-backed, fully user-scoped surface:
//
//   - list(userId, { page?, pageSize? }) -> the user's notifications, newest
//     first, paginated.
//   - unreadCount(userId)                -> how many are still unread.
//   - markRead(userId, notificationId)   -> ownership-checked single read
//     (404 if missing, 403 if owned by someone else); idempotent.
//   - markAllRead(userId)                -> bulk-clears the user's unread
//     notifications; returns how many it flipped.
//   - notify(...)                        -> optional create helper so future
//     emitters (likes, follows, comments) have a single typed entry point.
//
// DI'd narrow prisma surface (findMany/count/update/updateMany) so the whole
// thing is unit-testable against a mock with no real database.

import { createAppError } from '@quant/server-core';

/** Client-facing shape of a single notification. */
export interface ShapedNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  actionUrl: string | null;
  sourceApp: string | null;
  sourceUserId: string | null;
  sourceEntityId: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationListOptions {
  page?: number;
  pageSize?: number;
}

export interface NotificationListResult {
  notifications: ShapedNotification[];
  page: number;
  pageSize: number;
}

/** Payload accepted by the optional `notify` create helper. */
export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  actionUrl?: string | null;
  sourceApp?: string | null;
  sourceUserId?: string | null;
  sourceEntityId?: string | null;
}

/**
 * Narrow Prisma surface this service depends on — only the `notification`
 * model and only the operations actually used. The real PrismaClient from
 * `@prisma/client` satisfies this at runtime; tests inject a mock.
 */
export interface NotificationPrisma {
  notification: {
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
    create?: (args: { data: Record<string, unknown> }) => Promise<any>;
  };
}

const DEFAULT_PAGE_SIZE = 30;

function shape(row: any): ShapedNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title ?? '',
    body: row.body ?? null,
    imageUrl: row.imageUrl ?? null,
    actionUrl: row.actionUrl ?? null,
    sourceApp: row.sourceApp ?? null,
    sourceUserId: row.sourceUserId ?? null,
    sourceEntityId: row.sourceEntityId ?? null,
    isRead: row.isRead ?? false,
    readAt: row.readAt ?? null,
    createdAt: row.createdAt,
  };
}

export class NotificationService {
  constructor(private readonly prisma: NotificationPrisma) {}

  /** The caller's notifications, newest first, paginated and user-scoped. */
  async list(
    userId: string,
    options: NotificationListOptions = {},
  ): Promise<NotificationListResult> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE));
    const skip = (page - 1) * pageSize;

    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    });

    return { notifications: rows.map(shape), page, pageSize };
  }

  /** Count of the caller's still-unread notifications. */
  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  /**
   * Mark a single notification read. Ownership-checked: 404 when the
   * notification does not exist, 403 when it belongs to another user.
   * Idempotent — marking an already-read notification just returns it.
   */
  async markRead(userId: string, notificationId: string): Promise<ShapedNotification> {
    const existing = await this.prisma.notification.findMany({
      where: { id: notificationId },
      take: 1,
    });
    const row = existing[0];
    if (!row) {
      throw createAppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
    }
    if (row.userId !== userId) {
      throw createAppError('You do not have access to this notification', 403, 'FORBIDDEN');
    }

    // Idempotent: already-read notifications need no write.
    if (row.isRead) {
      return shape(row);
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
    return shape(updated);
  }

  /**
   * Mark all of the caller's unread notifications read in one statement.
   * Returns how many rows were flipped (0 when there was nothing unread).
   */
  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  /**
   * Optional create helper for future in-app emitters (likes, follows,
   * comments). Not used by any route yet, but gives emitters a single typed
   * entry point so they never touch the Prisma model directly.
   */
  async notify(input: CreateNotificationInput): Promise<ShapedNotification> {
    if (!this.prisma.notification.create) {
      throw createAppError('Notification creation is not supported', 500, 'NOT_SUPPORTED');
    }
    const created = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        imageUrl: input.imageUrl ?? null,
        actionUrl: input.actionUrl ?? null,
        sourceApp: input.sourceApp ?? null,
        sourceUserId: input.sourceUserId ?? null,
        sourceEntityId: input.sourceEntityId ?? null,
      },
    });
    return shape(created);
  }
}
