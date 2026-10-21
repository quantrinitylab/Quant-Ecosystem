// ============================================================================
// Booking guest-day contract — CODEX-REVIEW follow-up on #1101.
//
// The slots request must name the GUEST's calendar day in the SELECTED
// timezone (not the browser-local date), and labels must land on that day.
// These tests pin:
//   - formatDateToYmdInTz: Y/M/D of an instant in an arbitrary IANA zone
//     (the day can differ from the browser-local date across zones).
//   - slotsWithinGuestDay: keeps only slots whose instants fall inside the
//     requested guest-day interval (stale-backend guard), empty in → empty out.
//
// renderToStaticMarkup-free pure-function tests (no @testing-library/react —
// CI runs pnpm install --frozen-lockfile and the package is not a dependency).
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import {
  formatDateToYmdInTz,
  slotsWithinGuestDay,
  formatSlotTimeLabelInTz,
  resolveSlotsResponse,
  type BookingSlotItem,
} from '../booking-utils';

describe('formatDateToYmdInTz', () => {
  it('names the calendar day in the given zone, not the browser-local one', () => {
    // 2026-10-15T18:30:00Z is Oct 16 in Kolkata (+5:30) but Oct 15 in UTC.
    const d = new Date('2026-10-15T18:30:00.000Z');
    expect(formatDateToYmdInTz(d, 'Asia/Kolkata')).toBe('2026-10-16');
    expect(formatDateToYmdInTz(d, 'UTC')).toBe('2026-10-15');
  });

  it('handles negative-offset zones (day boundary shifts back)', () => {
    // 2026-10-15T02:00:00Z is Oct 14 in Los Angeles (UTC-7 in October).
    const d = new Date('2026-10-15T02:00:00.000Z');
    expect(formatDateToYmdInTz(d, 'America/Los_Angeles')).toBe('2026-10-14');
  });

  it('zero-pads month and day', () => {
    expect(formatDateToYmdInTz(new Date('2028-01-05T12:00:00.000Z'), 'UTC')).toBe('2028-01-05');
  });
});

describe('slotsWithinGuestDay', () => {
  const slot = (iso: string): BookingSlotItem => ({
    start: new Date(iso),
    end: new Date(new Date(iso).getTime() + 60 * 60 * 1000),
    timeLabel: '',
    available: true,
  });

  it('drops slots labeled on another guest-local day (stale-backend guard)', () => {
    const slots = [
      slot('2026-10-15T00:30:00.000Z'), // 06:00 IST Oct 15 — keep
      slot('2026-10-14T18:00:00.000Z'), // 23:30 IST Oct 14 — drop
      slot('2026-10-15T18:00:00.000Z'), // 23:30 IST Oct 15 — keep
      slot('2026-10-15T19:00:00.000Z'), // 00:30 IST Oct 16 — drop
    ];
    const kept = slotsWithinGuestDay(slots, '2026-10-15', 'Asia/Kolkata');
    expect(kept.map((s) => s.start.toISOString())).toEqual([
      '2026-10-15T00:30:00.000Z',
      '2026-10-15T18:00:00.000Z',
    ]);
  });

  it('keeps everything when the backend already honored the guest day', () => {
    const slots = [slot('2026-10-15T00:30:00.000Z'), slot('2026-10-15T05:30:00.000Z')];
    expect(slotsWithinGuestDay(slots, '2026-10-15', 'Asia/Kolkata')).toHaveLength(2);
  });

  it('empty in → empty out (no invented slots)', () => {
    expect(slotsWithinGuestDay([], '2026-10-15', 'Asia/Kolkata')).toEqual([]);
  });
});

