/**
 * calendar-reminders-persistence.test.tsx
 *
 * Regression tests for the reminders fake-success fix (QM-FIX-LOOP, P1).
 *
 * The bug: CalendarScheduleSubView's reminders were plain useState with zero
 * persistence, yet handleAddReminder toasted `Reminder created: "..."` (type
 * success) — a refresh wiped everything the user was told was created. Same
 * fake-success class as the water/log trackers fixed in PR #1065.
 *
 * The fix: reminders persist to localStorage (per-user key) via
 * src/lib/calendar-reminders-storage.ts, and success/info toasts fire ONLY
 * after the write landed. These tests pin:
 *  1. the storage module: round-trips, per-user keys, corrupt-data
 *     degradation, and false-on-write-failure (the honesty contract)
 *  2. the component renders persisted reminders on mount (no more
 *     always-empty list after refresh)
 *  3. the handlers' honesty: the persist-then-toast action helpers the
 *     component delegates to (applyCreateReminder / applyToggleReminder /
 *     applySnoozeReminder / applyDeleteReminder) yield the claim toast only
 *     when the write landed, and an honest error toast — with no state
 *     advance — when storage throws. DOM-free by design: neither jsdom nor
 *     @testing-library/react is a dependency of this package, so importing
 *     them fails CI's frozen-lockfile gate.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import {
  safeStorage,
  reminderKey,
  loadReminders,
  saveReminders,
  applyCreateReminder,
  applyToggleReminder,
  applySnoozeReminder,
  applyUnsnoozeReminder,
  applyDeleteReminder,
  type StorageLike,
  type StoredReminder,
} from '../lib/calendar-reminders-storage';
import * as toastBus from '../lib/toast-bus';
import { CalendarScheduleSubView } from '../components/CalendarSubViews';

// ---------------------------------------------------------------------------
// Fake storage
// ---------------------------------------------------------------------------
class FakeStorage implements StorageLike {
  private store = new Map<string, string>();
  failWrites = false;

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('quota exceeded');
    this.store.set(key, value);
  }
  clear(): void {
    this.store.clear();
  }
}

function withGlobalStorage(s: StorageLike | null): void {
  if (s === null) {
    delete (globalThis as Record<string, unknown>).localStorage;
  } else {
    (globalThis as Record<string, unknown>).localStorage = s;
  }
}

const REM: StoredReminder = {
  id: 'rem-1',
  title: 'Call dentist',
  dueTime: 'Today, 6:00 PM',
  priority: 'urgent',
  completed: false,
};

// ---------------------------------------------------------------------------
// 1. Storage module
// ---------------------------------------------------------------------------
describe('calendar-reminders-storage', () => {
  it('scopes keys per user', () => {
    expect(reminderKey('user-a')).not.toBe(reminderKey('user-b'));
    expect(reminderKey('user-a')).toBe(reminderKey('user-a'));
    expect(reminderKey('')).toBe(reminderKey('')); // stable anon fallback
  });

  it('round-trips reminders', () => {
    const s = new FakeStorage();
    const key = reminderKey('u1');
    expect(loadReminders(s, key)).toEqual([]);
    expect(saveReminders(s, key, [REM])).toBe(true);
    expect(loadReminders(s, key)).toEqual([REM]);
    const two = [REM, { ...REM, id: 'rem-2', title: 'Pay rent' }];
    expect(saveReminders(s, key, two)).toBe(true);
    expect(loadReminders(s, key)).toEqual(two);
  });

  it('reminders are NOT date-scoped: they survive into the next day', () => {
    const s = new FakeStorage();
    const key = reminderKey('u1');
    expect(saveReminders(s, key, [REM])).toBe(true);
    // No day key in the payload — the same read works "tomorrow".
    expect(loadReminders(s, key)).toEqual([REM]);
  });

  it('drops invalid entries and normalizes unknown enums instead of showing them raw', () => {
    const s = new FakeStorage();
    const key = reminderKey('u1');
    s.setItem(
      key,
      JSON.stringify([
        { id: 'rem-1', title: 'Good', dueTime: '', priority: 'weird', completed: 'yes' },
        { id: '', title: '' }, // invalid: dropped
        'garbage', // invalid: dropped
        null, // invalid: dropped
      ]),
    );
    const loaded = loadReminders(s, key);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('Good');
    expect(loaded[0].dueTime).toBe('Today, 6:00 PM'); // normalized fallback
    expect(loaded[0].priority).toBe('medium'); // normalized fallback
    expect(loaded[0].completed).toBe(false); // coerced to boolean
  });

  it('drops expired or invalid snoozedUntil on load, keeps live snoozes', () => {
    const s = new FakeStorage();
    const key = reminderKey('u1');
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    s.setItem(
      key,
      JSON.stringify([
        { id: 'rem-live', title: 'Live snooze', dueTime: 'Today, 6:00 PM', priority: 'low', snoozedUntil: future },
        { id: 'rem-expired', title: 'Expired snooze', dueTime: 'Today, 6:00 PM', priority: 'low', snoozedUntil: past },
        { id: 'rem-junk', title: 'Junk snooze', dueTime: 'Today, 6:00 PM', priority: 'low', snoozedUntil: 'not-a-date' },
      ]),
    );
    const loaded = loadReminders(s, key);
    expect(loaded).toHaveLength(3);
    // Live snooze survives; the original due time is untouched either way.
    expect(loaded[0].snoozedUntil).toBe(future);
    expect(loaded[0].dueTime).toBe('Today, 6:00 PM');
    // Expired snooze is cleared — keeping it would lie about the state.
    expect('snoozedUntil' in loaded[1]).toBe(false);
    // Invalid junk never shows as a fake snooze.
    expect('snoozedUntil' in loaded[2]).toBe(false);
  });

  it('reports write failure as false so the UI can toast honestly', () => {
    const s = new FakeStorage();
    const key = reminderKey('u1');
    expect(saveReminders(s, key, [REM])).toBe(true);
    s.failWrites = true;
    expect(saveReminders(s, key, [])).toBe(false);
    expect(loadReminders(s, key)).toHaveLength(1); // last good write still intact
    expect(saveReminders(null, key, [])).toBe(false); // no storage at all
    expect(loadReminders(null, key)).toEqual([]);
  });

  it('degrades corrupt payloads to []', () => {
    const s = new FakeStorage();
    const key = reminderKey('u1');
    s.setItem(key, 'broken{{{');
    expect(loadReminders(s, key)).toEqual([]);
  });

  it('safeStorage returns null without a usable localStorage', () => {
    withGlobalStorage(null);
    expect(safeStorage()).toBe(null);
    const s = new FakeStorage();
    withGlobalStorage(s);
    expect(safeStorage()).toBe(s);
    withGlobalStorage(null);
  });
});

// ---------------------------------------------------------------------------
// 2. Component renders persisted state on mount (SSR-safe)
// ---------------------------------------------------------------------------
describe('CalendarScheduleSubView loads persisted reminders', () => {
  afterEach(() => withGlobalStorage(null));

  it('shows persisted reminders instead of an empty list', () => {
    const s = new FakeStorage();
    expect(saveReminders(s, reminderKey('u9'), [REM])).toBe(true);
    withGlobalStorage(s);
    const html = renderToStaticMarkup(<CalendarScheduleSubView userId="u9" initialSubTab="reminders" />);
    expect(html).toContain('Call dentist');
    expect(html).toContain('Reminder sync is not wired up yet');
    expect(html).not.toContain('for this session only');
  });

  it('keeps users isolated: user B does not see user A reminders', () => {
    const s = new FakeStorage();
    expect(saveReminders(s, reminderKey('user-a'), [REM])).toBe(true);
    withGlobalStorage(s);
    const html = renderToStaticMarkup(
      <CalendarScheduleSubView userId="user-b" initialSubTab="reminders" />,
    );
    expect(html).not.toContain('Call dentist');
  });

  it('renders the REAL due time plus a "Snoozed until" chip for a snoozed reminder', () => {
    const s = new FakeStorage();
    const snoozed: StoredReminder = {
      ...REM,
      snoozedUntil: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    expect(saveReminders(s, reminderKey('u9'), [snoozed])).toBe(true);
    withGlobalStorage(s);
    const html = renderToStaticMarkup(
      <CalendarScheduleSubView userId="u9" initialSubTab="reminders" />,
    );
    // The real due time must still render (never the destructive "Snoozed +15m").
    expect(html).toContain('Today, 6:00 PM');
    expect(html).not.toContain('Snoozed +15m');
    expect(html).toContain('Snoozed until');
  });
});

// ---------------------------------------------------------------------------
// 3. Handler honesty via the action helpers (no DOM)
// ---------------------------------------------------------------------------
describe('CalendarScheduleSubView handler honesty (action helpers)', () => {
  let storage: FakeStorage;
  let toasts: Array<{ text: string; type: string }>;
  let unsubscribe: () => void;

  beforeEach(() => {
    storage = new FakeStorage();
    withGlobalStorage(storage);
    toasts = [];
    unsubscribe = toastBus.subscribeToToasts((msg) => {
      toasts.push({ text: msg.text, type: msg.type });
    });
  });

  afterEach(() => {
    unsubscribe();
    storage.clear();
    withGlobalStorage(null);
  });

  it('create: persists the reminder AND yields the success toast when storage works', () => {
    // Exactly what handleAddReminder does: write first, then toast whatever
    // the action reports.
    const result = applyCreateReminder(storage, reminderKey('u1'), [], {
      title: 'Call dentist',
      dueTime: 'Today, 6:00 PM',
      priority: 'urgent',
    });
    expect(result.persisted).toBe(true);
    if (result.toast) toastBus.showToast(result.toast);

    const stored = loadReminders(storage, reminderKey('u1'));
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Call dentist');
    const success = toasts.find((t) => t.type === 'success' && t.text.includes('Reminder created'));
    expect(success).toBeDefined();
    expect(success!.text).toContain('Call dentist');
    // The list the UI renders comes from the action, not thin air.
    expect(result.next).toHaveLength(1);
  });

  it('create: honest error toast and NO success toast when storage throws', () => {
    storage.failWrites = true;
    const result = applyCreateReminder(storage, reminderKey('u1'), [], {
      title: 'Call dentist',
      dueTime: 'Today, 6:00 PM',
      priority: 'urgent',
    });
    expect(result.persisted).toBe(false);
    expect(result.next).toEqual([]); // state must not advance
    if (result.toast) toastBus.showToast(result.toast);

    const success = toasts.find((t) => t.type === 'success');
    expect(success).toBeUndefined();
    const error = toasts.find((t) => t.type === 'error');
    expect(error).toBeDefined();
    expect(error!.text).toMatch(/could not save/i);
    expect(loadReminders(storage, reminderKey('u1'))).toEqual([]);
  });

  it('toggle: honest error toast and no state advance when storage throws', () => {
    const created = applyCreateReminder(storage, reminderKey('u1'), [], {
      title: 'Call dentist',
      dueTime: 'Today, 6:00 PM',
      priority: 'urgent',
    });
    const id = created.next[0].id;

    storage.failWrites = true;
    const result = applyToggleReminder(storage, reminderKey('u1'), created.next, id);
    expect(result.persisted).toBe(false);
    expect(result.next).toEqual(created.next); // unchanged
    if (result.toast) toastBus.showToast(result.toast);

    const info = toasts.find((t) => t.type === 'info' && t.text.includes('Completed'));
    expect(info).toBeUndefined();
    const error = toasts.find((t) => t.type === 'error');
    expect(error).toBeDefined();
    // Storage still holds the un-toggled version.
    expect(loadReminders(storage, reminderKey('u1'))[0].completed).toBe(false);
  });

  it('toggle: yields the "Completed" info toast when storage works', () => {
    const created = applyCreateReminder(storage, reminderKey('u1'), [], {
      title: 'Call dentist',
      dueTime: 'Today, 6:00 PM',
      priority: 'urgent',
    });
    const result = applyToggleReminder(storage, reminderKey('u1'), created.next, created.next[0].id);
    expect(result.persisted).toBe(true);
    if (result.toast) toastBus.showToast(result.toast);

    const info = toasts.find((t) => t.type === 'info');
    expect(info).toBeDefined();
    expect(info!.text).toBe('Completed: "Call dentist"');
    expect(loadReminders(storage, reminderKey('u1'))[0].completed).toBe(true);
  });

  it('toggle: unknown id yields no toast at all', () => {
    const result = applyToggleReminder(storage, reminderKey('u1'), [REM], 'nope');
    expect(result.toast).toBe(null);
    expect(result.next).toEqual([REM]);
  });

  it('snooze: writes first, honest on failure', () => {
    const created = applyCreateReminder(storage, reminderKey('u1'), [], {
      title: 'Call dentist',
      dueTime: 'Today, 6:00 PM',
      priority: 'urgent',
    });
    const id = created.next[0].id;

    const before = Date.now();
    const ok = applySnoozeReminder(storage, reminderKey('u1'), created.next, id, 30);
    expect(ok.persisted).toBe(true);
    expect(ok.toast).toEqual({ text: 'Snoozed for 30 minutes', type: 'info' });
    // The original due time is NEVER overwritten — snoozing must not
    // destroy it (regression: the old code wrote "Snoozed +30m" here).
    const stored = loadReminders(storage, reminderKey('u1'))[0];
    expect(stored.dueTime).toBe('Today, 6:00 PM');
    expect(typeof stored.snoozedUntil).toBe('string');
    const until = Date.parse(stored.snoozedUntil!);
    expect(until).toBeGreaterThanOrEqual(before + 30 * 60_000 - 1_000);
    expect(until).toBeLessThanOrEqual(Date.now() + 30 * 60_000 + 1_000);

    storage.failWrites = true;
    const bad = applySnoozeReminder(storage, reminderKey('u1'), ok.next, id, 60);
    expect(bad.persisted).toBe(false);
    expect(bad.toast?.type).toBe('error');
    expect(bad.next).toEqual(ok.next); // unchanged
  });

  it('snooze: repeated snoozes do not compound — each one counts from now', () => {
    vi.useFakeTimers();
    try {
      const base = new Date('2026-10-19T10:00:00Z').getTime();
      vi.setSystemTime(base);
      const created = applyCreateReminder(storage, reminderKey('u1'), [], {
        title: 'Call dentist',
        dueTime: 'Today, 6:00 PM',
        priority: 'urgent',
      });
      const id = created.next[0].id;

      const first = applySnoozeReminder(storage, reminderKey('u1'), created.next, id, 15);
      expect(Date.parse(first.next[0].snoozedUntil!)).toBe(base + 15 * 60_000);

      // Ten minutes pass, the user snoozes again for 15 minutes: the new
      // expiry is ~15 minutes after the SECOND press, not 30 after the first.
      vi.setSystemTime(base + 10 * 60_000);
      const second = applySnoozeReminder(storage, reminderKey('u1'), first.next, id, 15);
      expect(Date.parse(second.next[0].snoozedUntil!)).toBe(base + 25 * 60_000);
      // dueTime intact through repeated snoozes.
      expect(second.next[0].dueTime).toBe('Today, 6:00 PM');
      expect(loadReminders(storage, reminderKey('u1'))[0].dueTime).toBe('Today, 6:00 PM');
    } finally {
      vi.useRealTimers();
    }
  });

  it('snooze: non-positive / non-finite minutes are a silent no-op', () => {
    const created = applyCreateReminder(storage, reminderKey('u1'), [], {
      title: 'Call dentist',
      dueTime: 'Today, 6:00 PM',
      priority: 'urgent',
    });
    const id = created.next[0].id;
    for (const mins of [0, -15, NaN, Infinity]) {
      const result = applySnoozeReminder(storage, reminderKey('u1'), created.next, id, mins);
      expect(result.persisted).toBe(true);
      expect(result.toast).toBe(null);
      expect(result.next).toEqual(created.next);
      expect(loadReminders(storage, reminderKey('u1'))[0].snoozedUntil).toBeUndefined();
    }
  });

  it('snooze: unknown id yields no toast at all', () => {
    const result = applySnoozeReminder(storage, reminderKey('u1'), [REM], 'nope', 15);
    expect(result.toast).toBe(null);
    expect(result.next).toEqual([REM]);
  });

  it('unsnooze: clears the snooze, keeps the original due time', () => {
    const created = applyCreateReminder(storage, reminderKey('u1'), [], {
      title: 'Call dentist',
      dueTime: 'Today, 6:00 PM',
      priority: 'urgent',
    });
    const id = created.next[0].id;
    const snoozed = applySnoozeReminder(storage, reminderKey('u1'), created.next, id, 15);
    expect(snoozed.next[0].snoozedUntil).toBeDefined();

    const cleared = applyUnsnoozeReminder(storage, reminderKey('u1'), snoozed.next, id);
    expect(cleared.persisted).toBe(true);
    expect(cleared.toast).toEqual({ text: 'Snooze cleared', type: 'info' });
    expect(cleared.next[0].dueTime).toBe('Today, 6:00 PM');
    expect('snoozedUntil' in cleared.next[0]).toBe(false);
    const stored = loadReminders(storage, reminderKey('u1'))[0];
    expect(stored.dueTime).toBe('Today, 6:00 PM');
    expect('snoozedUntil' in stored).toBe(false);
  });

  it('unsnooze: honest on write failure, silent when nothing is snoozed', () => {
    const created = applyCreateReminder(storage, reminderKey('u1'), [], {
      title: 'Call dentist',
      dueTime: 'Today, 6:00 PM',
      priority: 'urgent',
    });
    const id = created.next[0].id;

    // Nothing snoozed → no-op, no toast.
    const noop = applyUnsnoozeReminder(storage, reminderKey('u1'), created.next, id);
    expect(noop.toast).toBe(null);
    expect(noop.next).toEqual(created.next);

    // Write failure → honest error, no state advance.
    const snoozed = applySnoozeReminder(storage, reminderKey('u1'), created.next, id, 15);
    storage.failWrites = true;
    const bad = applyUnsnoozeReminder(storage, reminderKey('u1'), snoozed.next, id);
    expect(bad.persisted).toBe(false);
    expect(bad.toast?.type).toBe('error');
    expect(bad.next).toEqual(snoozed.next);
  });

  it('delete: honest error toast and NO "removed" claim when storage throws', () => {
    const created = applyCreateReminder(storage, reminderKey('u1'), [], {
      title: 'Call dentist',
      dueTime: 'Today, 6:00 PM',
      priority: 'urgent',
    });
    const id = created.next[0].id;

    storage.failWrites = true;
    const result = applyDeleteReminder(storage, reminderKey('u1'), created.next, id);
    expect(result.persisted).toBe(false);
    expect(result.next).toEqual(created.next); // still there
    if (result.toast) toastBus.showToast(result.toast);

    const removed = toasts.find((t) => t.type === 'info' && t.text.includes('removed'));
    expect(removed).toBeUndefined();
    expect(toasts.some((t) => t.type === 'error')).toBe(true);
    expect(loadReminders(storage, reminderKey('u1'))).toHaveLength(1);
  });
});
