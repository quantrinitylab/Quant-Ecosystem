/**
 * Mail notification modes — the "important mail only" gap.
 *
 * Gmail's Desktop notifications offer three modes: new-mail on, important-mail
 * on, off. QuantMail had a single all-or-nothing key and the inbound webhook
 * created a `new_email` notification (in-app row + web push, which is also the
 * feed the desktop-alert watcher polls) for every non-quarantined message —
 * the real classification infra (`aiCategory` persisted at ingest, `isStarred`,
 * `priority`) was never consulted on the notify path.
 *
 * The mode is one per-user preference stored inside `User.preferences` JSON, so
 * no schema migration is needed. It is the single enforcement point: the
 * inbound webhook reads it before creating the notification, which covers the
 * in-app bell, web push, and the desktop watcher's feed at once.
 */

export const MAIL_NOTIFICATION_MODES = ['all', 'important', 'off'] as const;

export type MailNotificationMode = (typeof MAIL_NOTIFICATION_MODES)[number];

/** Backwards-compatible default: before this mode existed, every non-quarantined
 *  mail notified. An unset or unrecognised stored value must keep that behaviour. */
export const DEFAULT_MAIL_NOTIFICATION_MODE: MailNotificationMode = 'all';

/** The `User.preferences` JSON key this mode lives under. */
export const MAIL_NOTIFICATION_MODE_PREFERENCE_KEY = 'mailNotificationMode';

export function normalizeMailNotificationMode(value: unknown): MailNotificationMode {
  return value === 'all' || value === 'important' || value === 'off'
    ? value
    : DEFAULT_MAIL_NOTIFICATION_MODE;
}

export function readMailNotificationModeFromPreferences(
  preferences: unknown,
): MailNotificationMode {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return DEFAULT_MAIL_NOTIFICATION_MODE;
  }
  return normalizeMailNotificationMode(
    (preferences as Record<string, unknown>)[MAIL_NOTIFICATION_MODE_PREFERENCE_KEY],
  );
}

interface WarnLogger {
  warn(obj: unknown, msg: string): void;
}

/** Structural view of the Prisma delegates this module touches. */
export interface MailNotificationModeStore {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { preferences: true };
    }): Promise<{ preferences: unknown } | null>;
    update(args: {
      where: { id: string };
      data: { preferences: unknown };
    }): Promise<unknown>;
  };
}

/**
 * The user's mode, or the fail-open default. A mode read must never cost the
 * user a notification: any store failure keeps the old all-or-nothing
 * behaviour rather than going silent.
 */
export async function readUserMailNotificationMode(
  store: MailNotificationModeStore,
  userId: string,
  log?: WarnLogger,
): Promise<MailNotificationMode> {
  try {
    const user = await store.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    return readMailNotificationModeFromPreferences(user?.preferences);
  } catch (error) {
    log?.warn(
      { err: error, userId },
      '[mail-notification-mode] mode read failed — notifying as before',
    );
    return DEFAULT_MAIL_NOTIFICATION_MODE;
  }
}

/**
 * Persists the mode by merging it into the existing `preferences` JSON, so
 * unrelated keys the user (or other features) stored there survive the write.
 */
export async function writeUserMailNotificationMode(
  store: MailNotificationModeStore,
  userId: string,
  mode: MailNotificationMode,
): Promise<MailNotificationMode> {
  const current = await store.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const merged: Record<string, unknown> =
    current?.preferences && typeof current.preferences === 'object' && !Array.isArray(current.preferences)
      ? { ...(current.preferences as Record<string, unknown>) }
      : {};
  merged[MAIL_NOTIFICATION_MODE_PREFERENCE_KEY] = mode;
  await store.user.update({ where: { id: userId }, data: { preferences: merged } });
  return mode;
}

/** The importance signals the notify path can read off a persisted email. */
export interface ImportantMailSignals {
  isImportant?: boolean | null;
  isStarred?: boolean | null;
  priority?: string | null;
  /** The smart-inbox partition persisted at ingest (primary/social/promotions/updates/forums). */
  aiCategory?: string | null;
  /** Fallback when the row was written before `aiCategory` existed. */
  category?: string | null;
}

/**
 * Whether a mail counts as "important" for the `important` notification mode.
 *
 * Reads the real classification infra the notify path used to ignore:
 * - explicit importance flags (`isImportant`, `isStarred`),
 * - high/urgent priority (case-insensitive — the DB enum is HIGH/URGENT, the
 *   frontend heuristic compares lowercase),
 * - otherwise the smart-inbox partition: `primary` is personal mail, everything
 *   else (updates, promotions, social, forums) is bulk by construction.
 *
 * Uncategorized mail lands as Primary at ingest (fail-open), so a missing
 * category notifies rather than going silent — same bias as the ingest path.
 */
export function isImportantMail(email: ImportantMailSignals): boolean {
  if (email.isImportant) return true;
  if (email.isStarred) return true;
  const priority = (email.priority ?? '').toUpperCase();
  if (priority === 'HIGH' || priority === 'URGENT') return true;
  const category = (email.aiCategory ?? email.category ?? 'primary').toLowerCase();
  return category === 'primary';
}
