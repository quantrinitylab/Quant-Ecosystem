import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// framer-motion resolves its own React copy under SSR and crashes
// renderToStaticMarkup with a dual-React `useContext` null — the repo's
// standard motion mock (see HoverActions.test.tsx).
vi.mock('framer-motion', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const MOTION_PROPS = new Set(['initial', 'animate', 'exit', 'transition']);
  const mockMotion = new Proxy(
    {},
    {
      get:
        (_t, tag: string) =>
        ({ children, ...props }: { children?: React.ReactNode }) => {
          const domProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) {
            if (!MOTION_PROPS.has(k)) domProps[k] = v;
          }
          return React.createElement(tag, domProps, children);
        },
    },
  );
  return {
    motion: mockMotion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

import { chipParts, dedupeChips, ContactAutocomplete } from '../ContactAutocomplete';
import { dedupeRecipientPayload } from '../RecipientChipInput';
import type { ContactSuggestion } from '../../types';

/**
 * QM-SCREEN-012 R2 — `Name <email>` chip dedupe.
 *
 * The composer renders named recipients as `Name <email>` chips. Without
 * normalization, the autocomplete's `chips.includes(c.email)` compare never
 * matched a bracketed chip, so selecting a suggestion for an already-added
 * named recipient appended a second chip and the send payload carried the
 * address twice. Named and bare forms of one address are the same recipient.
 */

describe('chipParts', () => {
  it('splits a named chip into name and bare address', () => {
    expect(chipParts('John Doe <john@x.com>')).toEqual({ name: 'John Doe', email: 'john@x.com' });
  });

  it('returns a bare address untouched', () => {
    expect(chipParts('john@x.com')).toEqual({ email: 'john@x.com' });
  });

  it('tolerates whitespace inside the brackets', () => {
    expect(chipParts('  John Doe  <  john@x.com  >  ')).toEqual({
      name: 'John Doe',
      email: 'john@x.com',
    });
  });

  it('a name without an address is not treated as named', () => {
    expect(chipParts('John Doe')).toEqual({ email: 'John Doe' });
  });
});

describe('dedupeChips — named and bare forms of one address never coexist', () => {
  it('a bare suggestion for an already-added named chip is dropped', () => {
    expect(dedupeChips(['John Doe <john@x.com>'], ['john@x.com'])).toEqual([]);
  });

  it('a named candidate for an already-added bare chip is dropped', () => {
    expect(dedupeChips(['john@x.com'], ['John Doe <john@x.com>'])).toEqual([]);
  });

  it('dedupe is case-insensitive on the address', () => {
    expect(dedupeChips(['John Doe <John@X.com>'], ['john@x.com'])).toEqual([]);
    expect(dedupeChips(['JOHN@X.COM'], ['John Doe <john@x.com>'])).toEqual([]);
  });

  it('distinct addresses pass through, in order', () => {
    expect(dedupeChips(['John Doe <john@x.com>'], ['jane@x.com', 'john@x.com'])).toEqual([
      'jane@x.com',
    ]);
  });

  it('typed `Name <email>` normalizes to the bare address, not a minted one', () => {
    // The separator split used to fragment `John Doe <john@x.com>` and mint
    // a bogus `John Doe@quantmail.in` chip next to the real one.
    expect(dedupeChips([], ['John Doe <john@x.com>'])).toEqual(['john@x.com']);
  });

  it('dedupes within the candidate list itself', () => {
    expect(dedupeChips([], ['a@x.com', 'A <a@x.com>'])).toEqual(['a@x.com']);
  });
});

describe('dedupeRecipientPayload — the send payload carries each address once', () => {
  it('collapses a named + bare pair to the first occurrence', () => {
    const list = [
      { email: 'john@x.com', name: 'John Doe' },
      { email: 'JOHN@X.COM' },
      { email: 'jane@x.com' },
    ];
    expect(dedupeRecipientPayload(list)).toEqual([
      { email: 'john@x.com', name: 'John Doe' },
      { email: 'jane@x.com' },
    ]);
  });

  it('drops empty addresses and preserves order', () => {
    expect(
      dedupeRecipientPayload([{ email: 'b@x.com' }, { email: '  ' }, { email: 'a@x.com' }]),
    ).toEqual([{ email: 'b@x.com' }, { email: 'a@x.com' }]);
  });
});

describe('ContactAutocomplete chip name-resolution handles bracketed chips', () => {
  const noop = () => {};

  it('a named chip with a matching contact renders name + bare address', () => {
    const contacts: ContactSuggestion[] = [{ email: 'john@x.com', name: 'John Doe' }];
    const html = renderToStaticMarkup(
      <ContactAutocomplete value="John Doe <john@x.com>" onChange={noop} contacts={contacts} />,
    );
    expect(html).toContain('John Doe (john@x.com)');
  });

  it('a named chip without a matching contact uses the embedded name, not raw brackets', () => {
    const html = renderToStaticMarkup(
      <ContactAutocomplete value="Jane Smith <jane@x.com>" onChange={noop} contacts={[]} />,
    );
    expect(html).toContain('Jane Smith (jane@x.com)');
    // Static markup HTML-escapes `<`, so the raw-bracket regression reads as
    // `&lt;` — assert against the escaped form or the check is vacuous.
    expect(html).not.toContain('Jane Smith &lt;jane@x.com&gt;');
  });
});
