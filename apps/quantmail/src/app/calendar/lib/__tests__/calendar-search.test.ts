/**
 * QM-SCREEN-026 — Calendar search honesty.
 *
 * Pins: (1) no latency promise is attached to search state copy;
 * (2) matching covers title/location/description/attendees as the
 * placeholder promises; (3) loading and degraded (server-load failure)
 * states can never be reported as "no matches".
 */
import { describe, it, expect } from 'vitest';
import {
  calendarEventMatchesQuery,
  calendarSearchStatus,
  filterCalendarEvents,
  stripCalendarMeta,
} from '../calendar-search';
import type { CalendarEventLike } from '../../types';

const base: CalendarEventLike = {
  id: 'ev-1',
  title: 'Sprint Review',
  location: 'Room 4',
  description: 'Weekly sync-up',
  attendees: ['ada@example.com'],
};

describe('calendarEventMatchesQuery', () => {
  it('matches title, location, description and attendees', () => {
    expect(calendarEventMatchesQuery(base, 'sprint')).toBe(true);
    expect(calendarEventMatchesQuery(base, 'room 4')).toBe(true);
    expect(calendarEventMatchesQuery(base, 'sync-up')).toBe(true);
    expect(calendarEventMatchesQuery(base, 'ada@example')).toBe(true);
  });

  it('matches attendee objects ({name, email}) as returned by some DTOs', () => {
    const ev = {
      ...base,
      attendees: [{ name: 'Grace Hopper', email: 'grace@example.com' }],
    } as unknown as CalendarEventLike;
    expect(calendarEventMatchesQuery(ev, 'grace hopper')).toBe(true);
  });

  it('does not match unrelated text, and empty query matches everything', () => {
    expect(calendarEventMatchesQuery(base, 'dentist')).toBe(false);
    expect(calendarEventMatchesQuery(base, '   ')).toBe(true);
    expect(filterCalendarEvents([base], '')).toHaveLength(1);
    expect(filterCalendarEvents([base], 'dentist')).toHaveLength(0);
  });

  it('never matches the internal __QUANT_META__ header', () => {
    const ev: CalendarEventLike = {
      ...base,
      description: '__QUANT_META__:{"type":"event","priority":"urgent"}:__END_QUANT_META__\nReal notes',
    };
    expect(calendarEventMatchesQuery(ev, 'urgent')).toBe(false);
    expect(calendarEventMatchesQuery(ev, 'real notes')).toBe(true);
    expect(stripCalendarMeta(ev.description)).toBe('Real notes');
  });
});

describe('calendarSearchStatus', () => {
  const q = { query: 'sprint' };

  it('is idle without a query', () => {
    expect(
      calendarSearchStatus({ query: '  ', isLoading: false, isFetching: false, error: null, matchCount: 0 }),
    ).toEqual({ phase: 'idle', message: null });
  });

  it('reports loading — never empty — while the server load is pending', () => {
    const s = calendarSearchStatus({ ...q, isLoading: true, isFetching: true, error: null, matchCount: 0 });
    expect(s.phase).toBe('loading');
    expect(s.message).toContain('Searching');
  });

  it('reports degraded — never empty — when the server load failed', () => {
    const s = calendarSearchStatus({
      ...q,
      isLoading: false,
      isFetching: false,
      error: new Error('boom'),
      matchCount: 0,
    });
    expect(s.phase).toBe('degraded');
    expect(s.message).toContain('server');
    expect(s.message).not.toContain('No events match');
  });

  it('reports empty only after a settled successful load with zero matches', () => {
    const s = calendarSearchStatus({ ...q, isLoading: false, isFetching: false, error: null, matchCount: 0 });
    expect(s.phase).toBe('empty');
    expect(s.message).toContain('No events match');
    expect(s.message).toContain('server');
  });

  it('reports updating while a refetch runs over existing results', () => {
    const s = calendarSearchStatus({ ...q, isLoading: false, isFetching: true, error: null, matchCount: 2 });
    expect(s.phase).toBe('updating');
  });

  it('reports results with a count, and no phase ever promises a latency', () => {
    const phases = [
      calendarSearchStatus({ ...q, isLoading: true, isFetching: false, error: null, matchCount: 0 }),
      calendarSearchStatus({ ...q, isLoading: false, isFetching: false, error: new Error('x'), matchCount: 0 }),
      calendarSearchStatus({ ...q, isLoading: false, isFetching: false, error: null, matchCount: 0 }),
      calendarSearchStatus({ ...q, isLoading: false, isFetching: true, error: null, matchCount: 3 }),
      calendarSearchStatus({ ...q, isLoading: false, isFetching: false, error: null, matchCount: 3 }),
    ];
    for (const s of phases) {
      expect(s.message ?? '').not.toMatch(/5\s?ms/i);
      expect(s.message ?? '').not.toMatch(/instant|sub-\d/i);
    }
    expect(phases[4]).toEqual({ phase: 'results', message: '3 events match “sprint”.' });
  });
});