describe('resolveSlotsResponse + guest-day guard (integration)', () => {
  it('every label rendered in the guest zone lands on the requested guest day', () => {
    // Host-anchored instants spanning a zone boundary; the guard + labels
    // must agree on the guest day.
    const json = {
      success: true,
      data: [
        { start: '2026-10-15T00:30:00.000Z', end: '2026-10-15T01:30:00.000Z' },
        { start: '2026-10-15T19:00:00.000Z', end: '2026-10-15T20:00:00.000Z' },
      ],
    };
    const slots = resolveSlotsResponse(json, 'Asia/Kolkata');
    expect(slots).not.toBeNull();
    const guarded = slotsWithinGuestDay(slots!, '2026-10-15', 'Asia/Kolkata');
    expect(guarded).toHaveLength(1);
    expect(formatSlotTimeLabelInTz(guarded[0].start, 'Asia/Kolkata')).toBe('06:00 AM');
    expect(formatDateToYmdInTz(guarded[0].start, 'Asia/Kolkata')).toBe('2026-10-15');
  });
});

// ============================================================================
// Timezone-free guest-day keys (fix/qm-booking-journey-v2).
//
// The old page carried the selected day as a browser-local `Date` (midnight
// in the browser's zone) and re-derived YYYY-MM-DD per render. For a guest
// whose browser zone differs from the selected zone, browser-local midnight
// lands on a different calendar day in the selected zone — the slots
// request silently named the wrong day (off-by-one). Keys carry no instant,
// so no zone can reinterpret them.
// ============================================================================

import {
  guestDayKeyToYmd,
  compareGuestDayKeys,
  addDaysToKey,
  todayInTimeZone,
  weekdayInTimeZone,
  hostDatesForGuestDayInterval,
  isGuestDayEnabled,
  formatGuestDayHeader,
  formatGuestDayShort,
  defaultSelectedGuestDay,
  type GuestDayKey,
} from '../booking-utils';

