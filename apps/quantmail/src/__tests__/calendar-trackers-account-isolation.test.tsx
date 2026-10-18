/**
 * calendar-trackers-account-isolation.test.tsx
 *
 * Regression tests for the account-transition isolation gap in
 * CalendarTrackersSubView (QM-FIX-LOOP P1 — the same gap just fixed for
 * reminders by PR #1275 / CODEX-REVIEW 6167418183 on #1159).
 *
 * The bug: CalendarTrackersSubView loaded waterMl/lifeTrackers once in the
 * useState initializers but recomputed waterKey/trackersKey from the current
 * userId on every render. On a same-instance A->B account transition the stale
 * A values stayed in state while the keys pointed at B — the next add/delete
 * wrote A's data under B's key, destroying B's stored log/trackers (and A's
 * data rendered under B). Unresolved auth (empty userId) fell into the shared
 * `anon` bucket, so an anon log could be written over an authenticated
 * account's on hydration.
 *
 * The fix: water + life trackers are bound to the account identity —
 * resolveTrackerAccount + bindTrackersToAccount, an account-keyed remount
 * boundary around the inner view plus a render-phase rebind as
 * defense-in-depth — and unresolved auth renders an honest gate (no action
 * controls) that never reads or writes the shared bucket.
 *
 * These tests pin, DOM-free (no jsdom / @testing-library/react — neither is
 * a dependency of this package, so importing them fails CI's
 * frozen-lockfile gate):
 *  1. the account-resolution/binding helpers: A->B->A, unresolved->A,
 *     logout/login transitions, and the no-churn same-account fast path
 *  2. the component: per-account mounts show exactly that account's
 *     values (A content never flashes under B); unresolved auth shows the
 *     gate — never the anon bucket, never any account's data, no action
 *     controls
 *  3. actions taken immediately after a transition write under the NEW
 *     account's keys only: B's storage stays intact and correct, A's storage
 *     is byte-identical, the anon bucket is untouched
 */
import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import {
  safeStorage,
  todayKey,
  waterLogKey,
  lifeTrackersKey,
  loadWaterMl,
  saveWaterMl,
  loadLifeTrackers,
  saveLifeTrackers,
  applyWaterLog,
  applyCreateTracker,
  resolveTrackerAccount,
  bindTrackersToAccount,
  type StorageLike,
  type StoredLifeTracker,
} from '../lib/calendar-trackers-storage';
import { CalendarTrackersSubView } from '../components/CalendarSubViews';

// ---------------------------------------------------------------------------
// Fake storage (same shape as calendar-trackers-persistence.test.tsx)
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

const TODAY = todayKey();

const TRK_A: StoredLifeTracker = {
  id: 'lt-a-1',
  title: 'A: Vitamin D bloodwork',
  category: 'Medical / Health',
  targetDate: '2026-11-01',
  notes: '',
  tone: 'rose',
};
const TRK_B: StoredLifeTracker = {
  id: 'lt-b-1',
  title: 'B: Insurance renewal',
  category: 'Legal / Documents',
  targetDate: '2026-12-01',
  notes: '',
  tone: 'sky',
};
const TRK_ANON: StoredLifeTracker = {
  id: 'lt-anon-1',
  title: 'Anon: ghost tracker',
  category: 'Countdown',
  targetDate: '2026-11-15',
  notes: '',
  tone: 'amber',
};

/** Seeds two accounts plus the legacy shared anon bucket (water + trackers). */
function seed(s: FakeStorage): void {
  expect(saveWaterMl(s, waterLogKey('user-a'), TODAY, 500)).toBe(true);
  expect(saveWaterMl(s, waterLogKey('user-b'), TODAY, 250)).toBe(true);
  expect(saveWaterMl(s, waterLogKey(''), TODAY, 999)).toBe(true);
  expect(saveLifeTrackers(s, lifeTrackersKey('user-a'), [TRK_A])).toBe(true);
  expect(saveLifeTrackers(s, lifeTrackersKey('user-b'), [TRK_B])).toBe(true);
  expect(saveLifeTrackers(s, lifeTrackersKey(''), [TRK_ANON])).toBe(true);
}

function renderTrackersFor(userId: string): string {
  return renderToStaticMarkup(<CalendarTrackersSubView userId={userId} />);
}

// ---------------------------------------------------------------------------
// 1. Account resolution + binding helpers
// ---------------------------------------------------------------------------
describe('resolveTrackerAccount', () => {
  it('returns null for empty, blank, null, and undefined ids', () => {
    expect(resolveTrackerAccount('')).toBeNull();
    expect(resolveTrackerAccount('   ')).toBeNull();
    expect(resolveTrackerAccount(null)).toBeNull();
    expect(resolveTrackerAccount(undefined)).toBeNull();
  });

  it('returns the raw id for real accounts', () => {
    expect(resolveTrackerAccount('user-a')).toBe('user-a');
  });
});

