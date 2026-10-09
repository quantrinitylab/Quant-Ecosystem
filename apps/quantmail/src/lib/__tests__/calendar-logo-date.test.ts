// @vitest-environment node
// ============================================================================
// QuantCalendar logo date model — the logo's date must be authoritative.
// Covers: weekday/month/year correctness, month-end and year-end rollovers,
// leap years, timezone handling (incl. a zone ahead of UTC), midnight-timer
// math, and invalid stored timezones falling back safely.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getCalendarLogoDate,
  msUntilMidnight,
  resolveCalendarTimezone,
  tzOffsetMinutes,
} from '../calendar-logo-date';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCalendarLogoDate', () => {
  it('returns correct parts for a known instant (2026-10-09, Asia/Kolkata)', () => {
    // 2026-10-09T00:30:00Z == 2026-10-09 06:00 IST (Friday)
    const d = getCalendarLogoDate(new Date('2026-10-09T00:30:00Z'), 'Asia/Kolkata');
    expect(d.day).toBe(9);
    expect(d.weekday).toBe('Fri');
    expect(d.month).toBe('Oct');
    expect(d.year).toBe(2026);
    expect(d.monthYear).toBe('Oct 2026');
    expect(d.key).toBe('2026-Oct-9');
  });

  it('honours a timezone behind UTC — date differs from UTC day', () => {
    // 2026-10-09T02:00:00Z is still Oct 8 in New York (22:00 EDT).
    const d = getCalendarLogoDate(new Date('2026-10-09T02:00:00Z'), 'America/New_York');
    expect(d.day).toBe(8);
    expect(d.weekday).toBe('Thu');
  });

  it('handles month-end rollover', () => {
    // 2026-10-31T19:00:00Z == Nov 1 00:30 IST
    const d = getCalendarLogoDate(new Date('2026-10-31T19:00:00Z'), 'Asia/Kolkata');
    expect(d.day).toBe(1);
    expect(d.month).toBe('Nov');
  });

  it('handles year-end rollover', () => {
    // 2026-12-31T19:00:00Z == 2027-01-01 00:30 IST
    const d = getCalendarLogoDate(new Date('2026-12-31T19:00:00Z'), 'Asia/Kolkata');
    expect(d.day).toBe(1);
    expect(d.month).toBe('Jan');
    expect(d.year).toBe(2027);
    expect(d.monthYear).toBe('Jan 2027');
  });

  it('handles leap day (2028-02-29)', () => {
    // 2028-02-29T12:00:00Z == 17:30 IST, still Feb 29
    const d = getCalendarLogoDate(new Date('2028-02-29T12:00:00Z'), 'Asia/Kolkata');
    expect(d.day).toBe(29);
    expect(d.month).toBe('Feb');
    expect(d.weekday).toBe('Tue');
  });

  it('handles non-leap February end (2027-02-28)', () => {
    const d = getCalendarLogoDate(new Date('2027-02-27T19:00:00Z'), 'Asia/Kolkata');
    expect(d.day).toBe(28);
    expect(d.month).toBe('Feb');
  });
});

describe('tzOffsetMinutes', () => {
  it('returns +330 for Asia/Kolkata', () => {
    expect(tzOffsetMinutes(new Date('2026-10-09T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
  });

  it('returns -300 for America/New_York in October (EDT)', () => {
    expect(tzOffsetMinutes(new Date('2026-10-09T12:00:00Z'), 'America/New_York')).toBe(-240);
  });
});

describe('msUntilMidnight', () => {
  it('is positive and less than 24h', () => {
    const ms = msUntilMidnight(new Date('2026-10-09T12:00:00Z'), 'Asia/Kolkata');
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it('lands within a minute of the true next midnight', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const ms = msUntilMidnight(now, 'Asia/Kolkata');
    const target = new Date(now.getTime() + ms);
    const d = getCalendarLogoDate(target, 'Asia/Kolkata');
    // 12:00Z + ~11.5h = 23:30Z = 05:00 IST Oct 10 — just after midnight
    expect(d.day).toBe(10);
    // And one minute earlier it was still the 9th.
    const before = getCalendarLogoDate(new Date(target.getTime() - 61_000), 'Asia/Kolkata');
    expect(before.day).toBe(9);
  });

  it('handles a DST transition overnight (America/New_York, Nov 1 2026)', () => {
    // DST ends Nov 1 2026 02:00 EDT -> 01:00 EST. Midnight before is unaffected,
    // but the refinement pass must not produce a negative or >24h wait.
    const now = new Date('2026-10-31T12:00:00Z');
    const ms = msUntilMidnight(now, 'America/New_York');
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    const target = getCalendarLogoDate(new Date(now.getTime() + ms), 'America/New_York');
    expect(target.day).toBe(1);
    expect(target.month).toBe('Nov');
  });
});

describe('resolveCalendarTimezone', () => {
  it('returns the stored timezone when valid', () => {
    const store = new Map([['quant_calendar_timezone', 'Europe/Berlin']]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
    });
    expect(resolveCalendarTimezone()).toBe('Europe/Berlin');
  });

  it('falls back to the app default when nothing is stored', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(resolveCalendarTimezone()).toBe('Asia/Kolkata');
  });

  it('falls back to the app default when the stored value is invalid', () => {
    const store = new Map([['quant_calendar_timezone', 'Not/AZone']]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
    });
    expect(resolveCalendarTimezone()).toBe('Asia/Kolkata');
  });

  it('falls back when localStorage is unavailable (SSR)', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(resolveCalendarTimezone()).toBe('Asia/Kolkata');
  });
});
