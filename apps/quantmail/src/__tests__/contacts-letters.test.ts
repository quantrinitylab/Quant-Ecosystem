import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import {
  buildLetterIndexGroups,
  indexLetterTotals,
  letterHeaderCount,
} from '../lib/contacts-letters';
import { ContactsLetterIndex } from '../components/ContactsLetterIndex';

/**
 * Regression: the contacts page rendered `{letter} ({group.contacts.length})`
 * from the paginated list page, so a header reading "A (7)" on page 2 of 5
 * counted only page 2's A-contacts while reading as a total — and letters
 * whose contacts all sat on other pages vanished from the sidebar index.
 * `GET /contacts/letters` aggregates the true per-letter totals server-side;
 * these are the client-side rules for displaying them.
 */
describe('buildLetterIndexGroups', () => {
  const pageGroups = [
    { letter: 'A', count: 7 },
    { letter: 'B', count: 2 },
  ];

  it('shows the server totals once loaded — the address book, not the page', () => {
    const serverGroups = [
      { letter: 'A', count: 42 },
      { letter: 'B', count: 11 },
      // M's contacts all sit on other pages: the old page-scoped index
      // dropped the letter entirely; the server index brings it back.
      { letter: 'M', count: 5 },
    ];
    expect(buildLetterIndexGroups(pageGroups, serverGroups)).toEqual(serverGroups);
  });

  it('falls back to the page groups while the totals load (or are disabled)', () => {
    expect(buildLetterIndexGroups(pageGroups, undefined)).toEqual(pageGroups);
  });
});

describe('letterHeaderCount', () => {
  const totals = new Map([
    ['A', 42],
    ['B', 11],
  ]);

  it('returns the true total once the server totals have loaded', () => {
    expect(letterHeaderCount('A', 7, totals, true)).toBe(42);
  });

  it('falls back to the page count when the server has no bucket for the letter', () => {
    // Defensive: a page row can only exist under a letter the server counted,
    // but a refetch racing a delete must never render "undefined".
    expect(letterHeaderCount('Z', 3, totals, true)).toBe(3);
  });

  it('returns null while the totals load — the header renders the bare letter, never a page count as a total', () => {
    expect(letterHeaderCount('A', 7, null, true)).toBeNull();
  });

  it('returns the page count when totals are disabled (contact-group view)', () => {
    expect(letterHeaderCount('A', 7, null, false)).toBe(7);
  });
});

describe('indexLetterTotals', () => {
  it('indexes server groups by letter', () => {
    const index = indexLetterTotals([
      { letter: 'A', count: 42 },
      { letter: '#', count: 3 },
    ]);
    expect(index?.get('A')).toBe(42);
    expect(index?.get('#')).toBe(3);
  });

  it('returns null before the totals load', () => {
    expect(indexLetterTotals(undefined)).toBeNull();
  });
});

describe('ContactsLetterIndex renders the server totals', () => {
  const noop = () => {};

  it('lists letters the current page has no section for, with true totals', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactsLetterIndex, {
        groups: [
          { letter: 'A', count: 42 },
          { letter: 'M', count: 5 },
        ],
        activeLetter: 'A',
        onJump: noop,
      }),
    );
    // Both chips render — M even though the page shows no M section.
    expect(html).toContain('data-letter="M"');
    // The accessible labels carry the TRUE totals, not page counts.
    expect(html).toContain('Jump to A — 42 contacts');
    expect(html).toContain('Jump to M — 5 contacts');
  });

  it('renders nothing for a single-letter book (no index furniture)', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactsLetterIndex, {
        groups: [{ letter: 'A', count: 42 }],
        activeLetter: null,
        onJump: noop,
      }),
    );
    expect(html).toBe('');
  });
});
