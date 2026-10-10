/**
 * Calendar search — QM-SCREEN-026.
 *
 * Honesty contract:
 * - There is NO sub-5ms (or any) latency promise for Calendar search.
 *   Results are authorization-aware and hydrated from the server
 *   (`useCalendarEvents` → GET /events); this module only filters the
 *   server-returned events the client already holds. Copy derived from
 *   `calendarSearchStatus` must therefore say results come from the
 *   server and must surface loading / degraded states instead of
 *   presenting an empty list as "no matches" while a fetch is pending
 *   or has failed.
 * - Matching covers what the search placeholder promises — events,
 *   meetings and attendees — i.e. title, location, description and
 *   attendee names/emails, not title alone.
 */

import type { CalendarEventLike } from '../types';

/** Strip the internal `__QUANT_META__` header so it can never match a query. */
export function stripCalendarMeta(description: string | undefined): string {
  if (!description) return '';
  return description.replace(/__QUANT_META__:[\s\S]*?:__END_QUANT_META__\n?/, '');
}

function attendeeText(attendees: CalendarEventLike['attendees']): string {
  if (!Array.isArray(attendees)) return '';
  return attendees
    .map((a) => {
      if (typeof a === 'string') return a;
      const obj = a as unknown as { email?: string; name?: string };
      return [obj.name, obj.email].filter(Boolean).join(' ');
    })
    .join(' ');
}

/** True when `event` matches `query` on title, location, description or attendees. */
export function calendarEventMatchesQuery(event: CalendarEventLike, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    event.title || '',
    event.location || '',
    stripCalendarMeta(event.description),
    attendeeText(event.attendees),
  ]
    .join('\n')
    .toLowerCase();
  return haystack.includes(needle);
}

export function filterCalendarEvents<T extends CalendarEventLike>(events: T[], query: string): T[] {
  if (!query.trim()) return events;
  return events.filter((ev) => calendarEventMatchesQuery(ev, query));
}

export type CalendarSearchPhase =
  | 'idle'
  | 'loading'
  | 'degraded'
  | 'updating'
  | 'empty'
  | 'results';

export interface CalendarSearchStatus {
  phase: CalendarSearchPhase;
  /** User-visible copy for the phase; null only for `idle`. */
  message: string | null;
}

/**
 * Derive the honest search-UX state from the server query's real state.
 *
 * Priority: an active query with no server data yet is `loading` (never
 * "no results"); a failed server load is `degraded` (never "no matches");
 * a background refetch over existing results is `updating` (results may
 * be stale); only a settled, successful load may report `empty`/`results`.
 */
export function calendarSearchStatus(input: {
  query: string;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  matchCount: number;
}): CalendarSearchStatus {
  const query = input.query.trim();
  if (!query) return { phase: 'idle', message: null };

  if (input.isLoading) {
    return { phase: 'loading', message: 'Searching your calendar…' };
  }
  if (input.error) {
    return {
      phase: 'degraded',
      message: `Search unavailable — events couldn't be loaded from the server.`,
    };
  }
  if (input.matchCount === 0) {
    return {
      phase: 'empty',
      message: `No events match “${query}” in the calendar loaded from the server.`,
    };
  }
  if (input.isFetching) {
    return {
      phase: 'updating',
      message: `Showing ${input.matchCount} ${input.matchCount === 1 ? 'match' : 'matches'} — updating from the server…`,
    };
  }
  return {
    phase: 'results',
    message: `${input.matchCount} ${input.matchCount === 1 ? 'event matches' : 'events match'} “${query}”.`,
  };
}
