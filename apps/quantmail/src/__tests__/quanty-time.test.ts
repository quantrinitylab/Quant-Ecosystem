/**
 * quantyTime guard tests — pure, no component imports (the module has no
 * dependencies of its own).
 *
 * Same defect family as PeopleList.formatRelativeTime and
 * PersonThread.formatMessageTime: `new Date(garbage)` never throws, so the
 * try/catch fallbacks were dead code and garbage timestamps rendered the
 * literal "Invalid Date" in the Quanty Live Agent approvals / browser /
 * schedule / identity tabs. The NaN guard degrades to '' — the sibling
 * convention — never "Invalid Date".
 */
import { describe, expect, it } from 'vitest';
import {
  dayBucket,
  formatClockTime,
  formatRelativeTime,
} from '../components/QuantyLiveAgent/quantyTime';

const NOW = new Date('2026-10-06T18:00:00+05:30');
const GARBAGE = ['garbage', '', 'not-a-date', '2026-13-45T99:99:99'];

describe('formatClockTime', () => {
  it('formats valid input like 5:48pm', () => {
    expect(formatClockTime('2026-10-06T17:48:00+05:30')).toMatch(
      /\d{1,2}:\d{2}(am|pm)/,
    );
  });

  it('returns "" for unparseable input — never the literal "Invalid Date"', () => {
    for (const input of GARBAGE) {
      expect(formatClockTime(input)).toBe('');
    }
  });
});

describe('formatRelativeTime', () => {
  it('formats valid input ("30m ago", "7h ago", "just now", "soon", date)', () => {
    expect(formatRelativeTime('2026-10-06T17:30:00+05:30', NOW)).toBe('30m ago');
    expect(formatRelativeTime('2026-10-06T11:00:00+05:30', NOW)).toBe('7h ago');
    expect(formatRelativeTime('2026-10-06T17:59:30+05:30', NOW)).toBe('just now');
    expect(formatRelativeTime('2026-10-06T19:00:00+05:30', NOW)).toBe('soon');
    expect(formatRelativeTime('2026-10-01T12:00:00+05:30', NOW)).toBe('5d ago');
    // Old-enough branch that hits toLocaleDateString — must stay a date, not "Invalid Date".
    expect(formatRelativeTime('2026-01-01T12:00:00+05:30', NOW)).toMatch(
      /\w+ \d+/,
    );
  });

  it('returns "" for unparseable input — never the literal "Invalid Date"', () => {
    for (const input of GARBAGE) {
      expect(formatRelativeTime(input, NOW)).toBe('');
    }
  });
});

describe('dayBucket', () => {
  it('buckets valid input into today/yesterday/older', () => {
    expect(dayBucket('2026-10-06T09:00:00+05:30', NOW)).toBe('today');
    expect(dayBucket('2026-10-05T09:00:00+05:30', NOW)).toBe('yesterday');
    expect(dayBucket('2026-09-01T09:00:00+05:30', NOW)).toBe('older');
  });
});
