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
 *
 * Two gaps remained after the mode landed, closed here:
 * - Per-label overrides (Gmail's Manage Labels → "Notify for every message"):
 *   a label can force notification (`all`) or silence (`none`) for mail
 *   carrying it, without changing the global mode. Stored beside the mode in
 *   `User.preferences`, keyed by label id.
 * - The client-side `PriorityIndicator` urgency heuristic was never consulted
 *   on the notify path: a bulk-categorised mail whose subject screams urgency
 *   ("action required", "deadline") stayed silent under `important`, while the
 *   inbox UI flagged it high. `isImportantMail` now ports that heuristic's
 *   urgency/bulk-marker balance, so the bell and the indicator agree.
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
 * behaviour rather than going silent. Delegates to the combined preferences
 * read so the mode and the label overrides never come from two queries.
 */
export async function readUserMailNotificationMode(
  store: MailNotificationModeStore,
  userId: string,
  log?: WarnLogger,
): Promise<MailNotificationMode> {
  return (await readUserMailNotificationPreferences(store, userId, log)).mode;
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
  /** Subject/snippet for the urgency heuristic (ported from PriorityIndicator). */
  subject?: string | null;
  snippet?: string | null;
}

/**
 * Urgency phrases the client-side `PriorityIndicator` scores as urgent
 * ("urgent", "asap", "action required", "immediate", "deadline", "overdue",
 * "please respond", "waiting for your"). Kept as plain substrings, not a
 * model: the notify path must stay a cheap pure function, and these are the
 * exact phrases the inbox UI already flags.
 */
const URGENCY_PHRASES = [
  'urgent',
  'asap',
  'action required',
  'immediate',
  'deadline',
  'overdue',
  'please respond',
  'waiting for your',
] as const;

/**
 * Bulk markers the same heuristic subtracts for: a "deal ends tonight" promo
 * shouting "urgent" is still bulk. When any marker is present the urgency
 * phrases above do not count — the explicit flags and priority above still
 * do, so a starred newsletter still notifies.
 */
const BULK_MARKERS = [
  'unsubscribe',
  'newsletter',
  'noreply',
  'no-reply',
  'promotional',
  'deal',
] as const;

/** Whether the subject/snippet carries urgency without a bulk marker. */
export function hasUrgentSubject(email: Pick<ImportantMailSignals, 'subject' | 'snippet'>): boolean {
  const combined = `${email.subject ?? ''} ${email.snippet ?? ''}`.toLowerCase();
  if (!combined.trim()) return false;
  if (BULK_MARKERS.some((marker) => combined.includes(marker))) return false;
  return URGENCY_PHRASES.some((phrase) => combined.includes(phrase));
}

/**
 * Whether a mail counts as "important" for the `important` notification mode.
 *
 * Reads the real classification infra the notify path used to ignore:
 * - explicit importance flags (`isImportant`, `isStarred`),
 * - high/urgent priority (case-insensitive — the DB enum is HIGH/URGENT, the
 *   frontend heuristic compares lowercase),
 * - an urgent subject/snippet without bulk markers (the PriorityIndicator
 *   heuristic, ported — a bulk-categorised mail that genuinely demands action
 *   is important even when its partition says bulk),
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
  if (hasUrgentSubject(email)) return true;
  const category = (email.aiCategory ?? email.category ?? 'primary').toLowerCase();
  return category === 'primary';
}

// ---------------------------------------------------------------------------
// Per-label overrides (Gmail's per-label "Notify for every message")
// ---------------------------------------------------------------------------

export const MAIL_NOTIFICATION_LABEL_OVERRIDES = ['all', 'none'] as const;

export type MailNotificationLabelOverride = (typeof MAIL_NOTIFICATION_LABEL_OVERRIDES)[number];

/** The `User.preferences` JSON key the per-label overrides live under. */
export const MAIL_NOTIFICATION_LABEL_OVERRIDES_PREFERENCE_KEY =
  'mailNotificationLabelOverrides';

/** Label id → override. An absent entry means "follow the global mode". */
export type MailNotificationLabelOverrides = Record<string, MailNotificationLabelOverride>;

/** Max overrides per user: a label list is small, and an unbounded JSON map
 *  is a storage and abuse vector. PUTs larger than this are rejected. */
export const MAX_MAIL_NOTIFICATION_LABEL_OVERRIDES = 200;

function isLabelOverride(value: unknown): value is MailNotificationLabelOverride {
  return value === 'all' || value === 'none';
}

/**
 * Normalizes a stored overrides map: non-objects become empty, non-string
 * keys and non-'all'/'none' values are dropped rather than trusted. A corrupt
 * map must never silence mail the user did not ask to silence.
 */
export function normalizeMailNotificationLabelOverrides(
  value: unknown,
): MailNotificationLabelOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const overrides: MailNotificationLabelOverrides = {};
  for (const [labelId, override] of Object.entries(value as Record<string, unknown>)) {
    if (labelId && isLabelOverride(override)) overrides[labelId] = override;
  }
  return overrides;
}

