// ============================================================================
// event-detail-utils — timezone-aware input helpers (lane-1 QM-SCREEN-009 fix).
//
// The detail page's inline edit used to seed `datetime-local` inputs in the
// *browser* timezone and save without a zone, silently shifting events saved
// in another zone. These helpers pin the wall clock to the event's own zone:
// toZonedInputValue renders a stored instant as wall time in the zone, and
// zonedInputToIso parses wall time back to the same instant in that zone.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { toZonedInputValue, zonedInputToIso, toLocalInputValue } from '../event-detail-utils';

const NY = 'America/New_York'; // UTC-4 in October (EDT)
const KOLKATA = 'Asia/Kolkata'; // UTC+5:30, no DST

describe('toZonedInputValue', () => {
  it('renders the stored instant as wall time in the event zone', () => {
    expect(toZonedInputValue('2026-10-11T10:00:00.000Z', NY)).toBe('2026-10-11T06:00');
    expect(toZonedInputValue('2026-10-11T10:00:00.000Z', KOLKATA)).toBe('2026-10-11T15:30');
  });

  it('returns an empty string for an unparseable instant', () => {
    expect(toZonedInputValue('not-a-date', NY)).toBe('');
  });

  it('falls back to browser-local rendering for an invalid zone without throwing', () => {
    const fallback = toLocalInputValue('2026-10-11T10:00:00.000Z');
    expect(toZonedInputValue('2026-10-11T10:00:00.000Z', 'Mars/Olympus')).toBe(fallback);
  });
});

describe('zonedInputToIso', () => {
  it('parses wall time as belonging to the given zone', () => {
    expect(zonedInputToIso('2026-10-11T06:00', NY)).toBe('2026-10-11T10:00:00.000Z');
    expect(zonedInputToIso('2026-10-11T15:30', KOLKATA)).toBe('2026-10-11T10:00:00.000Z');
  });

  it('round-trips: seed then save preserves the stored instant (no silent shift)', () => {
    const stored = '2026-10-11T10:00:00.000Z';
    for (const tz of [NY, KOLKATA, 'UTC', 'Australia/Sydney']) {
      const seeded = toZonedInputValue(stored, tz);
      expect(zonedInputToIso(seeded, tz)).toBe(stored);
    }
  });

  it('falls back to browser-local parsing for an invalid zone without throwing', () => {
    const fallback = new Date('2026-10-11T06:00').toISOString();
    expect(zonedInputToIso('2026-10-11T06:00', 'Mars/Olympus')).toBe(fallback);
  });
});
