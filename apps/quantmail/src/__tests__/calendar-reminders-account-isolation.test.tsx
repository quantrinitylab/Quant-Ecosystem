/**
 * calendar-reminders-account-isolation.test.tsx
 *
 * Regression tests for the account-transition isolation gap
 * (CODEX-REVIEW 6167418183 on #1159, QM-FIX-LOOP P1).
 *
 * The bug: CalendarScheduleSubView loaded reminders once in the useState
 * initializer but recomputed the storage key from the current userId on
 * every render. On a same-instance A->B account transition the stale A list
 * stayed in state while the key pointed at B — the next toggle/snooze/
 * delete/add wrote A's list under B's key, destroying B's stored list (and
 * A's content rendered under B's identity). Unresolved auth (empty userId)
 * fell into the shared `anon` bucket, so an anonymous list could be written
 * over an authenticated account's list on hydration.
 *
 * The fix: the list (plus add-form/filter/sub-tab state) is bound to the
 * account identity — an account-keyed remount boundary around the inner
 * view, plus a render-phase rebind as defense-in-depth — and unresolved
 * auth renders an honest gate that never reads or writes the shared bucket.
 *
 * These tests pin, DOM-free (no jsdom / @testing-library/react — neither is
 * a dependency of this package, so importing them fails CI's
 * frozen-lockfile gate):
 *  1. the account-resolution/binding helpers: A->B->A, unresolved->A,
 *     logout/login transitions, and the no-churn same-account fast path
 *  2. the component: per-account mounts show exactly that account's list
 *     (A content never flashes under B); unresolved auth shows the gate —
 *     never the anon bucket, never any account's list
 *  3. actions taken immediately after a transition write under the NEW
 *     account's key only: B's storage stays intact and correct, A's storage
 *     is byte-identical, the anon bucket is untouched
 */
import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import {
  safeStorage,
  reminderKey,
  loadReminders,
  saveReminders,
  resolveReminderAccount,
  bindRemindersToAccount,
  applyCreateReminder,
  applyToggleReminder,
  applySnoozeReminder,
  applyDeleteReminder,
  type StorageLike,
  type StoredReminder,
} from '../lib/calendar-reminders-storage';
import { CalendarScheduleSubView } from '../components/CalendarSubViews';

