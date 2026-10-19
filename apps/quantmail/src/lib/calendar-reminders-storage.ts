/**
 * calendar-reminders-storage.ts
 *
 * Persistence for CalendarScheduleSubView's reminders tab.
 *
 * There is NO backend endpoint for these (verified in backend/routes/calendar.ts:
 * calendars/events/booking-links only — nothing for reminders). Same
 * fake-success class as the water/log trackers fixed in PR #1065: the
 * "Reminder created" success toast fired on session-local useState, so a
 * refresh wiped everything the user was told was created. Reminders now
 * persist in localStorage, per-user (not date-scoped — a reminder set for
 * later must still be there tomorrow).
 *
 * Contract for the UI: a "Reminder created" success toast may ONLY be shown
 * after the corresponding save*() call returned true. When storage is
 * unavailable (private mode, quota, SSR), the callers must surface an honest
 * error toast instead of claiming a reminder was recorded.
 */

import { safeStorage, type StorageLike } from './calendar-trackers-storage';

export type { StorageLike };
export { safeStorage };

export interface StoredReminder {
  id: string;
  title: string;
  dueTime: string;
  priority: 'urgent' | 'medium' | 'low';
  completed: boolean;
  /**
   * ISO-8601 timestamp until which this reminder is snoozed. Snoozing NEVER
   * overwrites dueTime — the original due time stays intact and the UI
   * renders a separate "snoozed until HH:MM" indicator while this is in
   * the future. Absent (or in the past) = not snoozed.
   */
  snoozedUntil?: string;
}

const VALID_PRIORITIES = ['urgent', 'medium', 'low'] as const;

/** Per-user key so two accounts on one browser don't see each other's reminders. */
export function reminderKey(userId: string): string {
  return `quant_calendar_reminders:${userId || 'anon'}`;
}

function readJson(storage: StorageLike | null, key: string): unknown {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(key);
    if (raw == null) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeJson(storage: StorageLike | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isValidReminder(item: unknown): item is StoredReminder {
  if (!item || typeof item !== 'object') return false;
  const r = item as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.title === 'string' &&
    r.title.length > 0
  );
}

function normalizeReminder(item: StoredReminder): StoredReminder {
  const out: StoredReminder = {
    id: item.id,
    title: item.title,
    dueTime: typeof item.dueTime === 'string' && item.dueTime.length > 0 ? item.dueTime : 'Today, 6:00 PM',
    priority: (VALID_PRIORITIES as readonly string[]).includes(item.priority) ? item.priority : 'medium',
    // StoredReminder.completed is typed boolean, but parsed payloads may
    // carry truthy junk — only literal true survives normalization.
    completed: item.completed === (true as boolean),
  };
  // Keep a snooze only when it is a real timestamp still in the future.
  // Invalid ISO junk is dropped (never shown as a fake snooze), and an
  // expired snooze is cleared — a snooze that already elapsed is no longer
  // a snooze, and keeping it would lie about the reminder's state.
  const until = typeof item.snoozedUntil === 'string' ? Date.parse(item.snoozedUntil) : NaN;
  if (Number.isFinite(until) && until > Date.now()) out.snoozedUntil = item.snoozedUntil;
  return out;
}

/**
 * Loads the user's reminders. Corrupt entries are dropped, never shown as
 * real data; corrupt payloads degrade to [].
 */
export function loadReminders(storage: StorageLike | null, key: string): StoredReminder[] {
  const parsed = readJson(storage, key);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidReminder).map(normalizeReminder);
}

/**
 * Persists the reminders list. Returns true only when the write landed —
 * the UI must toast success only on true.
 */
export function saveReminders(storage: StorageLike | null, key: string, reminders: StoredReminder[]): boolean {
  if (!Array.isArray(reminders)) return false;
  return writeJson(storage, key, reminders.map(normalizeReminder));
}

