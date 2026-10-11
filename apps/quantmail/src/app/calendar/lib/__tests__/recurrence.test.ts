/**
 * Recurrence label <-> RRULE conversion.
 *
 * The event form holds human-readable labels but the backend only accepts
 * lowercase presets or real KEY=VALUE RRULEs. Sending labels verbatim is what
 * made "Every weekday (Monday to Friday)", "Annually (Every year)" and
 * "Custom interval…" fail to save with INVALID_RRULE.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCustomRRule,
  fromRRule,
  toRecurrenceRule,
} from '../recurrence';

describe('toRecurrenceRule', () => {
  it('maps every UI label to the RRULE the backend accepts', () => {
    expect(toRecurrenceRule('Daily')).toBe('FREQ=DAILY');
    expect(toRecurrenceRule('Weekly')).toBe('FREQ=WEEKLY');
    expect(toRecurrenceRule('Monthly')).toBe('FREQ=MONTHLY');
    expect(toRecurrenceRule('Every weekday (Monday to Friday)')).toBe(
      'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    );
    expect(toRecurrenceRule('Annually (Every year)')).toBe('FREQ=YEARLY');
  });

  it('returns null for "Does not repeat" and for missing labels', () => {
    expect(toRecurrenceRule('Does not repeat')).toBeNull();
    expect(toRecurrenceRule(null)).toBeNull();
    expect(toRecurrenceRule(undefined)).toBeNull();
  });

  it('passes already-built RRULEs through untouched', () => {
    expect(toRecurrenceRule('FREQ=WEEKLY;INTERVAL=2')).toBe('FREQ=WEEKLY;INTERVAL=2');
    expect(toRecurrenceRule('RRULE:FREQ=DAILY')).toBe('RRULE:FREQ=DAILY');
  });

  it('returns null for the bare "Custom interval…" label (the builder writes the RRULE)', () => {
    expect(toRecurrenceRule('Custom interval…')).toBeNull();
  });
});

describe('buildCustomRRule', () => {
  it('builds FREQ rules for each unit', () => {
    expect(buildCustomRRule(2, 'day')).toBe('FREQ=DAILY;INTERVAL=2');
    expect(buildCustomRRule(3, 'week')).toBe('FREQ=WEEKLY;INTERVAL=3');
    expect(buildCustomRRule(6, 'month')).toBe('FREQ=MONTHLY;INTERVAL=6');
    expect(buildCustomRRule(2, 'year')).toBe('FREQ=YEARLY;INTERVAL=2');
  });

  it('omits INTERVAL for 1 so fromRRule maps it back to the standard label', () => {
    expect(buildCustomRRule(1, 'week')).toBe('FREQ=WEEKLY');
    expect(fromRRule(buildCustomRRule(1, 'week'))).toBe('Weekly');
  });

  it('clamps to the 1–99 range', () => {
    expect(buildCustomRRule(0, 'day')).toBe('FREQ=DAILY');
    expect(buildCustomRRule(500, 'month')).toBe('FREQ=MONTHLY;INTERVAL=99');
  });

  it('round-trips through fromRRule into the custom label', () => {
    expect(fromRRule(buildCustomRRule(2, 'week'))).toBe('Custom interval…');
    expect(toRecurrenceRule(buildCustomRRule(2, 'week'))).toBe('FREQ=WEEKLY;INTERVAL=2');
  });
});
