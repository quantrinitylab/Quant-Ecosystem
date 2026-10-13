/**
 * calendar-trackers-persistence.test.tsx
 *
 * Regression tests for the water-log / custom-life-trackers fake-success fix.
 *
 * The bug: CalendarTrackersSubView's waterMl/lifeTrackers were plain useState
 * with zero persistence, yet handleAddWater toasted "Logged +250ml water" and
 * handleCreateTracker toasted "Tracker added" — a refresh wiped everything the
 * user was told was recorded.
 *
 * The fix: both persist to localStorage (per-user, date-scoped for water) via
 * src/lib/calendar-trackers-storage.ts, and success toasts fire ONLY after the
 * write landed. These tests pin:
 *  1. the storage module: round-trips, per-user keys, daily water reset,
 *     corrupt-data degradation, and false-on-write-failure (the honesty contract)
 *  2. the component renders persisted values on mount (no more always-zero)
 *  3. the handlers' honesty: the persist-then-toast action helpers the
 *     component delegates to (applyWaterLog / applyCreateTracker) yield the
 *     success toast only when the write landed, and an honest error toast —
 *     with no state advance — when storage throws. DOM-free by design:
 *     neither jsdom nor @testing-library/react is a dependency of this
 *     package, so importing them fails CI's frozen-lockfile gate.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  type StorageLike,
  type StoredLifeTracker,
} from '../lib/calendar-trackers-storage';
import * as toastBus from '../lib/toast-bus';
import { CalendarTrackersSubView } from '../components/CalendarSubViews';

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

// ---------------------------------------------------------------------------
// 1. Storage module
// ---------------------------------------------------------------------------
describe('calendar-trackers-storage', () => {
  it('scopes keys per user', () => {
    expect(waterLogKey('user-a')).not.toBe(waterLogKey('user-b'));
    expect(lifeTrackersKey('user-a')).not.toBe(lifeTrackersKey('user-b'));
    expect(waterLogKey('user-a')).not.toBe(lifeTrackersKey('user-a'));
    expect(waterLogKey('')).toBe(waterLogKey('')); // stable anon fallback
  });

  it('round-trips the water log for today', () => {
    const s = new FakeStorage();
    const key = waterLogKey('u1');
    const today = todayKey();
    expect(loadWaterMl(s, key, today)).toBe(0);
    expect(saveWaterMl(s, key, today, 500)).toBe(true);
    expect(loadWaterMl(s, key, today)).toBe(500);
    expect(saveWaterMl(s, key, today, 750)).toBe(true);
    expect(loadWaterMl(s, key, today)).toBe(750);
  });

  it("does not carry yesterday's water total into today", () => {
    const s = new FakeStorage();
    const key = waterLogKey('u1');
    const yesterday = todayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    expect(saveWaterMl(s, key, yesterday, 2000)).toBe(true);
    expect(loadWaterMl(s, key, todayKey())).toBe(0);
  });

  it('degrades corrupt water payloads to 0, never NaN or negative', () => {
    const s = new FakeStorage();
    const key = waterLogKey('u1');
    const today = todayKey();
    s.setItem(key, 'not-json{{');
    expect(loadWaterMl(s, key, today)).toBe(0);
    s.setItem(key, JSON.stringify({ date: today, ml: -50 }));
    expect(loadWaterMl(s, key, today)).toBe(0);
    s.setItem(key, JSON.stringify({ date: today, ml: 'lots' }));
    expect(loadWaterMl(s, key, today)).toBe(0);
    s.setItem(key, JSON.stringify({ date: today }));
    expect(loadWaterMl(s, key, today)).toBe(0);
    expect(saveWaterMl(s, key, today, NaN)).toBe(false);
    expect(saveWaterMl(s, key, today, -10)).toBe(false);
  });

  it('reports write failure as false so the UI can toast honestly', () => {
    const s = new FakeStorage();
    const key = waterLogKey('u1');
    const today = todayKey();
    expect(saveWaterMl(s, key, today, 250)).toBe(true);
    s.failWrites = true;
    expect(saveWaterMl(s, key, today, 500)).toBe(false);
    expect(loadWaterMl(s, key, today)).toBe(250); // last good write still intact
    expect(saveWaterMl(null, key, today, 500)).toBe(false); // no storage at all
    expect(loadWaterMl(null, key, today)).toBe(0);
  });

  it('round-trips life trackers', () => {
    const s = new FakeStorage();
    const key = lifeTrackersKey('u1');
    expect(loadLifeTrackers(s, key)).toEqual([]);
    const trackers: StoredLifeTracker[] = [
      { id: 'lt-1', title: 'Dentist', category: 'Medical / Health', targetDate: '2026-11-01', notes: '', tone: 'rose' },
      { id: 'lt-2', title: 'Insurance', category: 'Legal / Documents', targetDate: '2026-12-01', notes: 'policy 42', tone: 'sky' },
    ];
    expect(saveLifeTrackers(s, key, trackers)).toBe(true);
    expect(loadLifeTrackers(s, key)).toEqual(trackers);
  });

  it('drops invalid tracker entries and normalizes unknown enums instead of showing them raw', () => {
    const s = new FakeStorage();
    const key = lifeTrackersKey('u1');
    s.setItem(
      key,
      JSON.stringify([
        { id: 'lt-1', title: 'Good', category: 'Weird', targetDate: '2026-11-01', notes: '', tone: 'neon' },
        { id: '', title: '', targetDate: '' }, // invalid: dropped
        'garbage', // invalid: dropped
        null, // invalid: dropped
      ]),
    );
    const loaded = loadLifeTrackers(s, key);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('Good');
    expect(loaded[0].category).toBe('Countdown'); // normalized fallback
    expect(loaded[0].tone).toBe('sky'); // normalized fallback
  });

  it('returns false on tracker write failure and [] on corrupt payloads', () => {
    const s = new FakeStorage();
    const key = lifeTrackersKey('u1');
    const t: StoredLifeTracker = {
      id: 'lt-1', title: 'Dentist', category: 'Medical / Health',
      targetDate: '2026-11-01', notes: '', tone: 'rose',
    };
    expect(saveLifeTrackers(s, key, [t])).toBe(true);
    s.failWrites = true;
    expect(saveLifeTrackers(s, key, [])).toBe(false);
    expect(loadLifeTrackers(s, key)).toHaveLength(1); // last good write intact
    s.failWrites = false;
    s.setItem(key, 'broken{{{');
    expect(loadLifeTrackers(s, key)).toEqual([]);
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
describe('CalendarTrackersSubView loads persisted state', () => {
  afterEach(() => withGlobalStorage(null));

  it('shows the persisted water total instead of always 0', () => {
    const s = new FakeStorage();
    const today = todayKey();
    expect(saveWaterMl(s, waterLogKey('u9'), today, 500)).toBe(true);
    withGlobalStorage(s);
    const html = renderToStaticMarkup(<CalendarTrackersSubView userId="u9" />);
    expect(html).toContain('500 / 2500 ml');
  });

  it('starts the day at 0 even when yesterday had a log', () => {
    const s = new FakeStorage();
    const yesterday = todayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    expect(saveWaterMl(s, waterLogKey('u9'), yesterday, 2000)).toBe(true);
    withGlobalStorage(s);
    const html = renderToStaticMarkup(<CalendarTrackersSubView userId="u9" />);
    expect(html).toContain('0 / 2500 ml');
    expect(html).not.toContain('2000 / 2500 ml');
  });

  it('renders persisted custom trackers', () => {
    const s = new FakeStorage();
    const t: StoredLifeTracker = {
      id: 'lt-1', title: 'Dentist appointment', category: 'Medical / Health',
      targetDate: '2026-11-01', notes: '', tone: 'rose',
    };
    expect(saveLifeTrackers(s, lifeTrackersKey('u9'), [t])).toBe(true);
    withGlobalStorage(s);
    const html = renderToStaticMarkup(<CalendarTrackersSubView userId="u9" />);
    expect(html).toContain('Dentist appointment');
  });

  it('keeps users isolated: user B does not see user A logs', () => {
    const s = new FakeStorage();
    const today = todayKey();
    expect(saveWaterMl(s, waterLogKey('user-a'), today, 750)).toBe(true);
    withGlobalStorage(s);
    const html = renderToStaticMarkup(<CalendarTrackersSubView userId="user-b" />);
    expect(html).toContain('0 / 2500 ml');
    expect(html).not.toContain('750 / 2500 ml');
  });
});

// ---------------------------------------------------------------------------
// 3. Handler honesty: the persist-then-toast action helpers
//
// These are the EXACT functions the component's handleAddWater /
// handleCreateTracker delegate to — the write-first-then-toast decision lives
// here, so the "success toast ONLY after the write landed" contract is pinned
// without jsdom or @testing-library/react (neither is installed in this
// package; CI's frozen-lockfile gate cannot resolve them).
// ---------------------------------------------------------------------------
describe('CalendarTrackersSubView handler honesty (action helpers)', () => {
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

  it('water: persists the log AND yields the success toast when storage works', () => {
    // Exactly what handleAddWater does: write first, then toast whatever the
    // action reports.
    const result = applyWaterLog(storage, waterLogKey('u1'), todayKey(), 0);
    expect(result.persisted).toBe(true);
    toastBus.showToast(result.toast);

    expect(loadWaterMl(storage, waterLogKey('u1'), todayKey())).toBe(250);
    const success = toasts.find((t) => t.type === 'success' && t.text.includes('Logged +250ml water'));
    expect(success).toBeDefined();
    expect(success!.text).toContain('(250ml / 2500ml)');
    // The total the UI would render next comes from the action, not thin air.
    expect(result.nextMl).toBe(250);
  });

  it('water: honest error toast and NO success toast when storage throws', () => {
    storage.failWrites = true;
    const result = applyWaterLog(storage, waterLogKey('u1'), todayKey(), 0);
    expect(result.persisted).toBe(false);
    toastBus.showToast(result.toast);

    const success = toasts.find((t) => t.type === 'success' && t.text.includes('Logged'));
    expect(success).toBeUndefined();
    const error = toasts.find((t) => t.type === 'error');
    expect(error).toBeDefined();
    expect(error!.text).toMatch(/could not save/i);
    expect(loadWaterMl(storage, waterLogKey('u1'), todayKey())).toBe(0);
    // The UI must keep showing the old total, never the failed increment.
    expect(result.nextMl).toBe(0);
  });

  it('tracker: persists the tracker AND yields the success toast when storage works', () => {
    const result = applyCreateTracker(storage, lifeTrackersKey('u1'), [], {
      title: 'Dentist visit',
      category: 'Medical / Health',
      targetDate: '2026-11-20',
      notes: '',
      tone: 'rose',
    });
    expect(result.persisted).toBe(true);
    toastBus.showToast(result.toast);

    const stored = loadLifeTrackers(storage, lifeTrackersKey('u1'));
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Dentist visit');
    const success = toasts.find((t) => t.type === 'success' && t.text.includes('Tracker added'));
    expect(success).toBeDefined();
    expect(success!.text).toContain('Dentist visit');
  });

  it('tracker: honest error toast and NO success toast when storage throws', () => {
    storage.failWrites = true;
    const result = applyCreateTracker(storage, lifeTrackersKey('u1'), [], {
      title: 'Dentist visit',
      category: 'Medical / Health',
      targetDate: '2026-11-20',
      notes: '',
      tone: 'rose',
    });
    expect(result.persisted).toBe(false);
    toastBus.showToast(result.toast);

    const success = toasts.find((t) => t.type === 'success' && t.text.includes('Tracker added'));
    expect(success).toBeUndefined();
    const error = toasts.find((t) => t.type === 'error');
    expect(error).toBeDefined();
    expect(error!.text).toMatch(/could not save/i);
    // Nothing persisted and nothing claimed as added — no fake success state.
    expect(loadLifeTrackers(storage, lifeTrackersKey('u1'))).toHaveLength(0);
    expect(result.next).toHaveLength(0);
  });
});
