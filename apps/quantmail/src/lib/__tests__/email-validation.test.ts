/**
 * lib/email-validation — the compose path's single source of truth for
 * "does this string look like a deliverable email address".
 *
 * - `isValidEmail`: local@domain.tld shape (matches ContactGroupModal's regex).
 * - `getInvalidRecipientReason`: names the FIRST malformed recipient.
 * - `filterValidRecipients`: excludes malformed addresses from wire payloads —
 *   the backend's compose/updateDraft schemas are `z.string().email()`, so a
 *   malformed address in a payload is a guaranteed 400. Committed chips are
 *   still flagged inline (RecipientChipInput) with the send hard-blocked, so
 *   nothing the user typed is silently lost — it just never reaches the API.
 */
import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  getInvalidRecipientReason,
  filterValidRecipients,
} from '../email-validation';

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isValidEmail('kundan@quantmail.in')).toBe(true);
    expect(isValidEmail('John.Doe+tag@sub.example.co')).toBe(true);
  });

  it('ignores surrounding whitespace', () => {
    expect(isValidEmail('  kundan@quantmail.in  ')).toBe(true);
  });

  it('rejects non-address text', () => {
    expect(isValidEmail('foobar')).toBe(false);
    expect(isValidEmail('foo bar')).toBe(false);
    expect(isValidEmail('@')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false); // no TLD
    expect(isValidEmail('@x.com')).toBe(false);
    expect(isValidEmail('a@ x.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('getInvalidRecipientReason', () => {
  it('returns null when every address is valid', () => {
    expect(
      getInvalidRecipientReason([{ email: 'a@x.com' }, { email: 'b@y.com' }]),
    ).toBeNull();
  });

  it('skips empty entries (the empty-To block owns that case)', () => {
    expect(getInvalidRecipientReason([{ email: '' }, { email: 'a@x.com' }])).toBeNull();
  });

  it('names the FIRST malformed address', () => {
    expect(getInvalidRecipientReason([{ email: 'foobar' }, { email: 'a@x.com' }])).toBe(
      '"foobar" is not a valid email address',
    );
  });
});

describe('filterValidRecipients', () => {
  it('excludes malformed addresses from the wire payload', () => {
    expect(
      filterValidRecipients([
        { email: 'a@x.com' },
        { email: 'foobar' },
        { email: 'b@y.com' },
        { email: 'foo bar' },
      ]),
    ).toEqual([{ email: 'a@x.com' }, { email: 'b@y.com' }]);
  });

  it('drops empty entries too', () => {
    expect(filterValidRecipients([{ email: '' }, { email: 'a@x.com' }])).toEqual([
      { email: 'a@x.com' },
    ]);
  });

  it('keeps extra fields on the survivors (name rides along)', () => {
    expect(
      filterValidRecipients([
        { email: 'a@x.com', name: 'Asha' },
        { email: 'notanemail', name: 'Bogus' },
      ]),
    ).toEqual([{ email: 'a@x.com', name: 'Asha' }]);
  });

  it('returns [] when nothing is valid (autosave skips the doomed 400)', () => {
    expect(filterValidRecipients([{ email: 'foobar' }])).toEqual([]);
  });

  it('returns [] for an empty list', () => {
    expect(filterValidRecipients([])).toEqual([]);
  });
});
