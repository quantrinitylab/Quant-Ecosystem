/**
 * Notification retention (QM fix: notification rows accumulated unboundedly).
 *
 * Before this fix every inbound mail created an in-app `Notification` row with
 * `expiresAt: null`, and nothing ever deleted old rows: the GET list filtered
 * *expired* rows out of the response but never removed them, `expiresAt` was
 * never set on new rows, and the retention sweep only archived/deleted
 * *emails*. The `notifications` table grew by one row per inbound email per
 * user, forever.
 *
 * Retention is now real, in two layers:
 *
 *  1. New inbound-mail notifications get a TTL at creation
 *     (`NEW_MAIL_NOTIFICATION_TTL_DAYS`) — see routes/inbound-webhook.ts.
 *  2. `pruneExpiredNotifications` physically deletes rows whose `expiresAt`
 *     has passed. It runs:
 *       a. lazily on `GET /notifications` (scoped to the caller, before the
 *          list is read), so retention is self-enforcing even when no
 *          scheduler ever fires the retention sweep; and
 *       b. inside `runRetentionSweep` (data-lifecycle.service.ts), so the
 *          system-wide retention pass also reclaims notification rows.
 *
 * The UI also wires the previously dead `DELETE /notifications` (clear-all)
 * into the notifications center behind a confirm dialog, so users can reclaim
 * space deliberately. No fake data anywhere: prune counts come from the
 * actual deleteMany result, and the sweep reports its real count.
 */

export const NEW_MAIL_NOTIFICATION_TTL_DAYS = 30;

export function newMailNotificationExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + NEW_MAIL_NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Minimal prisma surface this service needs. Deliberately narrow so tests can
 * use an in-memory fake and so the data-lifecycle transaction client can be
 * passed straight in.
 */
export interface NotificationPruneDb {
  notification: {
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
  };
}

export interface PruneExpiredOptions {
  /** When set, only this user's expired rows are removed. */
  userId?: string;
  /** Defaults to `new Date()`. */
  now?: Date;
}

/**
 * Delete notification rows whose `expiresAt` is at or before `now`.
 * Rows with `expiresAt: null` are never touched (that column is used for
 * rows that must not expire). Returns the real deleted count.
 */
export async function pruneExpiredNotifications(
  db: NotificationPruneDb,
  options: PruneExpiredOptions = {},
): Promise<number> {
  const { userId, now = new Date() } = options;
  const where: Record<string, unknown> = { expiresAt: { lte: now } };
  if (userId) where.userId = userId;
  const result = await db.notification.deleteMany({ where });
  return result.count;
}
