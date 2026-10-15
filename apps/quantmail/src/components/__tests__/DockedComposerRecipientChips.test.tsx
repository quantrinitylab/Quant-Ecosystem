import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import { buildRecipientPayload } from '../DockedComposer';
import {
  parseEmailString,
  dedupeRecipientPayload,
  RecipientChipInput,
} from '../RecipientChipInput';

/**
 * QM docked-composer recipient chips — regression tests for the raw-text-input
 * defect where typing `John Doe <john@x.com>` into the To field was split on
 * whitespace into three invalid recipients (`John`, `Doe`, `<john@x.com>`) and
 * shipped to compose/updateDraft, and where clicking an autocomplete
 * suggestion REPLACED the entire To field, destroying other recipients.
 *
 * The docked composer now keeps `to`/`cc`/`bcc` as RecipientOption[] and
 * renders EmailComposer's RecipientChipInput, whose parseEmailString splits on
 * `[,;\n\t]` (never whitespace) and whose autocomplete appends a chip.
 * buildRecipientPayload (exported from DockedComposer) is the single
 * derivation both handleSend and the draft autosave use for the API payload.
 */

describe('parseEmailString (docked composer recipient parsing)', () => {
  it('parses `John Doe <john@x.com>` as ONE recipient, not three', () => {
    const parsed = parseEmailString('John Doe <john@x.com>');
    expect(parsed).toEqual([{ name: 'John Doe', email: 'john@x.com' }]);
  });

  it('does not split a display name on whitespace', () => {
    const parsed = parseEmailString('John Michael Doe <john@x.com>');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({ name: 'John Michael Doe', email: 'john@x.com' });
  });

  it('still splits multiple addresses on commas/semicolons/newlines', () => {
    const parsed = parseEmailString('John Doe <john@x.com>, jane@y.com; bob@z.com\namy@w.com');
    expect(parsed).toHaveLength(4);
    expect(parsed.map((p) => p.email)).toEqual([
      'john@x.com',
      'jane@y.com',
      'bob@z.com',
      'amy@w.com',
    ]);
  });

  it('keeps a bare address as-is', () => {
    expect(parseEmailString('john@x.com')).toEqual([{ email: 'john@x.com' }]);
  });

  it('returns [] for blank input', () => {
    expect(parseEmailString('   ')).toEqual([]);
  });
});

describe('buildRecipientPayload', () => {
  it('ships `John Doe <john@x.com>` as one address, never three bogus ones', () => {
    const { to } = buildRecipientPayload(parseEmailString('John Doe <john@x.com>'), [], []);
    expect(to).toEqual([{ email: 'john@x.com' }]);
  });

  it('omits empty cc/bcc (API contract: undefined, not empty arrays)', () => {
    const payload = buildRecipientPayload(parseEmailString('john@x.com'), [], []);
    expect(payload.cc).toBeUndefined();
    expect(payload.bcc).toBeUndefined();
  });

  it('builds cc/bcc lists when present', () => {
    const payload = buildRecipientPayload(
      parseEmailString('john@x.com'),
      parseEmailString('Jane Roe <jane@y.com>'),
      parseEmailString('bob@z.com'),
    );
    expect(payload.cc).toEqual([{ email: 'jane@y.com' }]);
    expect(payload.bcc).toEqual([{ email: 'bob@z.com' }]);
  });

  it('dedupes a named chip and a bare chip for the same address to one entry', () => {
    const payload = buildRecipientPayload(
      [
        { name: 'John Doe', email: 'john@x.com' },
        { email: 'John@X.com' },
      ],
      [],
      [],
    );
    expect(payload.to).toEqual([{ email: 'john@x.com' }]);
  });

  it('appends an autocomplete selection after existing recipients instead of replacing them', () => {
    // Mirrors RecipientChipInput's addRecipient: onChange([...recipients, new]).
    const existing = parseEmailString('john@x.com');
    const afterSelect = dedupeRecipientPayload([...existing, { email: 'jane@y.com' }]);
    expect(buildRecipientPayload(afterSelect, [], []).to).toEqual([
      { email: 'john@x.com' },
      { email: 'jane@y.com' },
    ]);
  });
});

describe('RecipientChipInput render (docked composer To field)', () => {
  it('renders one chip for `John Doe <john@x.com>`, not three', () => {
    const html = renderToStaticMarkup(
      <RecipientChipInput
        id="docked-composer-to"
        name="to"
        label="To"
        recipients={parseEmailString('John Doe <john@x.com>')}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('John Doe');
    // A named chip shows the name as its label (the address rides along in
    // the recipient object). One chip = one remove button; the old
    // whitespace-split behavior would have produced three chips.
    expect((html.match(/<button/g) || []).length).toBe(1);
  });

  it('renders the composer input with a stable id for the label', () => {
    const html = renderToStaticMarkup(
      <RecipientChipInput
        id="docked-composer-to"
        name="to"
        label="To"
        recipients={[]}
        onChange={() => {}}
        placeholder="Recipients (e.g. sundar@google.com)"
      />,
    );
    expect(html).toContain('id="docked-composer-to"');
    expect(html).toContain('Recipients (e.g. sundar@google.com)');
  });
});

describe('parseEmailString (whitespace-separated addresses)', () => {
  it('splits `a@x.com b@y.com` into two valid recipients, not one malformed chip', () => {
    const parsed = parseEmailString('a@x.com b@y.com');
    expect(parsed).toEqual([{ email: 'a@x.com' }, { email: 'b@y.com' }]);
  });

  it('never whitespace-splits a token without @ (`foo bar` stays one flagged fragment)', () => {
    const parsed = parseEmailString('foo bar');
    expect(parsed).toEqual([{ email: 'foo bar' }]);
  });

  it('still keeps `John Doe <john@x.com>` as one named recipient', () => {
    expect(parseEmailString('John Doe <john@x.com>')).toEqual([
      { name: 'John Doe', email: 'john@x.com' },
    ]);
  });
});

describe('buildRecipientPayload (compose validation: malformed excluded)', () => {
  it('excludes malformed chips from the wire payload, keeps the valid ones', () => {
    const payload = buildRecipientPayload(
      [{ email: 'a@x.com' }, { email: 'foobar' }, { email: 'b@y.com' }],
      [{ email: 'notanemail' }],
      [],
    );
    expect(payload.to).toEqual([{ email: 'a@x.com' }, { email: 'b@y.com' }]);
    // cc had only a malformed chip: nothing valid to ship. The composer
    // autosave skips the save on an empty `to`; an empty-but-present cc/bcc
    // must not appear as `[]` (API contract: undefined, not empty arrays).
    expect(payload.cc).toEqual([]);
    expect(payload.bcc).toBeUndefined();
  });

  it('yields an empty `to` when every chip is malformed (autosave skips the doomed 400)', () => {
    const payload = buildRecipientPayload([{ email: 'foobar' }], [], []);
    expect(payload.to).toEqual([]);
  });

  it('dedupes AFTER filtering, so a malformed dup never leaks through', () => {
    const payload = buildRecipientPayload(
      [{ email: 'A@X.com' }, { email: 'a@x.com' }, { email: 'bad' }],
      [],
      [],
    );
    // dedupe keeps the FIRST occurrence as-is (keyed on lowercase)
    expect(payload.to).toEqual([{ email: 'A@X.com' }]);
  });
});