describe('timezone-free guest-day keys', () => {
  it('guestDayKeyToYmd serializes the key directly — identical in every zone', () => {
    const key: GuestDayKey = { year: 2026, month: 10, day: 19 };
    expect(guestDayKeyToYmd(key)).toBe('2026-10-19');
    expect(guestDayKeyToYmd({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05');
  });

  it('compareGuestDayKeys orders days without instants', () => {
    const a: GuestDayKey = { year: 2026, month: 10, day: 19 };
    expect(compareGuestDayKeys(a, a)).toBe(0);
    expect(compareGuestDayKeys(a, { year: 2026, month: 10, day: 20 })).toBe(-1);
    expect(compareGuestDayKeys({ year: 2026, month: 11, day: 1 }, a)).toBe(1);
    expect(compareGuestDayKeys({ year: 2027, month: 1, day: 1 }, a)).toBe(1);
  });

  it('addDaysToKey crosses month/year boundaries with no zone involved', () => {
    expect(addDaysToKey({ year: 2026, month: 1, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 2,
      day: 1,
    });
    expect(addDaysToKey({ year: 2026, month: 1, day: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
      day: 31,
    });
    expect(addDaysToKey({ year: 2028, month: 2, day: 28 }, 1)).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
  });

  it('todayInTimeZone returns the zone calendar day, not the browser-local date', () => {
    // 2026-10-15T18:30:00Z is Oct 16 in Kolkata but Oct 15 in UTC.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-15T18:30:00.000Z'));
      expect(todayInTimeZone('Asia/Kolkata')).toEqual({ year: 2026, month: 10, day: 16 });
      expect(todayInTimeZone('UTC')).toEqual({ year: 2026, month: 10, day: 15 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('formatGuestDayHeader/formatGuestDayShort never reinterpret the day', () => {
    const key: GuestDayKey = { year: 2026, month: 10, day: 19 };
    expect(formatGuestDayHeader(key)).toBe('Monday, Oct 19, 2026');
    expect(formatGuestDayShort(key)).toBe('Oct 19');
  });

  it('defaultSelectedGuestDay is in the future and host-servable', () => {
    const key = defaultSelectedGuestDay('Asia/Kolkata');
    const today = todayInTimeZone('Asia/Kolkata');
    expect(compareGuestDayKeys(key, today)).toBeGreaterThan(0);
    expect(isGuestDayEnabled(key, 'Asia/Kolkata', 'UTC', [1, 2, 3, 4, 5])).toBe(true);
  });
});

describe('slot-authoritative day enablement', () => {
  // Guest day 2026-10-19 (Monday) in Kolkata spans host dates Oct 18 (Sun)
  // and Oct 19 (Mon) in New York. The old grid asked the BROWSER-LOCAL
  // weekday (d.getDay()) — in a UTC test env that is Monday (1).
  it('evaluates the host-timezone weekday, not the browser-local one', () => {
    const key: GuestDayKey = { year: 2026, month: 10, day: 19 };
    // Sunday IS an intersecting host date → enabled even though the
    // browser-local weekday (Monday) is not in [0].
    expect(isGuestDayEnabled(key, 'Asia/Kolkata', 'America/New_York', [0])).toBe(true);
    // Monday IS an intersecting host date → enabled for [1].
    expect(isGuestDayEnabled(key, 'Asia/Kolkata', 'America/New_York', [1])).toBe(true);
  });

  it('disables a day when no intersecting host date is in availableDays', () => {
    const key: GuestDayKey = { year: 2026, month: 10, day: 19 };
    // Intersecting host dates are Sun Oct 18 + Mon Oct 19 (New York).
    expect(isGuestDayEnabled(key, 'Asia/Kolkata', 'America/New_York', [2, 3, 4])).toBe(false);
    expect(isGuestDayEnabled(key, 'Asia/Kolkata', 'America/New_York', [])).toBe(false);
  });

  it('weekdayInTimeZone disagrees with the browser-local weekday across zones', () => {
    // 2026-10-19T00:30:00Z is still Oct 18 in New York (Sunday).
    expect(weekdayInTimeZone({ year: 2026, month: 10, day: 19 }, 'Asia/Kolkata')).toBe(1);
    expect(weekdayInTimeZone({ year: 2026, month: 10, day: 18 }, 'America/New_York')).toBe(0);
  });
});

describe('hostDatesForGuestDayInterval', () => {
  it('spans three host dates over the spring-forward transition — middle date not omitted', () => {
    // Synthetic 25h interval crossing both host midnights around the
    // 2026-03-08 US spring-forward (23h day). Endpoint sampling yields
    // {Mar 6, Mar 8} — the middle date Mar 7 would be silently omitted.
    const start = Date.UTC(2026, 2, 7, 4, 30);
    const end = Date.UTC(2026, 2, 8, 5, 30);
    const dates = hostDatesForGuestDayInterval(start, end, 'America/New_York');
    expect(dates).toEqual([
      { year: 2026, month: 3, day: 6 },
      { year: 2026, month: 3, day: 7 },
      { year: 2026, month: 3, day: 8 },
    ]);
  });

  it('covers the 25h fall-back day without omitting or inventing dates', () => {
    // Guest day 2026-11-01 in New York is 25 absolute hours (fall-back).
    const start = Date.UTC(2026, 10, 1, 4, 0);
    const end = Date.UTC(2026, 10, 2, 5, 0);
    const dates = hostDatesForGuestDayInterval(start, end, 'America/New_York');
    expect(dates).toEqual([{ year: 2026, month: 11, day: 1 }]);
  });

  it('returns a single date for an ordinary interval and [] for degenerate input', () => {
    const dates = hostDatesForGuestDayInterval(
      Date.UTC(2026, 9, 19, 0, 0),
      Date.UTC(2026, 9, 20, 0, 0),
      'UTC',
    );
    expect(dates).toEqual([{ year: 2026, month: 10, day: 19 }]);
    expect(hostDatesForGuestDayInterval(1000, 1000, 'UTC')).toEqual([]);
    expect(hostDatesForGuestDayInterval(2000, 1000, 'UTC')).toEqual([]);
  });
});
