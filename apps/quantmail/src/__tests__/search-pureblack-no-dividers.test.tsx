import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { UniversalSearchResults } from '../app/search/UniversalSearchResults';
import type { UniversalSearchResults as SearchResults } from '../hooks/useUniversalSearch';
import type { Email } from '../types';

// QM-FIX-LOOP — Search pure-black / no-divider-lines design lock.
// The user-locked QuantMail rule: pure-black surfaces, NO divider lines;
// separation comes from spacing/gap, never border-t/b/r or divide-x/y.
// This suite fails loudly if any Search surface file reintroduces a divider
// class, an <hr>, or an off-black ROW surface.
// Intentionally NOT flagged (same as the drive/contacts/quantgit lock suites):
//   - card outer borders (rounded-xl border border-[var(--quant-border)]) are
//     container edges, not divider lines;
//   - the search input's bg-[var(--quant-surface)] is a form-control surface,
//     not a result-row surface;
//   - quick-start pills / scope tabs keep their own pill/tab styling.

const SEARCH_DIR = path.resolve(__dirname, '../app/search');

function searchSourceFiles(): string[] {
  return fs
    .readdirSync(SEARCH_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(tsx?|jsx?)$/.test(e.name))
    .map((e) => path.join(SEARCH_DIR, e.name));
}

// Matches real Tailwind divider utilities (border-t / border-b / border-r /
// divide-x / divide-y) while ignoring substring false positives like
// `border-transparent` (contains "border-t…") or `border-black`.
const DIVIDER_CLASS_RE = /(^|["'`\s])((border-[tbr](?![a-z-])|divide-[xy](?![a-z-])))/;

// Off-black ROW surface pattern (rows must sit on pure black with
// hover:bg-white/5): the neutral var(--quant-surface) tint and the muted hover.
const ROW_SURFACE_RE = /bg-\[var\(--quant-surface\)\](\/\d+)?/;
const ROW_HOVER_RE = /hover:bg-\[var\(--quant-muted\)\]/;

function mailFixture(overrides: Partial<Record<string, unknown>> = {}): Email {
  return {
    id: 'mail-1',
    from: { email: 'ada@example.com', name: 'Ada' },
    subject: 'Invoice for October',
    snippet: 'Your invoice is ready',
    receivedAt: new Date('2026-10-18T09:00:00Z').toISOString(),
    ...overrides,
  } as unknown as Email;
}

describe('Search design lock: no divider lines, pure-black rows', () => {
  const files = searchSourceFiles();

  it('covers the Search surface (sanity: files were found)', () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it('no divider utility classes (border-t / border-b / border-r / divide-x / divide-y) in any Search source file', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const hits = src.split('\n').filter((line) => DIVIDER_CLASS_RE.test(line));
      if (hits.length > 0) offenders.push(`${path.basename(f)}: ${hits[0].trim()}`);
    }
    expect(offenders, 'divider classes violate the no-divider-lines lock').toEqual([]);
  });

  it('no <hr> elements or h-px hairline dividers in any Search source file', () => {
    const offenders = files.filter((f) => /<hr[\s>]|h-px bg-\[/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.basename(f))).toEqual([]);
  });

  it('shared rowClass is divider-free and pure black with hover:bg-white/5', () => {
    const src = fs.readFileSync(path.join(SEARCH_DIR, 'UniversalSearchResults.tsx'), 'utf8');
    const m = src.match(/const rowClass =\s*'([^']+)'/);
    expect(m, 'rowClass const must exist').not.toBeNull();
    const rowClass = m![1];
    expect(rowClass).not.toContain('border-b');
    expect(rowClass).not.toContain('last:border-b-0');
    expect(ROW_SURFACE_RE.test(rowClass)).toBe(false);
    expect(ROW_HOVER_RE.test(rowClass)).toBe(false);
    expect(rowClass).toContain('hover:bg-white/5');
  });

  it('page.tsx search result rows are divider-free', () => {
    const src = fs.readFileSync(path.join(SEARCH_DIR, 'page.tsx'), 'utf8');
    expect(src).not.toContain('border-b border-[var(--quant-border)]');
    expect(src).not.toContain('last:border-b-0');
  });

  it('rendered UniversalSearchResults rows carry no divider classes or off-black row surfaces', () => {
    const results: SearchResults = {
      query: 'invoice',
      mail: {
        items: [mailFixture({ id: 'm1' }), mailFixture({ id: 'm2', subject: 'Re: invoice' })],
        error: null,
      },
      people: { items: [], error: null },
      calendar: { items: [], error: null },
      drive: { files: [], documents: [], error: null },
    };
    const html = renderToStaticMarkup(
      <UniversalSearchResults results={results} scope="all" onOpenMail={() => {}} />,
    );
    expect(html).toContain('Invoice for October');
    expect(html).toContain('Mail');
    expect(DIVIDER_CLASS_RE.test(html), 'no divider classes in rendered rows').toBe(false);
    expect(html, 'no off-black row surface tint').not.toContain('bg-[var(--quant-surface)]/40');
    expect(html, 'no muted row hover').not.toContain('hover:bg-[var(--quant-muted)]');
    expect(html, 'no muted row chips').not.toContain('bg-[var(--quant-muted)]');
  });
});
