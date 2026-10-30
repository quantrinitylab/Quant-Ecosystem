// @vitest-environment node
/**
 * Mail Search slice (rebuild plan Phase 1.3) — pure-helper pinning.
 *
 * The helpers under test are what the search page actually calls for its
 * count line, its no-result state, its Top Results section, and its
 * suggestion list. The page itself is not mounted here (the repo's
 * established precedent for large pages: pin the helpers, and leave a
 * mounted-component test to review only if review finds a gap).
 *
 * The invariants pinned here are the slice's honesty rules:
 * - a search count is labelled a SEARCH result, never an inbox/folder total;
 * - a no-result state names the query, scope, and filters, never the pool;
 * - Top Results takes first matches per source in source order — there is
 *   no ranking signal, so no "best match" claim is ever made;
 * - a query run once is recent, not frequent.
 */
import { describe, it, expect } from 'vitest';
import {
  SEARCH_COUNT_BANNER,
  describeSearchCountLabel,
  describeSearchEmpty,
  selectTopResultSlots,
  deriveSearchSuggestions,
} from '../lib/search-results-label';

describe('search count label', () => {
  it('labels the count as search results, with the scope named', () => {
    expect(
      describeSearchCountLabel({ query: 'invoice', scope: 'mail', total: 3 }),
    ).toBe('3 search results for “invoice” across mail.');
    expect(
      describeSearchCountLabel({ query: 'invoice', scope: 'all', total: 1 }),
    ).toBe('1 search result for “invoice” across mail, people, calendar, and drive.');
  });

  it('marks a partial answer as partial, never as a full total', () => {
    const label = describeSearchCountLabel({
      query: 'invoice',
      scope: 'all',
      total: 4,
      partial: true,
    });
    expect(label).toContain('partial');
    expect(label).not.toContain('total');
  });

  it('the banner states the search-vs-pool distinction out loud', () => {
    expect(SEARCH_COUNT_BANNER).toContain('search results only');
    expect(SEARCH_COUNT_BANNER).toContain('not your inbox or folder totals');
  });
});

describe('search empty state', () => {
  it('names the query, the scope, and the applied filters', () => {
    const text = describeSearchEmpty({
      query: 'invoice',
      scope: 'mail',
      filterLabels: ['From: a@b.com'],
    });
    expect(text).toContain('“invoice”');
    expect(text).toContain('in mail');
    expect(text).toContain('From: a@b.com');
    expect(text).toContain('remove filters');
  });

  it('without filters it does not invent a filter to remove', () => {
    const text = describeSearchEmpty({ query: 'zzz-no-match', scope: 'all' });
    // Wave-9 slice A4: canonical empty copy for scope 'all' is now the "or drive"
    // form pinned by universal-search-results.test.tsx; this test's real intent
    // (no invented filter, broader-phrase advice) is unchanged.
    expect(text).toContain('across mail, people, calendar, or drive');
    expect(text).not.toContain('remove filters');
    expect(text).toContain('broader phrase');
  });
});

describe('Top Results slots', () => {
  it('takes first matches per source in source order, capped per source and in total', () => {
    expect(
      selectTopResultSlots({
        mail: 10,
        people: 5,
        calendar: 5,
        driveDocuments: 5,
        driveFiles: 5,
      }),
    ).toEqual({ mail: 3, people: 1, calendar: 1, driveDocuments: 1, driveFiles: 0 });
  });

  it('skips empty sources without spending the total cap on them', () => {
    expect(
      selectTopResultSlots({
        mail: 0,
        people: 2,
        calendar: 0,
        driveDocuments: 1,
        driveFiles: 1,
      }),
    ).toEqual({ mail: 0, people: 1, calendar: 0, driveDocuments: 1, driveFiles: 1 });
  });

  it('never takes more than exist, and never goes negative', () => {
    expect(
      selectTopResultSlots({
        mail: 1,
        people: 0,
        calendar: 0,
        driveDocuments: 0,
        driveFiles: 0,
      }),
    ).toEqual({ mail: 1, people: 0, calendar: 0, driveDocuments: 0, driveFiles: 0 });
  });
});

describe('search suggestions', () => {
  it('promotes a query run twice to frequent, ahead of recent-only rows', () => {
    const out = deriveSearchSuggestions({
      recent: ['invoice', 'design feedback'],
      frequency: { 'design feedback': 4, invoice: 1 },
    });
    expect(out).toEqual([
      { query: 'design feedback', kind: 'frequent' },
      { query: 'invoice', kind: 'recent' },
    ]);
  });

  it('a query run once is recent, not frequent', () => {
    const out = deriveSearchSuggestions({
      recent: ['invoice'],
      frequency: { invoice: 1 },
    });
    expect(out).toEqual([{ query: 'invoice', kind: 'recent' }]);
  });

  it('frequent rows sort by count, then by recency on ties, and dedupe', () => {
    const out = deriveSearchSuggestions({
      recent: ['a', 'b', 'c'],
      frequency: { c: 3, b: 3, a: 9 },
    });
    expect(out.map((s) => s.query)).toEqual(['a', 'b', 'c']);
    expect(out[0].kind).toBe('frequent');
  });

  it('caps the list and ignores blank queries', () => {
    const out = deriveSearchSuggestions({
      recent: ['  ', 'one', 'two', 'three', 'four', 'five', 'six'],
      frequency: {},
      limit: 5,
    });
    expect(out).toHaveLength(5);
    expect(out.map((s) => s.query)).toEqual(['one', 'two', 'three', 'four', 'five']);
  });
});
