// ============================================================================
// find-a-time.test.ts — slot suggestion logic for the "Find a time" affordance.
//
// Pure unit tests (no DOM): the algorithm must exclude real busy blocks,
// respect duration + working hours, cap suggestions, and never invent data
// (malformed busy blocks are ignored, not guessed).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { suggestOpenSlots, formDurationMs, type FreeBusyBlock } from '../find-a-time';

// Local-time helper so tests are deterministic in any container timezone.
const at = (day: number, hour: number, minute = 0): Date =>
  new Date(2026, 9, day, hour, minute, 0, 0);

const block = (start: Date, end: Date): FreeBusyBlock => ({
  start: start.toISOString(),
  end: end.toISOString(),
});

const windowForDay = (day: number): [Date, Date] => [at(day, 0), at(day + 7, 0)];

describe('suggestOpenSlots', () => {
  it('returns an empty grid of working-hour slots when there is no busy data', () => {
    const [ws, we] = windowForDay(12);
    const slots = suggestOpenSlots([], ws, we, { durationMs: 30 * 60 * 1000 });
    expect(slots).toHaveLength(6); // default maxSuggestions
    for (const s of slots) {
      expect(s.start.getHours()).toBeGreaterThanOrEqual(9);
      expect(s.end.getHours() * 60 + s.end.getMinutes()).toBeLessThanOrEqual(18 * 60);
      expect(s.end.getTime() - s.start.getTime()).toBe(30 * 60 * 1000);
    }
  });

  it('excludes slots that overlap a real busy block', () => {
    const [ws, we] = windowForDay(12);
    // Busy 10:00–12:00 on the first day.
    const busy = [block(at(12, 10), at(12, 12))];
    const slots = suggestOpenSlots(busy, ws, we, {
      durationMs: 60 * 60 * 1000,
      maxSuggestions: 100,
    });
    const day12 = slots.filter((s) => s.start.getDate() === 12);
    for (const s of day12) {
      const overlap = s.start.getTime() < at(12, 12).getTime() && s.end.getTime() > at(12, 10).getTime();
      expect(overlap).toBe(false);
    }
    // 11:30–12:30 would overlap; 12:00–13:00 must survive.
    expect(day12.some((s) => s.start.getHours() === 12 && s.start.getMinutes() === 0)).toBe(true);
  });

  it('requires the full duration to fit before the working-day end', () => {
    const [ws, we] = windowForDay(12);
    const slots = suggestOpenSlots([], ws, we, {
      durationMs: 2 * 60 * 60 * 1000, // 2 hours
      granularityMinutes: 60,
      maxSuggestions: 100,
    });
    const day12 = slots.filter((s) => s.start.getDate() === 12);
    // Last possible 2h slot starts 16:00, ends exactly 18:00.
    expect(day12[day12.length - 1]!.start.getHours()).toBe(16);
    expect(day12.some((s) => s.start.getHours() === 17)).toBe(false);
  });

  it('caps suggestions at maxSuggestions, oldest days first', () => {
    const [ws, we] = windowForDay(12);
    const slots = suggestOpenSlots([], ws, we, { maxSuggestions: 3 });
    expect(slots).toHaveLength(3);
    expect(slots[0]!.start.getDate()).toBe(12);
    expect(slots[1]!.start.getTime()).toBeGreaterThan(slots[0]!.start.getTime());
  });

  it('ignores malformed busy blocks instead of inventing around them', () => {
    const [ws, we] = windowForDay(12);
    const busy = [
      { start: 'not-a-date', end: 'also-not-a-date' },
      { start: at(12, 10).toISOString(), end: at(12, 9).toISOString() }, // end <= start
      null,
      undefined,
    ] as unknown as FreeBusyBlock[];
    const slots = suggestOpenSlots(busy, ws, we, { maxSuggestions: 4 });
    // Treated as absent: the grid is the full working-day grid.
    expect(slots).toHaveLength(4);
    expect(slots[0]!.start.getHours()).toBe(9);
  });

  it('clips busy blocks to the search window', () => {
    // Busy block starts before the window and ends mid-morning of day 12.
    const busy = [block(at(11, 8), at(12, 10))];
    const [ws, we] = windowForDay(12);
    const slots = suggestOpenSlots(busy, ws, we, {
      durationMs: 60 * 60 * 1000,
      maxSuggestions: 100,
    });
    const day12 = slots.filter((s) => s.start.getDate() === 12);
    for (const s of day12) {
      expect(s.start.getTime() >= at(12, 10).getTime() || s.end.getTime() <= at(12, 10).getTime()).toBe(
        true,
      );
    }
    expect(day12.some((s) => s.start.getHours() === 10)).toBe(true);
  });

  it('returns [] for invalid inputs instead of throwing', () => {
    const [ws, we] = windowForDay(12);
    expect(suggestOpenSlots([], we, ws)).toEqual([]); // end <= start
    expect(suggestOpenSlots([], new Date('x'), we)).toEqual([]);
    expect(suggestOpenSlots([], ws, we, { durationMs: -5 })).toEqual([]);
    expect(suggestOpenSlots([], ws, we, { maxSuggestions: 0 })).toEqual([]);
    expect(suggestOpenSlots(null, ws, we)).toHaveLength(6);
  });
});

describe('formDurationMs', () => {
  it('parses the wall-clock form inputs', () => {
    expect(formDurationMs('2026-10-12', '10:00', '2026-10-12', '11:30')).toBe(90 * 60 * 1000);
  });

  it('falls back to 30 minutes on missing or invalid inputs', () => {
    const dflt = 30 * 60 * 1000;
    expect(formDurationMs('', '', '', '')).toBe(dflt);
    expect(formDurationMs('2026-10-12', '11:00', '2026-10-12', '10:00')).toBe(dflt);
    expect(formDurationMs('bogus', '10:00', '2026-10-12', '11:00')).toBe(dflt);
  });
});
