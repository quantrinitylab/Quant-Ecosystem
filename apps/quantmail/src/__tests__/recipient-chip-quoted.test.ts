import { describe, it, expect } from 'vitest';

import { parseEmailString } from '../components/RecipientChipInput';

/**
 * Compose slice Phase 1.5 (prep) — quoted display names in recipient chips.
 *
 * Regression for the split-first parser: pasting `"Doe, John" <john@x.com>`
 * used to split on the comma INSIDE the quotes and produce two malformed
 * chips (`"Doe` and `John" <john@x.com>`) instead of one named chip.
 * The separator split is now top-level only (outside quotes and angle
 * brackets). The pre-existing behaviours below are re-pinned here so this
 * fix cannot silently change them.
 */
describe('parseEmailString with quoted display names', () => {
  it('parses `"Doe, John" <john@x.com>` as ONE named recipient', () => {
    expect(parseEmailString('"Doe, John" <john@x.com>')).toEqual([
      { name: 'Doe, John', email: 'john@x.com' },
    ]);
  });

  it('still splits the list after a quoted name', () => {
    const parsed = parseEmailString('"Doe, John" <john@x.com>, jane@y.com');
    expect(parsed).toEqual([
      { name: 'Doe, John', email: 'john@x.com' },
      { email: 'jane@y.com' },
    ]);
  });

  it('does not split on a semicolon inside quotes', () => {
    expect(parseEmailString('"Doe; John" <john@x.com>')).toEqual([
      { name: 'Doe; John', email: 'john@x.com' },
    ]);
  });

  it('unquotes a bare quoted address', () => {
    expect(parseEmailString('"john@x.com"')).toEqual([{ email: 'john@x.com' }]);
  });
});

describe('parseEmailString pre-existing behaviour (re-pinned)', () => {
  it('parses an unquoted display name as one recipient', () => {
    expect(parseEmailString('John Doe <john@x.com>')).toEqual([
      { name: 'John Doe', email: 'john@x.com' },
    ]);
  });

  it('still splits multiple addresses on commas/semicolons/newlines', () => {
    const parsed = parseEmailString(
      'John Doe <john@x.com>, jane@y.com; bob@z.com\namy@w.com',
    );
    expect(parsed.map((p) => p.email)).toEqual([
      'john@x.com',
      'jane@y.com',
      'bob@z.com',
      'amy@w.com',
    ]);
  });

  it('keeps a bare address as-is and blank input as []', () => {
    expect(parseEmailString('john@x.com')).toEqual([{ email: 'john@x.com' }]);
    expect(parseEmailString('   ')).toEqual([]);
  });
});