// ---------------------------------------------------------------------------
// Account binding
//
// The reminders list (and the add-form/filter state around it) is BOUND to
// the account identity. Two hazards this closes (CODEX-REVIEW 6167418183 on
// #1159):
//  1. A->B account transition on one mounted instance: the storage key was
//     recomputed from the new userId on every render while the list state
//     was only loaded once at mount, so the next toggle/snooze/delete/add
//     wrote A's stale list under B's newly computed key, destroying B's
//     stored list (and A's list rendered under B's identity).
//  2. Unresolved auth (empty userId): reads/writes fell into the shared
//     `anon` bucket, so an anonymous list could be written over an
//     authenticated account's list on hydration.
// The component keys its inner remount boundary by the resolved account and
// rebinds during render as defense-in-depth; unresolved auth renders an
// honest gate and every action call site refuses a null key.
// ---------------------------------------------------------------------------

/**
 * Resolves the account identity reminders bind to. Returns null when auth is
 * unresolved (empty/blank id) — callers must GATE (honest sign-in state, no
 * action controls) instead of touching the shared `anon` bucket.
 */
export function resolveReminderAccount(userId: string | null | undefined): string | null {
  const raw = userId ?? '';
  return raw.trim().length > 0 ? raw : null;
}

export interface ReminderAccountBinding {
  /** Account the list below was loaded for; null when auth is unresolved. */
  accountId: string | null;
  /** Storage key for that account; null when unresolved (never the anon bucket). */
  key: string | null;
  /** The list to render. Empty — never another account's — while unresolved. */
  list: StoredReminder[];
}

/**
 * (Re)binds reminders state to the current account identity. Returns the
 * existing binding untouched when the account is unchanged, so steady-state
 * renders never re-read storage. On an account change it loads the NEW
 * account's list fresh — the caller must discard the old list and never
 * write it under the new key.
 */
export function bindRemindersToAccount(
  storage: StorageLike | null,
  userId: string | null | undefined,
  current: ReminderAccountBinding | null,
): ReminderAccountBinding {
  const accountId = resolveReminderAccount(userId);
  if (current && current.accountId === accountId) return current;
  const key = accountId ? reminderKey(accountId) : null;
  return { accountId, key, list: key ? loadReminders(storage, key) : [] };
}

// ---------------------------------------------------------------------------
// Persist-then-toast action helpers
//
// The handlers in CalendarScheduleSubView delegate to these. Keeping the
// persist/toast decision in a pure, DOM-free function means the honesty
// contract ("success toast ONLY after the write landed") is pinned by unit
// tests without jsdom or @testing-library/react — neither is a dependency of
// this package, so tests that import them fail CI's frozen-lockfile gate
// ("Cannot find package jsdom") even when they pass locally.
// ---------------------------------------------------------------------------

export type ReminderToastType = 'success' | 'info' | 'error';

export interface ReminderToastSpec {
  text: string;
  type: ReminderToastType;
}

export interface ReminderAction {
  /** The list the UI should display after this action. */
  next: StoredReminder[];
  /** True only when the write landed — the success toast may fire only then. */
  persisted: boolean;
  /**
   * The exact toast the UI must show (honest by construction), or null when
   * nothing happened (e.g. unknown id) and no toast should fire at all.
   */
  toast: ReminderToastSpec | null;
}

export interface NewReminderInput {
  title: string;
  dueTime: string;
  priority: 'urgent' | 'medium' | 'low';
}

/**
 * Create a reminder: writes FIRST, then reports which toast the UI must
 * show. Mirrors the component's handleAddReminder (prepend order, same id
 * scheme). On write failure the returned list is the unchanged current list
 * so the UI cannot display a reminder that was never stored.
 */
export function applyCreateReminder(
  storage: StorageLike | null,
  key: string,
  current: StoredReminder[],
  input: NewReminderInput,
): ReminderAction {
  const item: StoredReminder = {
    id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    dueTime: input.dueTime,
    priority: input.priority,
    completed: false,
  };
  const next = [item, ...current];
  const persisted = saveReminders(storage, key, next);
  if (!persisted) {
    return {
      next: current,
      persisted,
      toast: { text: 'Could not save reminder — storage unavailable', type: 'error' },
    };
  }
  return { next, persisted, toast: { text: `Reminder created: "${item.title}"`, type: 'success' } };
}

/**
 * Toggle a reminder's completed flag: writes FIRST. On write failure the
 * 'info' toast ("Completed: ...") must NOT fire — claiming a state change
 * that was never stored is the same fake-success class.
 */
