import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchResults, type SearchResult } from '../SearchResults';

/**
 * QM-UIUX-081 (display-surface half): search-result snippets are plain-text
 * surfaces. A snippet derived from a body that carries Markdown emphasis
 * ("**report**") must render the words WITHOUT the raw markers — the same
 * sanitizeSnippetText rule the inbox list follows. On the pre-fix code the
 * snippet was rendered verbatim and "**" leaked into the results list.
 */
const baseProps = {
  totalCount: 1,
  isLoading: false,
  activeFilter: 'all' as const,
  onFilterChange: vi.fn(),
  onResultClick: vi.fn(),
  onSearch: vi.fn(),
  onClear: vi.fn(),
};

function resultWith(snippet: string): SearchResult {
  return {
    type: 'email',
    id: 'e1',
    title: 'Quarterly numbers',
    subtitle: 'sender@example.com',
    snippet,
    date: new Date('2026-10-09T00:00:00Z'),
  };
}

describe('QM-UIUX-081 — search result snippets never leak Markdown markers', () => {
  it('strips ** markers from a result snippet while keeping the words', () => {
    const html = renderToStaticMarkup(
      <SearchResults
        query="zzz-no-match"
        results={[resultWith('Please review the **attached report** today')]}
        {...baseProps}
      />,
    );
    expect(html).toContain('attached report');
    expect(html).not.toContain('**');
  });

  it('leaves ordinary prose containing asterisks untouched', () => {
    const html = renderToStaticMarkup(
      <SearchResults
        query="zzz-no-match"
        results={[resultWith('Compute 2 * 3 = 6 before lunch')]}
        {...baseProps}
      />,
    );
    expect(html).toContain('2 * 3 = 6');
  });
});
