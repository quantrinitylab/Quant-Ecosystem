// ============================================================================
// QM-FIX-LOOP — SearchSuggestions dropdown (as-you-type).
//
// The presentational dropdown under the /search field: renders the
// queries/senders/labels sections from props with renderToStaticMarkup (the
// apps/quantmail convention — no @testing-library/react), marks the
// arrow-key-active option, and obeys the Search design lock (pure-black
// panel, rows on pure black with hover:bg-white/5, NO divider lines).
// ============================================================================

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SearchSuggestions } from '../app/search/SearchSuggestions';
import type { SuggestionSections } from '../lib/searchSuggestions';

// Same divider-class detector as the search design-lock suite: matches real
// Tailwind divider utilities while ignoring substring false positives like
// `border-transparent`.
const DIVIDER_CLASS_RE = /(^|["'`\s])((border-[tbr](?![a-z-])|divide-[xy](?![a-z-])))/;

const SECTIONS: SuggestionSections = {
  queries: [
    { kind: 'query', label: 'invoice for October' },
    { kind: 'query', label: 'invoice' },
  ],
  senders: [{ kind: 'sender', label: 'invoices@acme.com' }],
  labels: [{ kind: 'label', label: 'Receipts' }],
};

function render(sections: SuggestionSections = SECTIONS, activeIndex = -1): string {
  return renderToStaticMarkup(
    <SearchSuggestions
      id="test-listbox"
      sections={sections}
      activeIndex={activeIndex}
      onSelect={() => {}}
    />,
  );
}

describe('SearchSuggestions dropdown', () => {
  it('renders the three sections with headings in Gmail order', () => {
    const html = render();
    const suggestionsAt = html.indexOf('Suggestions');
    const sendersAt = html.indexOf('Senders');
    const labelsAt = html.indexOf('Labels');
    expect(suggestionsAt).toBeGreaterThanOrEqual(0);
    expect(sendersAt).toBeGreaterThan(suggestionsAt);
    expect(labelsAt).toBeGreaterThan(sendersAt);
    expect(html).toContain('invoice for October');
    expect(html).toContain('invoices@acme.com');
    expect(html).toContain('Receipts');
  });

  it('exposes listbox semantics: role=listbox with role=option rows', () => {
    const html = render();
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-label="Search suggestions"');
    const options = html.match(/role="option"/g) ?? [];
    expect(options).toHaveLength(4);
  });

  it('marks the arrow-key-active option with aria-selected and a visible highlight', () => {
    const html = render(SECTIONS, 2);
    const selected = html.match(/aria-selected="true"/g) ?? [];
    expect(selected).toHaveLength(1);
    expect(html).toContain('bg-white/10');
    // The active row is the flattened index 2: the sender.
    const activeRow = html.split('role="option"')[3];
    expect(activeRow).toContain('invoices@acme.com');
  });

  it('with no active index, no option claims selection', () => {
    const html = render(SECTIONS, -1);
    expect(html).not.toContain('aria-selected="true"');
  });

  it('empty sections render nothing — no headings, no rows, no filler', () => {
    const html = render({ queries: [], senders: [], labels: [] });
    expect(html).not.toContain('role="option"');
    expect(html).not.toContain('Suggestions');
    expect(html).not.toContain('Senders');
    expect(html).not.toContain('Labels');
  });

  it('partially empty sections are skipped while the rest render', () => {
    const html = render({ queries: [], senders: SECTIONS.senders, labels: [] });
    expect(html).not.toContain('Suggestions');
    expect(html).toContain('Senders');
    expect(html).not.toContain('Labels');
  });

  it('design lock: no divider classes, no <hr>, no hairlines in the component source or rendered markup', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/search/SearchSuggestions.tsx'),
      'utf8',
    );
    const srcHits = src.split('\n').filter((line) => DIVIDER_CLASS_RE.test(line));
    expect(srcHits, 'divider classes violate the no-divider-lines lock').toEqual([]);
    expect(src).not.toContain('<hr');

    const html = render();
    expect(DIVIDER_CLASS_RE.test(html), 'no divider classes in rendered dropdown').toBe(false);
    expect(html).not.toContain('<hr');
  });

  it('design lock: rows sit on pure black with hover:bg-white/5, no off-black row surfaces', () => {
    const html = render();
    expect(html).toContain('hover:bg-white/5');
    expect(html).not.toContain('bg-[var(--quant-surface)]');
    expect(html).not.toContain('bg-[var(--quant-muted)]');
    expect(html).not.toContain('hover:bg-[var(--quant-muted)]');
  });
});