describe('bindTrackersToAccount', () => {
  it('loads the account values on first bind', () => {
    const s = new FakeStorage();
    seed(s);
    const b = bindTrackersToAccount(s, 'user-a', TODAY, null);
    expect(b.accountId).toBe('user-a');
    expect(b.waterKey).toBe(waterLogKey('user-a'));
    expect(b.trackersKey).toBe(lifeTrackersKey('user-a'));
    expect(b.waterMl).toBe(500);
    expect(b.lifeTrackers).toEqual([TRK_A]);
  });

  it('returns the same binding when the account is unchanged (no storage churn)', () => {
    const s = new FakeStorage();
    seed(s);
    const first = bindTrackersToAccount(s, 'user-a', TODAY, null);
    const second = bindTrackersToAccount(s, 'user-a', TODAY, first);
    expect(second).toBe(first);
  });

  it('A->B rebind loads B values, never the stale A values', () => {
    const s = new FakeStorage();
    seed(s);
    const bindingA = bindTrackersToAccount(s, 'user-a', TODAY, null);
    const bindingB = bindTrackersToAccount(s, 'user-b', TODAY, bindingA);
    expect(bindingB.accountId).toBe('user-b');
    expect(bindingB.waterKey).toBe(waterLogKey('user-b'));
    expect(bindingB.waterMl).toBe(250);
    expect(bindingB.lifeTrackers).toEqual([TRK_B]);
    expect(bindingB.lifeTrackers).not.toContain(TRK_A);
  });

  it('A->B->A round-trips back to the A values', () => {
    const s = new FakeStorage();
    seed(s);
    const b0 = bindTrackersToAccount(s, 'user-a', TODAY, null);
    const b1 = bindTrackersToAccount(s, 'user-b', TODAY, b0);
    const b2 = bindTrackersToAccount(s, 'user-a', TODAY, b1);
    expect(b2.waterMl).toBe(500);
    expect(b2.lifeTrackers).toEqual([TRK_A]);
    expect(b2.lifeTrackers).not.toContain(TRK_B);
  });

  it('unresolved->A binds A without ever reading the anon bucket', () => {
    const s = new FakeStorage();
    seed(s);
    const anonWaterBefore = s.getItem(waterLogKey(''));
    const anonTrackersBefore = s.getItem(lifeTrackersKey(''));
    const b0 = bindTrackersToAccount(s, '', TODAY, null);
    expect(b0).toEqual({
      accountId: null,
      waterKey: null,
      trackersKey: null,
      waterMl: 0,
      lifeTrackers: [],
    });
    const b1 = bindTrackersToAccount(s, 'user-a', TODAY, b0);
    expect(b1.waterMl).toBe(500);
    expect(b1.lifeTrackers).toEqual([TRK_A]);
    expect(b1.lifeTrackers).not.toContain(TRK_ANON);
    // The anon bucket is never even read, let alone written.
    expect(s.getItem(waterLogKey(''))).toBe(anonWaterBefore);
    expect(s.getItem(lifeTrackersKey(''))).toBe(anonTrackersBefore);
  });

  it('logout/login (A -> unresolved -> A) keeps the A values', () => {
    const s = new FakeStorage();
    seed(s);
    const b0 = bindTrackersToAccount(s, 'user-a', TODAY, null);
    const b1 = bindTrackersToAccount(s, '', TODAY, b0);
    expect(b1).toEqual({
      accountId: null,
      waterKey: null,
      trackersKey: null,
      waterMl: 0,
      lifeTrackers: [],
    });
    const b2 = bindTrackersToAccount(s, 'user-a', TODAY, b1);
    expect(b2.waterMl).toBe(500);
    expect(b2.lifeTrackers).toEqual([TRK_A]);
  });

  it('regression: stale A values can never be written under the B keys via the binding', () => {
    const s = new FakeStorage();
    seed(s);
    // The old code shape: state retained A's values while the keys recomputed
    // to B's, so the next action wrote A's data under B's keys. The new
    // binding ALWAYS reloads the new account's values on an account change —
    // handlers only ever see the fresh values for the current keys.
    const staleBinding = {
      accountId: 'user-a',
      waterKey: waterLogKey('user-a'),
      trackersKey: lifeTrackersKey('user-a'),
      waterMl: 500,
      lifeTrackers: [TRK_A],
    };
    const rebound = bindTrackersToAccount(s, 'user-b', TODAY, staleBinding);
    expect(rebound.waterMl).toBe(250);
    expect(rebound.lifeTrackers).toEqual([TRK_B]);
    expect(rebound.lifeTrackers).not.toContain(TRK_A);
    // And B's storage is untouched by the rebind itself.
    expect(loadWaterMl(s, waterLogKey('user-b'), TODAY)).toBe(250);
    expect(loadLifeTrackers(s, lifeTrackersKey('user-b'))).toEqual([TRK_B]);
  });
});

