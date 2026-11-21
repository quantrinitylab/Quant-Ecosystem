import { describe, it, expect } from 'vitest';

import type { CalendarEventLike } from '../../types';
import { groupEventsByDay, lastDayOf, MAX_EVENT_SPAN_DAYS } from '../calendar-geometry';

/**
 * fix/qm-calendar-multiday-span regression: multi-day events used to be
 * bucketed by their start day only (page.tsx eventsByDay, the feed/month
 * bucketings in CalendarSubViews, and the week all-day row), so a 3-day
 * conference appeared on day 1 and days 2-3 rendered nothing.
 *
 * These tests pin the spanning contract every by-day consumer shares:
 * an event occupies every day from its start day through its last day,
 * where a midnight-exact end is exclusive (Google-style) and an
 * app-created all-day end (endDateT23:59:59) is inclusive.
 */

const ev = (
  id: string,
  startTime: string,
  endTime: string | undefined,
  allDay = false,
): CalendarEventLike => ({
  id,
  title: id,
  startTime,
  endTime,
  allDay,
});

const keysOf = (map: Record<string, CalendarEventLike[]>, id: string) =>
  Object.keys(map)
    .filter((k) => map[k]!.some((e) => e.id === id))
    .sort();

describe('lastDayOf', () => {
  it('returns the start day when the end is missing or invalid', () => {
    expect(lastDayOf(ev('a', '2026-10-05T09:00:00', undefined))?.toDateString()).toBe(
      new Date(2026, 9, 5).toDateString(),
    );
    expect(lastDayOf(ev('b', '2026-10-05T09:00:00', 'not-a-date'))?.toDateString()).toBe(
      new Date(2026, 9, 5).toDateString(),
    );
  });

  it('returns null for an invalid start', () => {
    expect(lastDayOf(ev('c', 'not-a-date', '2026-10-07T09:00:00'))).toBeNull();
  });

  it('treats a midnight-exact end as exclusive (last day is the day before)', () => {
    // Google-style all-day span: Mon 00:00 -> Thu 00:00 occupies Mon-Wed.
    expect(lastDayOf(ev('d', '2026-10-05T00:00:00', '2026-10-08T00:00:00'))?.toDateString()).toBe(
      new Date(2026, 9, 7).toDateString(),
    );
    // Timed event ending at midnight occupies only its start day.
    expect(lastDayOf(ev('e', '2026-10-05T21:00:00', '2026-10-06T00:00:00'))?.toDateString()).toBe(
      new Date(2026, 9, 5).toDateString(),
    );
  });

  it('treats a 23:59:59 all-day end as inclusive (app-created all-day span)', () => {
    expect(lastDayOf(ev('f', '2026-10-05T00:00:00', '2026-10-07T23:59:59'))?.toDateString()).toBe(
      new Date(2026, 9, 7).toDateString(),
    );
  });

  it('clamps an end before the start to the start day', () => {
    expect(lastDayOf(ev('g', '2026-10-05T09:00:00', '2026-10-04T09:00:00'))?.toDateString()).toBe(
      new Date(2026, 9, 5).toDateString(),
    );
  });
});

describe('groupEventsByDay', () => {
  it('spans a 3-day all-day conference across all three days (and no further)', () => {
    const map = groupEventsByDay([
      ev('conf', '2026-10-05T00:00:00', '2026-10-07T23:59:59', true),
    ]);
    expect(keysOf(map, 'conf')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('spans a Google-style exclusive-midnight all-day event across Mon-Wed only', () => {
    const map = groupEventsByDay([ev('conf', '2026-10-05T00:00:00', '2026-10-08T00:00:00', true)]);
    expect(keysOf(map, 'conf')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('spans a multi-day timed event across every day it touches', () => {
    const map = groupEventsByDay([ev('trip', '2026-10-05T09:00:00', '2026-10-07T17:00:00')]);
    expect(keysOf(map, 'trip')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('keeps a single-day event on exactly one day', () => {
    const map = groupEventsByDay([ev('one', '2026-10-05T09:00:00', '2026-10-05T10:00:00')]);
    expect(keysOf(map, 'one')).toEqual(['2026-10-05']);
  });

  it('spans across a month boundary', () => {
    const map = groupEventsByDay([ev('x', '2026-10-30T09:00:00', '2026-11-02T17:00:00')]);
    expect(keysOf(map, 'x')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('skips events with an invalid start and keeps input order within a day', () => {
    const map = groupEventsByDay([
      ev('a', '2026-10-05T09:00:00', '2026-10-06T10:00:00'),
      ev('bad', 'not-a-date', '2026-10-06T10:00:00'),
      ev('b', '2026-10-05T11:00:00', '2026-10-05T12:00:00'),
    ]);
    expect(map['2026-10-05']!.map((e) => e.id)).toEqual(['a', 'b']);
    expect(map['2026-10-06']!.map((e) => e.id)).toEqual(['a']);
    expect(Object.keys(map).some((k) => map[k]!.some((e) => e.id === 'bad'))).toBe(false);
  });

  it('bounds a garbage far-future end instead of looping forever', () => {
    const map = groupEventsByDay([ev('far', '2026-10-05T09:00:00', '9999-01-01T00:00:00')]);
    expect(keysOf(map, 'far').length).toBeLessThanOrEqual(MAX_EVENT_SPAN_DAYS);
    expect(keysOf(map, 'far')[0]).toBe('2026-10-05');
  });
});
