/**
 * QM-FIX — Calendar attendee email-shape validation.
 *
 * Pins the canonical email-shape helper used by the guest chip input
 * (CalendarEventForm), the `?attendee=` deep link, and the edit-sheet loader
 * (calendar/page.tsx): only email-shaped strings may become attendees.
 */
import { describe, it, expect } from 'vitest';
import { isEmailShaped, toAttendeeEmail, ATTENDEE_EMAIL_PATTERN } from '../attendee-validation';

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