// ---------------------------------------------------------------------------
// 2. Rendered component: per-account mounts + unresolved-auth gate
// ---------------------------------------------------------------------------
describe('CalendarTrackersSubView account isolation (rendered)', () => {
  afterEach(() => withGlobalStorage(null));

  it('A->B->A: each account sees exactly its own values; A content never flashes under B', () => {
    const s = new FakeStorage();
    seed(s);
    withGlobalStorage(s);

    const htmlA1 = renderTrackersFor('user-a');
    expect(htmlA1).toContain('500 / 2500 ml');
    expect(htmlA1).toContain('A: Vitamin D bloodwork');
    expect(htmlA1).not.toContain('250 / 2500 ml');
    expect(htmlA1).not.toContain('B: Insurance renewal');
    expect(htmlA1).not.toContain('Anon: ghost tracker');
    expect(htmlA1).not.toContain('999 / 2500 ml');

    const htmlB = renderTrackersFor('user-b');
    expect(htmlB).toContain('250 / 2500 ml');
    expect(htmlB).toContain('B: Insurance renewal');
    expect(htmlB).not.toContain('500 / 2500 ml');
    expect(htmlB).not.toContain('A: Vitamin D bloodwork');
    expect(htmlB).not.toContain('Anon: ghost tracker');

    const htmlA2 = renderTrackersFor('user-a');
    expect(htmlA2).toContain('500 / 2500 ml');
    expect(htmlA2).toContain('A: Vitamin D bloodwork');
    expect(htmlA2).not.toContain('B: Insurance renewal');
  });

  it('unresolved auth renders the gate — never the anon bucket, never any account data, no action controls', () => {
    const s = new FakeStorage();
    seed(s);
    withGlobalStorage(s);

    const html = renderTrackersFor('');
    expect(html).toContain('Sign in to manage life trackers');
    expect(html).toContain('Sign in to log water on this device.');
    expect(html).not.toContain('Anon: ghost tracker');
    expect(html).not.toContain('999 / 2500 ml');
    expect(html).not.toContain('A: Vitamin D bloodwork');
    expect(html).not.toContain('B: Insurance renewal');
    expect(html).not.toContain('500 / 2500 ml');
    // No per-account action controls exist while unresolved: nothing can be
    // written.
    expect(html).not.toContain('Quick Log +250ml Water');
    expect(html).not.toContain('+ Add Tracker');
    // Non-per-account surfaces still render: upcoming events + period card.
    expect(html).toContain('Upcoming Events');
    expect(html).toContain('Period');
  });

  it('unresolved->A hydration shows the A values, not the anon values', () => {
    const s = new FakeStorage();
    seed(s);
    withGlobalStorage(s);

    renderTrackersFor('');
    const htmlA = renderTrackersFor('user-a');
    expect(htmlA).toContain('500 / 2500 ml');
    expect(htmlA).toContain('A: Vitamin D bloodwork');
    expect(htmlA).not.toContain('Anon: ghost tracker');
    expect(htmlA).not.toContain('999 / 2500 ml');
  });

  it('logout/login (A -> unresolved -> A) keeps the A values intact', () => {
    const s = new FakeStorage();
    seed(s);
    withGlobalStorage(s);

    expect(renderTrackersFor('user-a')).toContain('500 / 2500 ml');
    const htmlGate = renderTrackersFor('');
    expect(htmlGate).toContain('Sign in to manage life trackers');
    expect(htmlGate).not.toContain('A: Vitamin D bloodwork');
    const htmlA = renderTrackersFor('user-a');
    expect(htmlA).toContain('500 / 2500 ml');
    expect(htmlA).toContain('A: Vitamin D bloodwork');
    expect(htmlA).not.toContain('Anon: ghost tracker');
  });

  it('unresolved render performs no writes anywhere (anon keys untouched)', () => {
    const s = new FakeStorage();
    // No anon keys exist yet — the old code would create them on first write.
    expect(saveWaterMl(s, waterLogKey('user-a'), TODAY, 500)).toBe(true);
    expect(saveLifeTrackers(s, lifeTrackersKey('user-a'), [TRK_A])).toBe(true);
    withGlobalStorage(s);

    renderTrackersFor('');
    expect(s.getItem(waterLogKey(''))).toBeNull();
    expect(s.getItem(lifeTrackersKey(''))).toBeNull();
    expect(loadWaterMl(s, waterLogKey('user-a'), TODAY)).toBe(500);
    expect(loadLifeTrackers(s, lifeTrackersKey('user-a'))).toEqual([TRK_A]);
  });

  it('safeStorage is the storage the component binds through', () => {
    const s = new FakeStorage();
    seed(s);
    withGlobalStorage(s);
    expect(safeStorage()).toBe(s);
    const html = renderTrackersFor('user-b');
    expect(html).toContain('250 / 2500 ml');
  });
});

