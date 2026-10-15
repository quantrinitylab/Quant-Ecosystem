// ============================================================================
// nlpEventParser — fix/qm-calendar-nlp-quickadd
//
// The dependency-free natural-language parser behind the calendar `q`
// quick-add. Every case pins `now` to a fixed Wednesday (2026-10-14 09:00)
// so expectations are calendar-exact, not "tomorrow-ish".
// ============================================================================

import { describe, it, expect } from 'vitest';
import { parseQuickAdd } from '../nlpEventParser';

// Wednesday 2026-10-14, 09:00 local.
const NOW = new Date(2026, 9, 14, 9, 0, 0, 0);

function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

describe('parseQuickAdd', () => {
  it('parses the finding\'s headline example: "Lunch with Sam 1pm"', () => {
    const hit = parseQuickAdd('Lunch with Sam 1pm', NOW);
    expect(hit).not.toBeNull();
    expect(hit!.title).toBe('Lunch with Sam');
    expect(isoLocal(hit!.start)).toBe('2026-10-14T13:00');
    expect(isoLocal(hit!.end)).toBe('2026-10-14T14:00');
    expect(hit!.allDay).toBe(false);
  });

  it('handles "tomorrow at 9am"', () => {
    const hit = parseQuickAdd('Dentist tomorrow at 9am', NOW);
    expect(hit!.title).toBe('Dentist');
    expect(isoLocal(hit!.start)).toBe('2026-10-15T09:00');
    expect(isoLocal(hit!.end)).toBe('2026-10-15T10:00');
  });

  it('resolves a bare weekday to the upcoming one ("Friday" → Oct 16)', () => {
    const hit = parseQuickAdd('Call mom Friday 6pm', NOW);
    expect(hit!.title).toBe('Call mom');
    expect(isoLocal(hit!.start)).toBe('2026-10-16T18:00');
  });

  it('"next Monday" skips the coming Monday and takes the one after', () => {
    const hit = parseQuickAdd('Planning next Monday 10:00', NOW);
    expect(isoLocal(hit!.start)).toBe('2026-10-19T10:00');
  });

  it('parses numeric month/day ("10/20 3pm")', () => {
    const hit = parseQuickAdd('Flight 10/20 3pm', NOW);
    expect(hit!.title).toBe('Flight');
    expect(isoLocal(hit!.start)).toBe('2026-10-20T15:00');
  });

  it('parses month names ("25 Dec 10am") and rolls a past date to next year', () => {
    const hit = parseQuickAdd('Christmas party 25 Dec 10am', NOW);
    expect(isoLocal(hit!.start)).toBe('2026-12-25T10:00');
    const past = parseQuickAdd('Review 1 Jan 9am', NOW);
    expect(isoLocal(past!.start)).toBe('2027-01-01T09:00');
  });

  it('handles relative "in 2 hours"', () => {
    const hit = parseQuickAdd('Standup in 2 hours', NOW);
    expect(hit!.title).toBe('Standup');
    expect(isoLocal(hit!.start)).toBe('2026-10-14T11:00');
    expect(isoLocal(hit!.end)).toBe('2026-10-14T12:00');
  });

  it('"tonight" pins 20:00 today', () => {
    const hit = parseQuickAdd('Dinner tonight', NOW);
    expect(hit!.title).toBe('Dinner');
    expect(isoLocal(hit!.start)).toBe('2026-10-14T20:00');
  });

  it('honors an explicit duration ("for 90 minutes")', () => {
    const hit = parseQuickAdd('Deep work for 90 minutes tomorrow 2pm', NOW);
    expect(hit!.title).toBe('Deep work');
    expect(isoLocal(hit!.start)).toBe('2026-10-15T14:00');
    expect(isoLocal(hit!.end)).toBe('2026-10-15T15:30');
  });

  it('a date with no time becomes an all-day event', () => {
    const hit = parseQuickAdd('Dentist tomorrow', NOW);
    expect(hit!.allDay).toBe(true);
    expect(isoLocal(hit!.start)).toBe('2026-10-15T00:00');
  });

  it('understands "noon" and 24-hour times', () => {
    expect(isoLocal(parseQuickAdd('Lunch noon', NOW)!.start)).toBe('2026-10-14T12:00');
    expect(isoLocal(parseQuickAdd('Deploy 14:30', NOW)!.start)).toBe('2026-10-14T14:30');
  });

  it('pushes a time earlier today to tomorrow instead of the past', () => {
    const hit = parseQuickAdd('Coffee 7am', NOW);
    expect(isoLocal(hit!.start)).toBe('2026-10-15T07:00');
  });

  it('returns null when there is nothing schedulable — never invents a date', () => {
    expect(parseQuickAdd('just some words', NOW)).toBeNull();
    expect(parseQuickAdd('', NOW)).toBeNull();
    expect(parseQuickAdd('   ', NOW)).toBeNull();
  });

  it('returns null when no title survives token stripping', () => {
    expect(parseQuickAdd('1pm', NOW)).toBeNull();
    expect(parseQuickAdd('tomorrow', NOW)).toBeNull();
  });

  it('strips polite filler without eating the title', () => {
    const hit = parseQuickAdd('Please schedule dentist tomorrow at 9am', NOW);
    expect(hit!.title).toBe('dentist');
    expect(isoLocal(hit!.start)).toBe('2026-10-15T09:00');
  });
});
