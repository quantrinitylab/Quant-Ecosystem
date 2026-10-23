// ============================================================================
// QM-FIX-LOOP — /search as-you-type suggestion builders.
//
// Gmail drops a suggestion list while typing (queries, senders, labels); the
// page computes the same three sections from local-first sources via
// lib/searchSuggestions. These tests pin the matching, dedupe, ordering, and
// cap rules — all framework-free, no DOM.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  MAX_SUGGESTIONS_PER_SECTION,
  buildSuggestionSections,
  countSuggestions,
  flattenSuggestions,
  labelSuggestions,
  querySuggestions,
  senderSuggestionsFromHits,
} from '../lib/searchSuggestions';

const EXAMPLES = ['invoice', 'design feedback', 'meeting follow-up'];

describe('querySuggestions', () => {
  it('returns [] for empty/blank text — no suggestions without input', () => {
    expect(querySuggestions(['invoice'], EXAMPLES, '')).toEqual([]);
    expect(querySuggestions(['invoice'], EXAMPLES, '   ')).toEqual([]);
  });

  it('matches recent searches by substring, case-insensitively', () => {
    const out = querySuggestions(['Invoice for October', 'lunch plans'], EXAMPLES, 'VOIC');
    // 'invoice' (quick start) matches too — recents order first.
    expect(out).toEqual([
      { kind: 'query', label: 'Invoice for October' },
      { kind: 'query', label: 'invoice' },
    ]);
  });

  it('falls back to quick-start examples when no recent matches', () => {
    const out = querySuggestions([], EXAMPLES, 'design');
    expect(out).toEqual([{ kind: 'query', label: 'design feedback' }]);
  });

  it('orders recents before examples', () => {
    const out = querySuggestions(['meeting notes'], EXAMPLES, 'meeting');
    expect(out.map((s) => s.label)).toEqual(['meeting notes', 'meeting follow-up']);
  });

  it('dedupes case-insensitively across recents and examples', () => {
    const out = querySuggestions(['Invoice'], ['invoice', 'INVOICE scanned'], 'invoice');
    expect(out.map((s) => s.label)).toEqual(['Invoice', 'INVOICE scanned']);
  });

  it('caps the section at MAX_SUGGESTIONS_PER_SECTION', () => {
    const recents = Array.from({ length: 10 }, (_, i) => `invoice ${i}`);
    const out = querySuggestions(recents, [], 'invoice');
    expect(out).toHaveLength(MAX_SUGGESTIONS_PER_SECTION);
  });

  it('skips blank candidates', () => {
    const out = querySuggestions(['', '   ', 'invoice'], EXAMPLES, 'invoice');
    expect(out.map((s) => s.label)).toContain('invoice');
    expect(out.every((s) => s.label.trim().length > 0)).toBe(true);
  });
});

describe('senderSuggestionsFromHits', () => {
  const hits = [
    { fromAddress: 'kundan@quantmail.in' },
    { fromAddress: 'ada@example.com' },
    { fromAddress: 'kundan@quantmail.in' }, // duplicate across hits
    { fromAddress: '' },
  ];

  it('returns [] for empty text', () => {
    expect(senderSuggestionsFromHits(hits, '')).toEqual([]);
  });

  it('extracts unique sender addresses matching the typed text', () => {
    const out = senderSuggestionsFromHits(hits, 'kundan');
    expect(out).toEqual([{ kind: 'sender', label: 'kundan@quantmail.in' }]);
  });

  it('re-checks the substring match — an index hit on subject/body alone is not a sender suggestion', () => {
    // The FTS5 hit matched "invoice" in the subject, but the sender address
    // does not contain it, so it must not appear as a sender suggestion.
    const out = senderSuggestionsFromHits([{ fromAddress: 'billing@acme.com' }], 'invoice');
    expect(out).toEqual([]);
  });

  it('matches case-insensitively', () => {
    const out = senderSuggestionsFromHits([{ fromAddress: 'Ada@Example.COM' }], 'ada@ex');
    expect(out).toEqual([{ kind: 'sender', label: 'Ada@Example.COM' }]);
  });
});

describe('labelSuggestions', () => {
  const labels = [{ name: 'Receipts' }, { name: 'Travel' }, { name: 'receipts-archived' }];

  it('returns [] for empty text', () => {
    expect(labelSuggestions(labels, '')).toEqual([]);
  });

  it('matches real label names by substring, case-insensitively', () => {
    const out = labelSuggestions(labels, 'receip');
    expect(out.map((s) => s.label)).toEqual(['Receipts', 'receipts-archived']);
    expect(out.every((s) => s.kind === 'label')).toBe(true);
  });

  it('tolerates nullish names', () => {
    const out = labelSuggestions([{ name: null }, { name: 'Travel' }], 'travel');
    expect(out).toEqual([{ kind: 'label', label: 'Travel' }]);
  });
});

describe('buildSuggestionSections / flatten / count', () => {
  const args = {
    text: 'inv',
    recentSearches: ['invoice for October'],
    exampleSearches: EXAMPLES,
    ftsHits: [{ fromAddress: 'invoices@acme.com' }, { fromAddress: 'friend@example.com' }],
    labels: [{ name: 'Invoices' }],
  };

  it('builds the three sections in Gmail order: queries, senders, labels', () => {
    const sections = buildSuggestionSections(args);
    expect(sections.queries.map((s) => s.label)).toEqual(['invoice for October', 'invoice']);
    expect(sections.senders).toEqual([{ kind: 'sender', label: 'invoices@acme.com' }]);
    expect(sections.labels).toEqual([{ kind: 'label', label: 'Invoices' }]);
  });

  it('empty sections stay empty — nothing is invented', () => {
    const sections = buildSuggestionSections({
      text: 'zzz-no-match',
      recentSearches: [],
      exampleSearches: [],
      ftsHits: [],
      labels: [],
    });
    expect(sections).toEqual({ queries: [], senders: [], labels: [] });
    expect(countSuggestions(sections)).toBe(0);
    expect(flattenSuggestions(sections)).toEqual([]);
  });

  it('flattenSuggestions follows display order — the arrow-key navigation order', () => {
    const sections = buildSuggestionSections(args);
    const flat = flattenSuggestions(sections);
    expect(flat.map((s) => `${s.kind}:${s.label}`)).toEqual([
      'query:invoice for October',
      'query:invoice',
      'sender:invoices@acme.com',
      'label:Invoices',
    ]);
    expect(countSuggestions(sections)).toBe(flat.length);
  });
});