// ---------------------------------------------------------------------------
// 3. Actions immediately after a transition write under the NEW keys only
// ---------------------------------------------------------------------------
describe('actions immediately after an account transition', () => {
  it('water log under B updates B storage; A storage stays byte-identical', () => {
    const s = new FakeStorage();
    seed(s);
    const aWaterBefore = s.getItem(waterLogKey('user-a'));
    const aTrackersBefore = s.getItem(lifeTrackersKey('user-a'));
    const anonWaterBefore = s.getItem(waterLogKey(''));
    const anonTrackersBefore = s.getItem(lifeTrackersKey(''));

    // Post-transition instance: freshly bound to B (what the account-keyed
    // remount produces in the browser).
    const binding = bindTrackersToAccount(
      s,
      'user-b',
      TODAY,
      bindTrackersToAccount(s, 'user-a', TODAY, null),
    );
    expect(binding.waterMl).toBe(250);

    // The exact call handleAddWater makes.
    const result = applyWaterLog(s, binding.waterKey as string, TODAY, binding.waterMl);
    expect(result.persisted).toBe(true);
    expect(result.nextMl).toBe(500);
    expect(loadWaterMl(s, waterLogKey('user-b'), TODAY)).toBe(500);
    // A's storage is byte-identical — the old bug overwrote B's key with A's
    // stale values.
    expect(s.getItem(waterLogKey('user-a'))).toBe(aWaterBefore);
    expect(s.getItem(lifeTrackersKey('user-a'))).toBe(aTrackersBefore);
    expect(s.getItem(waterLogKey(''))).toBe(anonWaterBefore);
    expect(s.getItem(lifeTrackersKey(''))).toBe(anonTrackersBefore);
  });

  it('create + delete tracker after transition never clobber the other account or anon', () => {
    const s = new FakeStorage();
    seed(s);
    const aTrackersBefore = s.getItem(lifeTrackersKey('user-a'));
    const anonTrackersBefore = s.getItem(lifeTrackersKey(''));

    let binding = bindTrackersToAccount(
      s,
      'user-b',
      TODAY,
      bindTrackersToAccount(s, 'user-a', TODAY, null),
    );
    const trackersKey = binding.trackersKey as string;

    // The exact call handleCreateTracker makes.
    const created = applyCreateTracker(s, trackersKey, binding.lifeTrackers, {
      title: 'B: new after transition',
      category: 'Countdown',
      targetDate: '2026-12-31',
      notes: '',
      tone: 'sky',
    });
    expect(created.persisted).toBe(true);
    binding = { ...binding, lifeTrackers: created.next };

    // The exact write path handleDeleteTracker uses.
    const next = binding.lifeTrackers.filter((t) => t.id !== 'lt-b-1');
    expect(saveLifeTrackers(s, trackersKey, next)).toBe(true);

    const storedB = loadLifeTrackers(s, trackersKey);
    expect(storedB).toHaveLength(1);
    expect(storedB[0].title).toBe('B: new after transition');
    expect(storedB.some((t) => t.id === 'lt-a-1')).toBe(false);

    expect(s.getItem(lifeTrackersKey('user-a'))).toBe(aTrackersBefore);
    expect(s.getItem(lifeTrackersKey(''))).toBe(anonTrackersBefore);
  });

  it('an unresolved binding exposes no keys, so no action can target any bucket', () => {
    const s = new FakeStorage();
    seed(s);
    const binding = bindTrackersToAccount(s, '', TODAY, null);
    expect(binding.waterKey).toBeNull();
    expect(binding.trackersKey).toBeNull();
    // Every component handler refuses a null key before reaching the action
    // helpers, and the gate hides all action controls — so no write path
    // exists while auth is unresolved.
  });
});
