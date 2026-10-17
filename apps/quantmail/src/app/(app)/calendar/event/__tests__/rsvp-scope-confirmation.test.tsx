// ============================================================================
// RSVP scope confirmation — the v1 occurrence-vs-series contract made visible.
//
// Regression for the #1093 follow-up gap: after RSVPing from an occurrence
// page, the user got no confirmation of WHAT their RSVP covered — the write
// lands on the series-level attendee list (occurrences are virtual rows).
// The backend now reports rsvpScope; these tests pin the UI contract:
// the confirmation copy must name the exact scope (this event vs the entire
// series, and which occurrence the user responded from).
//
// renderToStaticMarkup (no @testing-library/react — CI runs
// pnpm install --frozen-lockfile and the package is not a dependency).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildRsvpScopeCopy,
  fallbackRsvpScope,
  formatOccurrenceLabel,
  type RsvpScopeInfo,
} from '../event-detail-utils';
import { RsvpScopeConfirmation } from '../rsvp-scope-confirmation';

const SERIES_FROM_OCCURRENCE: RsvpScopeInfo = {
  kind: 'occurrence',
  appliesTo: 'series',
  fromOccurrence: '2026-10-15T09:00:00.000Z',
};
const SERIES_FROM_SERIES: RsvpScopeInfo = {
  kind: 'event',
  appliesTo: 'series',
  fromOccurrence: null,
};
const SINGLE_EVENT: RsvpScopeInfo = {
  kind: 'event',
  appliesTo: 'event',
  fromOccurrence: null,
};

describe('buildRsvpScopeCopy', () => {
  it('names the whole series when the RSVP came from an occurrence page', () => {
    const copy = buildRsvpScopeCopy('accepted', SERIES_FROM_OCCURRENCE, 'Wed, Oct 15 · 2:30 PM');
    expect(copy).toContain('Accepted');
    expect(copy).toContain('entire series');
    // The user must see WHICH occurrence they responded from.
    expect(copy).toContain('Wed, Oct 15 · 2:30 PM');
  });

  it('names the whole series without an occurrence when RSVPing from the series page', () => {
    const copy = buildRsvpScopeCopy('declined', SERIES_FROM_SERIES);
    expect(copy).toContain('Declined');
    expect(copy).toContain('entire series');
    expect(copy).not.toContain('responded from');
  });

  it('says "this event" for a non-recurring event — never "series"', () => {
    const copy = buildRsvpScopeCopy('tentative', SINGLE_EVENT);
    expect(copy).toBe('Maybe — recorded for this event.');
    expect(copy).not.toContain('series');
  });

  it('falls back to the raw occurrence ISO when no formatted label is given', () => {
    const copy = buildRsvpScopeCopy('accepted', SERIES_FROM_OCCURRENCE);
    expect(copy).toContain('2026-10-15T09:00:00.000Z');
  });
});

describe('fallbackRsvpScope', () => {
  it('derives occurrence+series from an occurrence id on a recurring event', () => {
    expect(fallbackRsvpScope('e1_2026-10-15T09:00:00.000Z', 'FREQ=WEEKLY')).toEqual(
      SERIES_FROM_OCCURRENCE,
    );
  });

  it('derives event+series from a plain id on a recurring event', () => {
    expect(fallbackRsvpScope('e1', 'FREQ=WEEKLY')).toEqual(SERIES_FROM_SERIES);
  });

  it('derives event+event for a non-recurring event', () => {
    expect(fallbackRsvpScope('e1', null)).toEqual(SINGLE_EVENT);
  });
});

describe('formatOccurrenceLabel', () => {
  it('renders a human label in the event zone, not the raw ISO', () => {
    const label = formatOccurrenceLabel('2026-10-15T09:00:00.000Z', 'Asia/Kolkata');
    expect(label).not.toBe('2026-10-15T09:00:00.000Z');
    expect(label).toContain('Oct');
    expect(label).toContain('15');
  });

  it('returns the raw ISO for an unparseable input', () => {
    expect(formatOccurrenceLabel('not-a-date')).toBe('not-a-date');
  });
});

describe('RsvpScopeConfirmation', () => {
  it('renders the scoped confirmation as an accessible status message', () => {
    const html = renderToStaticMarkup(
      <RsvpScopeConfirmation
        status="accepted"
        scope={SERIES_FROM_OCCURRENCE}
        timeZone="Asia/Kolkata"
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('entire series');
    // The occurrence the user responded from, formatted in the event's zone.
    expect(html).toContain('Oct');
  });

  it('reflects the correct scope for a single event', () => {
    const html = renderToStaticMarkup(
      <RsvpScopeConfirmation status="declined" scope={SINGLE_EVENT} />,
    );
    expect(html).toContain('Declined — recorded for this event.');
    expect(html).not.toContain('series');
  });
});