export function readMailNotificationLabelOverridesFromPreferences(
  preferences: unknown,
): MailNotificationLabelOverrides {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return {};
  return normalizeMailNotificationLabelOverrides(
    (preferences as Record<string, unknown>)[MAIL_NOTIFICATION_LABEL_OVERRIDES_PREFERENCE_KEY],
  );
}

/** The label ids on a persisted email row. `Email.labels` is a Json string
 *  array; anything else (legacy rows, partial harnesses) normalizes to []. */
export function readEmailLabelIds(email: { labels?: unknown }): string[] {
  if (!Array.isArray(email.labels)) return [];
  return email.labels.filter((label): label is string => typeof label === 'string' && !!label);
}

export interface MailNotificationPreferences {
  mode: MailNotificationMode;
  overrides: MailNotificationLabelOverrides;
}

/**
 * One store read for the whole notification preference: the webhook used to
 * read the mode with its own query, and a second query for overrides would
 * double the per-mail read on the hottest inbound path.
 */
export async function readUserMailNotificationPreferences(
  store: MailNotificationModeStore,
  userId: string,
  log?: WarnLogger,
): Promise<MailNotificationPreferences> {
  try {
    const user = await store.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    return {
      mode: readMailNotificationModeFromPreferences(user?.preferences),
      overrides: readMailNotificationLabelOverridesFromPreferences(user?.preferences),
    };
  } catch (error) {
    log?.warn(
      { err: error, userId },
      '[mail-notification-mode] notification preferences read failed — notifying as before',
    );
    return { mode: DEFAULT_MAIL_NOTIFICATION_MODE, overrides: {} };
  }
}

/**
 * Persists the overrides map by merging it into the existing `preferences`
 * JSON, so the mode and unrelated keys survive the write.
 */
export async function writeUserMailNotificationLabelOverrides(
  store: MailNotificationModeStore,
  userId: string,
  overrides: MailNotificationLabelOverrides,
): Promise<MailNotificationLabelOverrides> {
  const current = await store.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const merged: Record<string, unknown> =
    current?.preferences && typeof current.preferences === 'object' && !Array.isArray(current.preferences)
      ? { ...(current.preferences as Record<string, unknown>) }
      : {};
  merged[MAIL_NOTIFICATION_LABEL_OVERRIDES_PREFERENCE_KEY] = { ...overrides };
  await store.user.update({ where: { id: userId }, data: { preferences: merged } });
  return { ...overrides };
}

/**
 * The single notify decision for a new mail, in precedence order:
 * 1. Mode `off` is master-off: no label override revives a notification the
 *    user globally silenced — reviving would make "Nothing" a lie.
 * 2. A `none` override on ANY label the mail carries silences it (mute wins
 *    over force-notify: a user muting a noisy label must not be overruled by
 *    a second label's `all`).
 * 3. An `all` override on any carried label forces a notification, even under
 *    `important` — this is Gmail's per-label "Notify for every message".
 * 4. Otherwise the global mode decides (`all` → notify, `important` →
 *    `isImportantMail`).
 *
 * Pure: the webhook, the tests and any future notify path share this exact
 * function, so the bell cannot drift from the setting again.
 */
export function shouldNotifyForMail(
  email: ImportantMailSignals & { labels?: unknown },
  preferences: MailNotificationPreferences,
): boolean {
  if (preferences.mode === 'off') return false;
  const labelIds = readEmailLabelIds(email);
  const carried = labelIds
    .map((labelId) => preferences.overrides[labelId])
    .filter((override): override is MailNotificationLabelOverride => override !== undefined);
  if (carried.includes('none')) return false;
  if (carried.includes('all')) return true;
  if (preferences.mode === 'all') return true;
  return isImportantMail(email);
}
