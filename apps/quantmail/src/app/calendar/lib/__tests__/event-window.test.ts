import { describe, it, expect } from 'vitest';

import { defaultEventWindow, MAX_EVENT_QUERY_WINDOW_DAYS } from '../calendar-geometry';

/**
 * PAUD-P0-5 / QM-UIUX-078 regression: creating a calendar event toasted
 * "Event saved" but the event never appeared in month/week/search.
 *
 * Root cause: the page asked GET /events for an 18-month band
 * (month-8 → month+10 ≈ 546 days) while the backend's window query rejects
 * any span over 365 days (WINDOW_TOO_LARGE, 400). The list query failed on
 * every load — and the page swallowed the error — so the calendar rendered
 * permanently empty even though POST /events persisted fine.
 *
 * These tests pin the contract the page must honor: the prefetch window it
 * sends must always fit inside the backend's 365-day limit, whatever the
 * current date is (year boundaries, February, leap years).
 */

const spanDays = (today: Date) => {
  const { start, end } = defaultEventWindow(today);
  return (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000;
};

describe('defaultEventWindow (PAUD-P0-5: keep the GET /events band inside the backend 365-day contract)', () => {
  it('spans less than 365 days for a mid-year date', () => {
    expect(spanDays(new Date(2026, 9, 9))).toBeLessThan(MAX_EVENT_QUERY_WINDOW_DAYS);
  });

  it('spans less than 365 days across year boundaries and February', () => {
    const probes = [
      new Date(2026, 0, 15), // January — band crosses the new year
      new Date(2026, 1, 28), // February, non-leap
      new Date(2028, 1, 29), // February, leap year
      new Date(2026, 11, 31), // December — band crosses into next year
      new Date(2027, 6, 4), // July — band spans the longest months
    ];
    for (const today of probes) {
      expect(spanDays(today)).toBeLessThan(MAX_EVENT_QUERY_WINDOW_DAYS);
    }
  });

  it('covers the current month plus a multi-month buffer on both sides', () => {
    const today = new Date(2026, 9, 9); // Oct 2026
    const { start, end } = defaultEventWindow(today);
    const s = new Date(start);
    const e = new Date(end);
    // 1st of month-5 …
    expect([s.getFullYear(), s.getMonth(), s.getDate()]).toEqual([2026, 4, 1]);
    // … through the last day of month+5 (Oct 2026 + 5 = Mar 2027 → the 31st)
    expect([e.getFullYear(), e.getMonth(), e.getDate()]).toEqual([2027, 2, 31]);
    // today sits inside the band
    expect(s.getTime()).toBeLessThanOrEqual(today.getTime());
    expect(e.getTime()).toBeGreaterThanOrEqual(today.getTime());
  });

  it('returns ISO strings the backend can parse', () => {
    const { start, end } = defaultEventWindow(new Date(2026, 9, 9));
    expect(Number.isNaN(new Date(start).getTime())).toBe(false);
    expect(Number.isNaN(new Date(end).getTime())).toBe(false);
    expect(new Date(end).getTime()).toBeGreaterThan(new Date(start).getTime());
  });
});
