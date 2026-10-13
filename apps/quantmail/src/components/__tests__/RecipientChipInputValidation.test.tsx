/**
 * RecipientChipInput inline invalid-address flags (compose validation).
 *
 * A committed chip whose address is malformed must render flagged —
 * `aria-invalid`, a rose border/label and the reason in its title —
 * Gmail-style, instead of looking like a normal recipient. Well-formed
 * chips must render exactly as before (no flag).
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecipientChipInput } from '../RecipientChipInput';

function renderChips(recipients: Array<{ email: string; name?: string }>): string {
  return renderToStaticMarkup(
    <RecipientChipInput
      id="to"
      name="to"
      label="To"
      recipients={recipients}
      onChange={() => {}}
    />,
  );
}

describe('RecipientChipInput invalid-chip flag', () => {
  it('flags a malformed chip: aria-invalid, rose border, named reason', () => {
    const html = renderChips([{ email: 'notanemail' }]);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('border-rose-500');
    expect(html).toContain('text-rose-300');
    expect(html).toContain('is not a valid email address');
  });

  it('flags "foo bar" and "@" chips too', () => {
    const html = renderChips([{ email: 'foo bar' }, { email: '@' }]);
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(2);
  });

  it('leaves a well-formed chip unflagged', () => {
    const html = renderChips([{ email: 'kundan@quantmail.in' }]);
    expect(html).not.toContain('aria-invalid');
    expect(html).not.toContain('border-rose-500');
    expect(html).not.toContain('text-rose-300');
  });

  it('flags only the malformed chip in a mixed list', () => {
    const html = renderChips([{ email: 'a@x.com' }, { email: 'notanemail' }]);
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(1);
  });
});
