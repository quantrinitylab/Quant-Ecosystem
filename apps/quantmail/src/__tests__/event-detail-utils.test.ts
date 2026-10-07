// @vitest-environment node
// ============================================================================
// K10 / M09 — event-detail formatting contract.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  formatWhen,
  isUrl,
  rsvpTone,
  toLocalInputValue,
  stripQuantMeta,
  RSVP_LABELS,
} from '../app/calendar/event/event-detail-utils';

describe('formatWhen', () => {
  it('renders a same-day range with the date once', () => {
    const text = formatWhen('2026-10-08T09:00:00.000Z', '2026-10-08T10:30:00.000Z', false, 'UTC');
    expect(text).toContain('2026');
    expect(text).toContain('–');
    // Same-day: the end side is time-only, so the year appears once.
    expect(text.match(/2026/g)).toHaveLength(1);
  });

  it('renders all-day events as a date with no clock time', () => {
    const text = formatWhen('2026-10-08T00:00:00.000Z', '2026-10-08T23:59:00.000Z', true, 'UTC');
    expect(text).not.toContain(':');
    expect(text).toContain('2026');
  });

  it('renders a multi-day range with both dates', () => {
    const text = formatWhen('2026-10-08T09:00:00.000Z', '2026-10-10T17:00:00.000Z', false, 'UTC');
    expect(text.match(/October/g)).toHaveLength(2);
  });

  it('says "Unknown time" for an unparseable start', () => {
    expect(formatWhen('not-a-date', '2026-10-08T10:00:00.000Z', false)).toBe('Unknown time');
  });
});

describe('isUrl', () => {
  it('accepts http(s) meeting links', () => {
    expect(isUrl('https://meet.quantmail.in/abc')).toBe(true);
    expect(isUrl('http://zoom.us/j/123')).toBe(true);
  });

  it('rejects room names and bare domains', () => {
    expect(isUrl('Room 4B')).toBe(false);
    expect(isUrl('meet.quantmail.in/abc')).toBe(false);
    expect(isUrl('')).toBe(false);
  });
});

describe('rsvpTone', () => {
  it('gives each RSVP state a distinct tone', () => {
    const tones = new Set(['accepted', 'declined', 'tentative', 'pending'].map(rsvpTone));
    expect(tones.size).toBe(4);
  });

  it('falls back to the neutral tone for unknown states', () => {
    expect(rsvpTone('nonsense')).toBe(rsvpTone('pending'));
  });
});

describe('RSVP_LABELS', () => {
  it('labels every status in plain words', () => {
    expect(RSVP_LABELS).toEqual({
      accepted: 'Accepted',
      declined: 'Declined',
      tentative: 'Maybe',
      pending: 'No response',
    });
  });
});

describe('toLocalInputValue', () => {
  it('formats a datetime-local value', () => {
    expect(toLocalInputValue('2026-10-08T09:05:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('returns empty for garbage', () => {
    expect(toLocalInputValue('garbage')).toBe('');
  });
});

describe('stripQuantMeta', () => {
  it('removes the embedded meta block', () => {
    const raw = 'Agenda here __QUANT_META__:{"a":1}:__END_QUANT_META__ more';
    expect(stripQuantMeta(raw)).toBe('Agenda here  more');
  });

  it('leaves plain descriptions alone', () => {
    expect(stripQuantMeta('Just a description')).toBe('Just a description');
  });

  it('handles undefined', () => {
    expect(stripQuantMeta(undefined)).toBe('');
  });
});
