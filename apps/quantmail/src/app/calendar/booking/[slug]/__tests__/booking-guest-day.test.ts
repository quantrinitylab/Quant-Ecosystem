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

import { describe, it, expect } from 'vitest';
import {
  formatDateToYmdInTz,
  slotsWithinGuestDay,
  formatSlotTimeLabelInTz,
  resolveSlotsResponse,
  generateGuestDaySlots,
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

describe('generateGuestDaySlots', () => {
  it('follows the same guest-day contract as the API (LA host / Kolkata guest)', () => {
    const slots = generateGuestDaySlots({
      year: 2028,
      month: 10,
      day: 5,
      guestTimeZone: 'Asia/Kolkata',
      hostTimeZone: 'America/Los_Angeles',
      startHour: 9,
      endHour: 17,
      durationMin: 60,
    });
    // Same geometry as the backend boundary test: 5 Wed-originated +
    // 3 Thu slots, all labeled on the guest's selected day.
    expect(slots).toHaveLength(8);
    expect(slots[0].start.toISOString()).toBe('2028-10-04T19:00:00.000Z');
    expect(slots[7].start.toISOString()).toBe('2028-10-05T18:00:00.000Z');
    for (const s of slots) {
      expect(formatDateToYmdInTz(s.start, 'Asia/Kolkata')).toBe('2028-10-05');
    }
  });

  it('never invents slots for another guest day', () => {
    const slots = generateGuestDaySlots({
      year: 2028,
      month: 10,
      day: 6,
      guestTimeZone: 'Pacific/Kiritimati',
      hostTimeZone: 'Pacific/Midway',
      startHour: 9,
      endHour: 17,
      durationMin: 60,
    });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(formatDateToYmdInTz(s.start, 'Pacific/Kiritimati')).toBe('2028-10-06');
    }
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