export function applyToggleReminder(
  storage: StorageLike | null,
  key: string,
  current: StoredReminder[],
  id: string,
): ReminderAction {
  const target = current.find((r) => r.id === id);
  if (!target) return { next: current, persisted: true, toast: null };
  const next = current.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r));
  const toggled = next.find((r) => r.id === id)!;
  const persisted = saveReminders(storage, key, next);
  if (!persisted) {
    return {
      next: current,
      persisted,
      toast: { text: 'Could not save change — storage unavailable', type: 'error' },
    };
  }
  return {
    next,
    persisted,
    toast: {
      text: toggled.completed ? `Completed: "${toggled.title}"` : `Marked pending: "${toggled.title}"`,
      type: 'info',
    },
  };
}

/**
 * Snooze a reminder: writes FIRST, then reports the info toast. On write
 * failure the "Snoozed ..." claim must NOT fire.
 *
 * The snooze NEVER overwrites dueTime. It is recorded as a separate
 * snooze-until ISO timestamp computed from the current instant, so the
 * reminder keeps showing its real due time, and repeated snoozes do NOT
 * compound: a second 15-minute snooze ends ~15 minutes after the second
 * press, not 30 minutes after the first. (This replaces the destructive
 * `dueTime: "Snoozed +Nm"` overwrite, which lost the original due time
 * and made repeated snoozes pile up.)
 */
export function applySnoozeReminder(
  storage: StorageLike | null,
  key: string,
  current: StoredReminder[],
  id: string,
  mins: number,
): ReminderAction {
  const target = current.find((r) => r.id === id);
  if (!target) return { next: current, persisted: true, toast: null };
  // Garbage in must never produce a junk timestamp: clamp the snooze
  // length to 1 minute .. 24 hours. Non-positive/non-finite input is a
  // no-op (same contract as an unknown id — nothing happened, no toast).
  const safeMins = Number.isFinite(mins) ? Math.floor(mins) : 0;
  if (safeMins <= 0) return { next: current, persisted: true, toast: null };
  const cappedMins = Math.min(safeMins, 24 * 60);
  const snoozedUntil = new Date(Date.now() + cappedMins * 60_000).toISOString();
  const next = current.map((r) => (r.id === id ? { ...r, snoozedUntil } : r));
  const persisted = saveReminders(storage, key, next);
  if (!persisted) {
    return {
      next: current,
      persisted,
      toast: { text: 'Could not save change — storage unavailable', type: 'error' },
    };
  }
  return { next, persisted, toast: { text: `Snoozed for ${cappedMins} minutes`, type: 'info' } };
}

/**
 * Clear a reminder's snooze: drops snoozedUntil; dueTime is untouched (it
 * was never overwritten by snoozing). Writes FIRST; on write failure the
 * list and toast stay unchanged.
 */
export function applyUnsnoozeReminder(
  storage: StorageLike | null,
  key: string,
  current: StoredReminder[],
  id: string,
): ReminderAction {
  const target = current.find((r) => r.id === id);
  if (!target || !target.snoozedUntil) return { next: current, persisted: true, toast: null };
  const next = current.map((r) => {
    if (r.id !== id) return r;
    const copy: StoredReminder = { ...r };
    delete copy.snoozedUntil;
    return copy;
  });
  const persisted = saveReminders(storage, key, next);
  if (!persisted) {
    return {
      next: current,
      persisted,
      toast: { text: 'Could not save change — storage unavailable', type: 'error' },
    };
  }
  return { next, persisted, toast: { text: 'Snooze cleared', type: 'info' } };
}

/**
 * Delete a reminder: writes FIRST. On write failure the "Reminder removed"
 * claim must NOT fire — the reminder is still in storage.
 */
export function applyDeleteReminder(
  storage: StorageLike | null,
  key: string,
  current: StoredReminder[],
  id: string,
): ReminderAction {
  const next = current.filter((r) => r.id !== id);
  if (next.length === current.length) return { next: current, persisted: true, toast: null };
  const persisted = saveReminders(storage, key, next);
  if (!persisted) {
    return {
      next: current,
      persisted,
      toast: { text: 'Could not save change — storage unavailable', type: 'error' },
    };
  }
  return { next, persisted, toast: { text: 'Reminder removed', type: 'info' } };
}
