import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSearchSuggestions } from '../lib/searchSuggestions';
import { SearchTypeaheadDropdown } from '../components/SearchTypeahead';
import type { ContactSuggestion } from '../types';

const CONTACTS: ContactSuggestion[] = [
  { email: 'alice@example.com', name: 'Alice A', frequency: 10 },
  { email: 'bob@example.com', name: 'Bob B', frequency: 3 },
  { email: 'carol@acme.com', name: 'Carol C', company: 'Acme', frequency: 7 },
];

const RECENT = ['invoice from alice', 'budget review', 'flight to paris'];

describe('buildSearchSuggestions', () => {
  it('returns recent searches for an empty query', () => {
    const out = buildSearchSuggestions('', { recent: RECENT, contacts: CONTACTS });
    expect(out.map((s) => s.query)).toEqual(RECENT);
    expect(out.every((s) => s.kind === 'recent')).toBe(true);
  });

  it('completes a bare operator prefix to from:/to: (min 2 chars)', () => {
    expect(buildSearchSuggestions('fr', {}).map((s) => s.query)).toEqual(['from:']);
    expect(buildSearchSuggestions('to', {}).map((s) => s.query)).toEqual(['to:']);
    // Single characters are word starts, not operators: 'f' must complete
    // the matching contact, never the from: operator.
    expect(
      buildSearchSuggestions('f', {
        contacts: [{ email: 'fiona@example.com', name: 'Fiona', frequency: 1 }],
      }).map((s) => s.query),
    ).toEqual(['fiona@example.com']);
  });

  it('never suggests operators the shell filters do not honor', () => {
    // has:/subject:/in: are /search-page operators, not shell-view filters.
    expect(buildSearchSuggestions('ha', {})).toEqual([]);
    expect(buildSearchSuggestions('su', {})).toEqual([]);
    expect(buildSearchSuggestions('in', {})).toEqual([]);
  });

  it('completes from: with matching contacts as from:email queries', () => {
    const out = buildSearchSuggestions('from:al', { contacts: CONTACTS });
    expect(out.map((s) => s.query)).toEqual(['from:alice@example.com']);
    expect(out[0].kind).toBe('contact');
  });

  it('lists top frequent contacts for a bare from: operator', () => {
    const out = buildSearchSuggestions('from:', { contacts: CONTACTS });
    expect(out.map((s) => s.query)).toEqual([
      'from:alice@example.com',
      'from:carol@acme.com',
      'from:bob@example.com',
    ]);
  });

  it('matches a plain token against contact name, email and company', () => {
    const out = buildSearchSuggestions('acme', { contacts: CONTACTS });
    expect(out.map((s) => s.query)).toEqual(['carol@acme.com']);
  });

  it('applies a contact match as a plain email token, preserving head tokens', () => {
    const out = buildSearchSuggestions('budget ali', { contacts: CONTACTS });
    expect(out.map((s) => s.query)).toEqual(['budget alice@example.com']);
  });

  it('appends matching recent searches after contacts, excluding the exact query', () => {
    const out = buildSearchSuggestions('budget', { recent: RECENT, contacts: CONTACTS });
    expect(out.map((s) => s.query)).toEqual(['budget review']);
    expect(buildSearchSuggestions('budget review', { recent: RECENT })).toEqual([]);
  });

  it('caps the list and never returns duplicates of the same applied query', () => {
    const many: ContactSuggestion[] = Array.from({ length: 12 }, (_, i) => ({
      email: `user${i}@example.com`,
      name: `User ${i}`,
      frequency: i,
    }));
    const out = buildSearchSuggestions('user', { recent: RECENT, contacts: many });
    expect(out.length).toBeLessThanOrEqual(8);
    expect(new Set(out.map((s) => s.query)).size).toBe(out.length);
  });
});

describe('SearchTypeaheadDropdown', () => {
  it('renders suggestion rows with listbox semantics and nothing when closed', () => {
    const suggestions = buildSearchSuggestions('from:al', { contacts: CONTACTS });
    const html = renderToStaticMarkup(
      <SearchTypeaheadDropdown
        open
        suggestions={suggestions}
        activeIndex={0}
        listboxId="typeahead-test"
        onSelect={() => {}}
      />,
    );
    expect(html).toContain('role="listbox"');
    expect(html).toContain('Alice A');
    expect(html).toContain('alice@example.com');
    expect(html).toContain('aria-selected="true"');

    const closed = renderToStaticMarkup(
      <SearchTypeaheadDropdown
        open={false}
        suggestions={suggestions}
        activeIndex={-1}
        listboxId="typeahead-test"
        onSelect={() => {}}
      />,
    );
    expect(closed).toBe('');
  });
});
