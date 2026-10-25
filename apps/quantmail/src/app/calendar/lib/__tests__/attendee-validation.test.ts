/**
 * QM-FIX — Calendar attendee email-shape validation.
 *
 * Pins the canonical email-shape helper used by the guest chip input
 * (CalendarEventForm), the `?attendee=` deep link, and the edit-sheet loader
 * (calendar/page.tsx): only email-shaped strings may become attendees.
 */
import { describe, it, expect } from 'vitest';
import {
  isEmailShaped,
  toAttendeeEmail,
  ATTENDEE_EMAIL_PATTERN,
  attendeeDedupKey,
  dedupeAttendeeEmails,
  addAttendeeEmail,
} from '../attendee-validation';

describe('isEmailShaped', () => {
  it('accepts ordinary addresses', () => {
    expect(isEmailShaped('ada@example.com')).toBe(true);
    expect(isEmailShaped('Ada.Lovelace+cal@quantmail.in')).toBe(true);
    expect(isEmailShaped('  spaced@example.com  ')).toBe(true);
  });

  it('rejects the non-addresses the chip input used to accept', () => {
    expect(isEmailShaped('hello')).toBe(false);
    expect(isEmailShaped('')).toBe(false);
    expect(isEmailShaped('   ')).toBe(false);
    expect(isEmailShaped('no-at-sign.com')).toBe(false);
    expect(isEmailShaped('@nodomain')).toBe(false);
    expect(isEmailShaped('name@')).toBe(false);
    expect(isEmailShaped('a b@example.com')).toBe(false);
    expect(isEmailShaped('user@localhost')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isEmailShaped(null)).toBe(false);
    expect(isEmailShaped(undefined)).toBe(false);
    expect(isEmailShaped(42)).toBe(false);
    expect(isEmailShaped({ email: 'a@b.com' })).toBe(false);
  });

  it('the pattern is a stable export the backend mirrors', () => {
    expect(ATTENDEE_EMAIL_PATTERN.source).toBe('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');
  });
});

describe('case-insensitive guest dedup (fix/qm-calendar-guest-dedup-casefold)', () => {
  it('folds the whole address, ignoring surrounding whitespace', () => {
    expect(attendeeDedupKey('  A@X.com ')).toBe('a@x.com');
    expect(attendeeDedupKey('a@x.com')).toBe(attendeeDedupKey('A@X.COM'));
  });

  it('addAttendeeEmail refuses a case-variant of an existing guest', () => {
    expect(addAttendeeEmail(['a@x.com'], 'A@x.com')).toEqual(['a@x.com']);
    expect(addAttendeeEmail(['A@x.com'], 'a@x.com')).toEqual(['A@x.com']);
    expect(addAttendeeEmail(['a@x.com'], 'A@X.COM')).toEqual(['a@x.com']);
  });

  it('addAttendeeEmail keeps distinct guests and trims the new address', () => {
    expect(addAttendeeEmail(['a@x.com'], '  b@x.com ')).toEqual(['a@x.com', 'b@x.com']);
    expect(addAttendeeEmail([], 'Ada@Example.com')).toEqual(['Ada@Example.com']);
  });

  it('addAttendeeEmail refuses non-email input instead of storing it', () => {
    expect(addAttendeeEmail(['a@x.com'], 'hello')).toEqual(['a@x.com']);
    expect(addAttendeeEmail([], 'hello')).toEqual([]);
  });

  it('dedupeAttendeeEmails keeps the first-seen casing, like the backend', () => {
    expect(dedupeAttendeeEmails(['a@x.com', 'A@x.com', 'b@x.com', 'B@X.COM'])).toEqual([
      'a@x.com',
      'b@x.com',
    ]);
    expect(dedupeAttendeeEmails(['A@x.com', 'a@x.com'])).toEqual(['A@x.com']);
  });

  it('dedupeAttendeeEmails unwraps { email } objects and drops garbage rows', () => {
    expect(
      dedupeAttendeeEmails([{ email: 'a@x.com' }, 'A@x.com', 'hello', null, { email: 'b@x.com' }]),
    ).toEqual(['a@x.com', 'b@x.com']);
  });
});

describe('toAttendeeEmail', () => {
  it('unwraps bare strings and { email } objects', () => {
    expect(toAttendeeEmail('ada@example.com')).toBe('ada@example.com');
    expect(toAttendeeEmail({ email: 'ada@example.com' })).toBe('ada@example.com');
    expect(toAttendeeEmail('  ada@example.com  ')).toBe('ada@example.com');
  });

  it('returns null for legacy garbage rows so they never surface as chips', () => {
    expect(toAttendeeEmail('hello')).toBeNull();
    expect(toAttendeeEmail({ email: 'hello' })).toBeNull();
    expect(toAttendeeEmail({ name: 'no email here' })).toBeNull();
    expect(toAttendeeEmail('')).toBeNull();
    expect(toAttendeeEmail(null)).toBeNull();
  });
});