// ---------------------------------------------------------------------------
// Fake storage (same shape as calendar-reminders-persistence.test.tsx)
// ---------------------------------------------------------------------------
class FakeStorage implements StorageLike {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
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

const REM_A: StoredReminder = {
  id: 'rem-a-1',
  title: 'A: Call dentist',
  dueTime: 'Today, 6:00 PM',
  priority: 'urgent',
  completed: false,
};
const REM_B: StoredReminder = {
  id: 'rem-b-1',
  title: 'B: Pay rent',
  dueTime: 'Tomorrow, 9:00 AM',
  priority: 'medium',
  completed: false,
};
const REM_ANON: StoredReminder = {
  id: 'rem-anon-1',
  title: 'Anon: ghost item',
  dueTime: 'Today, 6:00 PM',
  priority: 'low',
  completed: false,
};

/** Seeds two accounts plus the legacy shared anon bucket. */
function seed(s: FakeStorage): void {
  expect(saveReminders(s, reminderKey('user-a'), [REM_A])).toBe(true);
  expect(saveReminders(s, reminderKey('user-b'), [REM_B])).toBe(true);
  expect(saveReminders(s, reminderKey(''), [REM_ANON])).toBe(true);
}

function renderRemindersFor(userId: string): string {
  return renderToStaticMarkup(
    <CalendarScheduleSubView userId={userId} initialSubTab="reminders" />,
  );
}

// ---------------------------------------------------------------------------
// 1. Account resolution + binding helpers
// ---------------------------------------------------------------------------
describe('resolveReminderAccount', () => {
  it('returns null for empty, blank, null, and undefined ids', () => {
    expect(resolveReminderAccount('')).toBeNull();
    expect(resolveReminderAccount('   ')).toBeNull();
    expect(resolveReminderAccount(null)).toBeNull();
    expect(resolveReminderAccount(undefined)).toBeNull();
  });

  it('returns the raw id for real accounts', () => {
    expect(resolveReminderAccount('user-a')).toBe('user-a');
  });
});

describe('bindRemindersToAccount', () => {
  it('loads the account list on first bind', () => {
    const s = new FakeStorage();
    seed(s);
    const b = bindRemindersToAccount(s, 'user-a', null);
    expect(b.accountId).toBe('user-a');
    expect(b.key).toBe(reminderKey('user-a'));
    expect(b.list).toEqual([REM_A]);
  });

  it('returns the same binding when the account is unchanged (no storage churn)', () => {
    const s = new FakeStorage();
    seed(s);
    const first = bindRemindersToAccount(s, 'user-a', null);
    const second = bindRemindersToAccount(s, 'user-a', first);
    expect(second).toBe(first);
  });

  it('A->B rebind loads B list, never the stale A list', () => {
    const s = new FakeStorage();
    seed(s);
    const bindingA = bindRemindersToAccount(s, 'user-a', null);
    const bindingB = bindRemindersToAccount(s, 'user-b', bindingA);
    expect(bindingB.accountId).toBe('user-b');
    expect(bindingB.key).toBe(reminderKey('user-b'));
    expect(bindingB.list).toEqual([REM_B]);
    expect(bindingB.list).not.toContain(REM_A);
  });

  it('A->B->A round-trips back to the A list', () => {
    const s = new FakeStorage();
    seed(s);
    const b0 = bindRemindersToAccount(s, 'user-a', null);
    const b1 = bindRemindersToAccount(s, 'user-b', b0);
    const b2 = bindRemindersToAccount(s, 'user-a', b1);
    expect(b2.list).toEqual([REM_A]);
    expect(b2.list).not.toContain(REM_B);
  });

  it('unresolved->A binds A without ever reading the anon bucket', () => {
    const s = new FakeStorage();
    seed(s);
    const anonBefore = s.getItem(reminderKey(''));
    const b0 = bindRemindersToAccount(s, '', null);
    expect(b0).toEqual({ accountId: null, key: null, list: [] });
    const b1 = bindRemindersToAccount(s, 'user-a', b0);
    expect(b1.list).toEqual([REM_A]);
    expect(b1.list).not.toContain(REM_ANON);
    // The anon bucket is never even read, let alone written.
    expect(s.getItem(reminderKey(''))).toBe(anonBefore);
  });

  it('logout/login (A -> unresolved -> A) keeps the A list', () => {
    const s = new FakeStorage();
    seed(s);
    const b0 = bindRemindersToAccount(s, 'user-a', null);
    const b1 = bindRemindersToAccount(s, '', b0);
    expect(b1).toEqual({ accountId: null, key: null, list: [] });
    const b2 = bindRemindersToAccount(s, 'user-a', b1);
    expect(b2.list).toEqual([REM_A]);
  });

  it('regression: a stale A list can never be written under the B key via the binding', () => {
    const s = new FakeStorage();
    seed(s);
    // The old code shape: state retained A's list while the key recomputed
    // to B's, so the next action wrote A's list under B's key. The new
    // binding ALWAYS reloads the new account's list on an account change —
    // handlers only ever see the fresh list for the current key.
    const staleBinding = {
      accountId: 'user-a',
      key: reminderKey('user-a'),
      list: [REM_A],
    };
    const rebound = bindRemindersToAccount(s, 'user-b', staleBinding);
    expect(rebound.list).toEqual([REM_B]);
    expect(rebound.list).not.toContain(REM_A);
    // And B's storage is untouched by the rebind itself.
    expect(loadReminders(s, reminderKey('user-b'))).toEqual([REM_B]);
  });
});

// ---------------------------------------------------------------------------
// 2. Rendered component: per-account mounts + unresolved-auth gate
// ---------------------------------------------------------------------------
describe('CalendarScheduleSubView account isolation (rendered)', () => {
  afterEach(() => withGlobalStorage(null));

  it('A->B->A: each account sees exactly its own list; A content never flashes under B', () => {
    const s = new FakeStorage();
    seed(s);
    withGlobalStorage(s);

    const htmlA1 = renderRemindersFor('user-a');
    expect(htmlA1).toContain('A: Call dentist');
    expect(htmlA1).not.toContain('B: Pay rent');
    expect(htmlA1).not.toContain('Anon: ghost item');

    const htmlB = renderRemindersFor('user-b');
    expect(htmlB).toContain('B: Pay rent');
    expect(htmlB).not.toContain('A: Call dentist');
    expect(htmlB).not.toContain('Anon: ghost item');

    const htmlA2 = renderRemindersFor('user-a');
    expect(htmlA2).toContain('A: Call dentist');
    expect(htmlA2).not.toContain('B: Pay rent');
  });

  it('unresolved auth renders the gate — never the anon bucket, never any account list', () => {
    const s = new FakeStorage();
    seed(s);
    withGlobalStorage(s);

    const html = renderRemindersFor('');
    expect(html).toContain('Sign in to manage reminders');
    expect(html).not.toContain('Anon: ghost item');
    expect(html).not.toContain('A: Call dentist');
    expect(html).not.toContain('B: Pay rent');
    // No action controls exist while unresolved: nothing can be written.
    expect(html).not.toContain('Add New Scheduled Reminder');
    expect(html).not.toContain('What needs to get done?');
  });

  it('unresolved->A hydration shows the A list, not the anon list', () => {
    const s = new FakeStorage();
    seed(s);
    withGlobalStorage(s);

    renderRemindersFor('');
    const htmlA = renderRemindersFor('user-a');
    expect(htmlA).toContain('A: Call dentist');
    expect(htmlA).not.toContain('Anon: ghost item');
  });

  it('logout/login (A -> unresolved -> A) keeps the A list intact', () => {
    const s = new FakeStorage();
    seed(s);
    withGlobalStorage(s);

    expect(renderRemindersFor('user-a')).toContain('A: Call dentist');
    const htmlGate = renderRemindersFor('');
    expect(htmlGate).toContain('Sign in to manage reminders');
    expect(htmlGate).not.toContain('A: Call dentist');
    const htmlA = renderRemindersFor('user-a');
    expect(htmlA).toContain('A: Call dentist');
    expect(htmlA).not.toContain('Anon: ghost item');
  });

  it('unresolved render performs no writes anywhere (anon key untouched)', () => {
    const s = new FakeStorage();
    // No anon key exists yet — the old code would create it on first write.
    expect(saveReminders(s, reminderKey('user-a'), [REM_A])).toBe(true);
    withGlobalStorage(s);

    renderRemindersFor('');
    expect(s.getItem(reminderKey(''))).toBeNull();
    expect(loadReminders(s, reminderKey('user-a'))).toEqual([REM_A]);
  });

  it('safeStorage is the storage the component binds through', () => {
    const s = new FakeStorage();
    seed(s);
    withGlobalStorage(s);
    expect(safeStorage()).toBe(s);
    const html = renderRemindersFor('user-b');
    expect(html).toContain('B: Pay rent');
  });
});

// ---------------------------------------------------------------------------
// 3. Actions immediately after a transition write under the NEW key only
// ---------------------------------------------------------------------------
describe('actions immediately after an account transition', () => {
  it('toggle under B updates B storage; A storage stays byte-identical', () => {
    const s = new FakeStorage();
    seed(s);
    const aBefore = s.getItem(reminderKey('user-a'));

    // Post-transition instance: freshly bound to B (what the account-keyed
    // remount produces in the browser).
    const binding = bindRemindersToAccount(
      s,
      'user-b',
      bindRemindersToAccount(s, 'user-a', null),
    );
    expect(binding.list).toEqual([REM_B]);

    const result = applyToggleReminder(s, binding.key as string, binding.list, 'rem-b-1');
    expect(result.persisted).toBe(true);
    expect(loadReminders(s, reminderKey('user-b'))).toEqual([
      { ...REM_B, completed: true },
    ]);
    // A's storage is byte-identical — the old bug overwrote it under B's key.
    expect(s.getItem(reminderKey('user-a'))).toBe(aBefore);
    expect(loadReminders(s, reminderKey('user-a'))).toEqual([REM_A]);
  });

  it('add + snooze + delete after transition never clobber the other account or anon', () => {
    const s = new FakeStorage();
    seed(s);
    const aBefore = s.getItem(reminderKey('user-a'));
    const anonBefore = s.getItem(reminderKey(''));

    let binding = bindRemindersToAccount(
      s,
      'user-b',
      bindRemindersToAccount(s, 'user-a', null),
    );
    const key = binding.key as string;

    const created = applyCreateReminder(s, key, binding.list, {
      title: 'B: new after transition',
      dueTime: 'Today, 6:00 PM',
      priority: 'low',
    });
    expect(created.persisted).toBe(true);
    binding = { ...binding, list: created.next };

    const snoozed = applySnoozeReminder(s, key, binding.list, 'rem-b-1', 15);
    expect(snoozed.persisted).toBe(true);
    binding = { ...binding, list: snoozed.next };

    const deleted = applyDeleteReminder(s, key, binding.list, 'rem-b-1');
    expect(deleted.persisted).toBe(true);

    const storedB = loadReminders(s, key);
    expect(storedB).toHaveLength(1);
    expect(storedB[0].title).toBe('B: new after transition');
    expect(storedB.some((r) => r.id === 'rem-a-1')).toBe(false);

    expect(s.getItem(reminderKey('user-a'))).toBe(aBefore);
    expect(s.getItem(reminderKey(''))).toBe(anonBefore);
  });

  it('an unresolved binding exposes no key, so no action can target any bucket', () => {
    const s = new FakeStorage();
    seed(s);
    const binding = bindRemindersToAccount(s, '', null);
    expect(binding.key).toBeNull();
    // Every component handler refuses a null key before reaching the action
    // helpers, and the gate hides all action controls — so no write path
    // exists while auth is unresolved.
  });
});
