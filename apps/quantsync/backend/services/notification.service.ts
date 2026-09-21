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
  /**
   * Optional, like `notification.create`: only the preference endpoints need it, so existing
   * callers that inject a notification-only mock keep working.
   */
  user?: {
    findUnique: (args: Record<string, unknown>) => Promise<any>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
}

/**
 * Per-channel notification switches.
 *
 * Persisted inside the existing `User.preferences` JSON column under a `notifications` key,
 * so no schema change is needed and unrelated preference namespaces are preserved on write.
 */
export interface NotificationPreferences {
  push: boolean;
  email: boolean;
  mentions: boolean;
  replies: boolean;
  follows: boolean;
  likes: boolean;
  reposts: boolean;
  spaces: boolean;
}

/** Opt-in by default for social signals; email stays off until explicitly enabled. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push: true,
  email: false,
  mentions: true,
  replies: true,
  follows: true,
  likes: true,
  reposts: true,
  spaces: true,
};

const PREFERENCES_KEY = 'notifications';

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
   * Mark a specific set of notifications read.
   *
   * Scoped by `userId` as well as id, so a caller cannot flip someone else's rows by guessing
   * ids. Returns how many were actually flipped; unknown or already-read ids are ignored
   * rather than erroring, which keeps the call idempotent.
   */
  async markManyRead(userId: string, notificationIds: string[]): Promise<{ updated: number }> {
    const ids = Array.from(
      new Set((notificationIds ?? []).filter((id) => typeof id === 'string' && id.trim())),
    );
    if (ids.length === 0) return { updated: 0 };

    const result = await this.prisma.notification.updateMany({
      where: { userId, id: { in: ids }, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  /** Require the optional `user` delegate, with a clear error when it is absent. */
  private userDelegate() {
    const delegate = this.prisma.user;
    if (!delegate) {
      throw createAppError(
        'Notification preferences are not available: no user delegate',
        500,
        'NOT_SUPPORTED',
      );
    }
    return delegate;
  }

  /** Read the caller's preferences, filling any unset switch from the defaults. */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const user = await this.userDelegate().findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!user) {
      throw createAppError('User not found', 404, 'USER_NOT_FOUND');
    }
    return NotificationService.mergePreferences(user.preferences);
  }

  /**
   * Update preferences with a partial patch.
   *
   * Reads the whole `preferences` object and writes it back with only the `notifications` key
   * replaced, so other namespaces stored in that column are not clobbered.
   */
  async updatePreferences(
    userId: string,
    patch: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const delegate = this.userDelegate();
    const user = await delegate.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!user) {
      throw createAppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const current = NotificationService.mergePreferences(user.preferences);
    const next: NotificationPreferences = { ...current };
    for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES) as Array<
      keyof NotificationPreferences
    >) {
      const value = patch[key];
      if (typeof value === 'boolean') next[key] = value;
    }

    const existing =
      typeof user.preferences === 'object' && user.preferences !== null
        ? (user.preferences as Record<string, unknown>)
        : {};

    await delegate.update({
      where: { id: userId },
      data: { preferences: { ...existing, [PREFERENCES_KEY]: next } },
    });

    return next;
  }

  /** Coerce a stored `preferences` blob into a complete, boolean-only preference set. */
  private static mergePreferences(stored: unknown): NotificationPreferences {
    const root =
      typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
    const raw = root[PREFERENCES_KEY];
    const saved = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

    const merged = { ...DEFAULT_NOTIFICATION_PREFERENCES };
    for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES) as Array<
      keyof NotificationPreferences
    >) {
      if (typeof saved[key] === 'boolean') merged[key] = saved[key] as boolean;
    }
    return merged;
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
