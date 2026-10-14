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
  return {
    id: item.id,
    title: item.title,
    dueTime: typeof item.dueTime === 'string' && item.dueTime.length > 0 ? item.dueTime : 'Today, 6:00 PM',
    priority: (VALID_PRIORITIES as readonly string[]).includes(item.priority) ? item.priority : 'medium',
    // StoredReminder.completed is typed boolean, but parsed payloads may
    // carry truthy junk — only literal true survives normalization.
    completed: item.completed === (true as boolean),
  };
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
  const next = current.map((r) => (r.id === id ? { ...r, dueTime: `Snoozed +${mins}m` } : r));
  const persisted = saveReminders(storage, key, next);
  if (!persisted) {
    return {
      next: current,
      persisted,
      toast: { text: 'Could not save change — storage unavailable', type: 'error' },
    };
  }
  return { next, persisted, toast: { text: `Snoozed for ${mins} minutes`, type: 'info' } };
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
