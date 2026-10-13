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
 *  3. the handlers: success toast + storage write when storage works, honest
 *     error toast + NO success toast when storage throws
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
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
  type StorageLike,
  type StoredLifeTracker,
} from '../lib/calendar-trackers-storage';
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
// 3. Handler honesty under a real-ish DOM (jsdom + testing-library)
// ---------------------------------------------------------------------------
describe('CalendarTrackersSubView handler honesty', () => {
  let rtl: typeof import('@testing-library/react');
  let toastBus: typeof import('../lib/toast-bus');
  let storage: FakeStorage;
  let toasts: Array<{ text: string; type: string }>;
  let unsubscribe: () => void;

  beforeAll(async () => {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
    const w = dom.window as unknown as Record<string, unknown>;
    // Node 22 exposes navigator as a getter-only global; defineProperty works.
    const setGlobal = (name: string, value: unknown): void => {
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    };
    setGlobal('window', w);
    setGlobal('document', w.document);
    setGlobal('navigator', w.navigator);
    setGlobal('HTMLElement', w.HTMLElement);
    setGlobal('HTMLInputElement', w.HTMLInputElement);
    setGlobal('HTMLSelectElement', w.HTMLSelectElement);
    setGlobal('Node', w.Node);
    setGlobal('Event', w.Event);
    setGlobal('MouseEvent', w.MouseEvent);
    setGlobal('getComputedStyle', (w.getComputedStyle as () => unknown).bind(w));
    setGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0));
    setGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    rtl = await import('@testing-library/react');
    toastBus = await import('../lib/toast-bus');
  });

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
    rtl.cleanup();
    storage.clear();
    withGlobalStorage(null);
  });

  it('water: persists the log AND toasts success when storage works', () => {
    rtl.render(<CalendarTrackersSubView userId="u1" />);
    rtl.fireEvent.click(rtl.screen.getByText('Quick Log +250ml Water'));

    const stored = loadWaterMl(storage, waterLogKey('u1'), todayKey());
    expect(stored).toBe(250);
    const success = toasts.find((t) => t.type === 'success' && t.text.includes('Logged +250ml water'));
    expect(success).toBeDefined();
    expect(success!.text).toContain('(250ml / 2500ml)');
    // And a refresh would show it — the value is in storage, not just state.
    expect(rtl.screen.getByText(/250 \/ 2500 ml/)).toBeTruthy();
  });

  it('water: honest error toast and NO success toast when storage throws', () => {
    storage.failWrites = true;
    rtl.render(<CalendarTrackersSubView userId="u1" />);
    rtl.fireEvent.click(rtl.screen.getByText('Quick Log +250ml Water'));

    const success = toasts.find((t) => t.type === 'success' && t.text.includes('Logged'));
    expect(success).toBeUndefined();
    const error = toasts.find((t) => t.type === 'error');
    expect(error).toBeDefined();
    expect(error!.text).toMatch(/could not save/i);
    expect(loadWaterMl(storage, waterLogKey('u1'), todayKey())).toBe(0);
  });

  it('tracker: persists the tracker AND toasts success when storage works', () => {
    rtl.render(<CalendarTrackersSubView userId="u1" />);
    rtl.fireEvent.click(rtl.screen.getByText('+ Add Tracker'));

    const titleInput = rtl.screen.getByPlaceholderText(/Car Insurance Renewal/);
    rtl.fireEvent.change(titleInput, { target: { value: 'Dentist visit' } });
    rtl.fireEvent.change(rtl.screen.getByLabelText('Target Date'), {
      target: { value: '2026-11-20' },
    });
    rtl.fireEvent.click(rtl.screen.getByText('Save Tracker'));

    const stored = loadLifeTrackers(storage, lifeTrackersKey('u1'));
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Dentist visit');
    const success = toasts.find((t) => t.type === 'success' && t.text.includes('Tracker added'));
    expect(success).toBeDefined();
    // The list renders the new tracker (state updated because persist succeeded).
    expect(rtl.screen.getByText('Dentist visit')).toBeTruthy();
  });

  it('tracker: honest error toast and NO success toast when storage throws', () => {
    storage.failWrites = true;
    rtl.render(<CalendarTrackersSubView userId="u1" />);
    rtl.fireEvent.click(rtl.screen.getByText('+ Add Tracker'));

    const titleInput = rtl.screen.getByPlaceholderText(/Car Insurance Renewal/);
    rtl.fireEvent.change(titleInput, { target: { value: 'Dentist visit' } });
    rtl.fireEvent.change(rtl.screen.getByLabelText('Target Date'), {
      target: { value: '2026-11-20' },
    });
    rtl.fireEvent.click(rtl.screen.getByText('Save Tracker'));

    const success = toasts.find((t) => t.type === 'success' && t.text.includes('Tracker added'));
    expect(success).toBeUndefined();
    const error = toasts.find((t) => t.type === 'error');
    expect(error).toBeDefined();
    expect(error!.text).toMatch(/could not save/i);
    // Nothing persisted and nothing shown as added — no fake success state.
    expect(loadLifeTrackers(storage, lifeTrackersKey('u1'))).toHaveLength(0);
    expect(rtl.screen.queryByText('Dentist visit')).toBeNull();
  });
});
