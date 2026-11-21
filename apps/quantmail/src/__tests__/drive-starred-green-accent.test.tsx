import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync } from 'node:fs';
import {
  DriveStarredSubView,
  type StarredItem,
} from '../app/drive/components/DriveStarredSubView';

/**
 * Drive-green accent lock (user-locked 2026-10-09): on /drive routes AppShell
 * sets `--app-accent` to Drive green (#34A853), so Drive UI chrome must use
 * `var(--app-accent)`-derived accents — never dominant amber
 * `var(--quant-warning)`.
 *
 * Regression: DriveStarredSubView once styled its header tile, "Pinned"
 * badge, card hover border, file icon tiles, and file-name hover in dominant
 * amber. After the fix, amber is restricted to the semantic star glyph itself
 * (the Unstar toggle button), matching the Files view's star toggle
 * (DriveFilesSubView.tsx) where section chrome is `--app-accent`-derived and
 * only the star glyph carries `--quant-warning`.
 */

const SAMPLE: StarredItem[] = [
  {
    id: 'f1',
    name: 'roadmap.pdf',
    type: 'file',
    mimeType: 'application/pdf',
    size: 1024,
    modifiedAt: '2026-10-20T10:00:00Z',
    isStarred: true,
  },
  {
    id: 'd1',
    name: 'Design docs',
    type: 'folder',
    mimeType: '',
    size: 0,
    modifiedAt: '2026-10-19T10:00:00Z',
    isStarred: true,
  },
];

const renderHtml = (items: StarredItem[]) =>
  renderToStaticMarkup(<DriveStarredSubView items={items} />);

describe('drive-starred green accent: header + badge use Drive-green', () => {
  it('header icon tile uses var(--app-accent), not amber', () => {
    const html = renderHtml(SAMPLE);
    expect(html).toContain(
      'bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)]',
    );
    expect(html).toContain('text-[var(--app-accent)]');
    expect(html).not.toContain('bg-[var(--quant-warning)]');
  });

  it('"Pinned" badge uses var(--app-accent), not amber', () => {
    const html = renderHtml(SAMPLE);
    expect(html).toContain(
      'bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)]',
    );
    expect(html).toContain('border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)]');
    expect(html).not.toContain('bg-[var(--quant-warning)]/15');
  });

  it('empty state keeps the Drive-green header tile', () => {
    const html = renderHtml([]);
    expect(html).toContain('No starred files yet');
    expect(html).toContain(
      'bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)]',
    );
    expect(html).not.toContain('bg-[var(--quant-warning)]');
  });
});

describe('drive-starred green accent: cards use Drive-green chrome', () => {
  it('card hover border is app-accent derived, not amber', () => {
    const html = renderHtml(SAMPLE);
    expect(html).toContain(
      'hover:border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]',
    );
    expect(html).not.toContain('hover:border-[var(--quant-warning)]');
  });

  it('file icon tiles + name hover use app-accent, not amber', () => {
    const html = renderHtml(SAMPLE);
    expect(html).toContain('group-hover:text-[var(--app-accent)]');
    expect(html).not.toContain('group-hover:text-[var(--quant-warning)]');
    expect(html).not.toContain('border-[var(--quant-warning)]');
  });
});

describe('drive-starred green accent: semantic star glyph stays amber', () => {
  it('Unstar toggle button keeps text-[var(--quant-warning)] on the glyph', () => {
    const html = renderHtml(SAMPLE);
    // One Unstar button per item, each carrying the glyph-only amber class.
    const occurrences = html.split('text-[var(--quant-warning)]').length - 1;
    expect(occurrences).toBe(SAMPLE.length);
  });

  it('source pins amber to the star glyph only (no bg-/border-/hover amber)', () => {
    const src = readFileSync(
      new URL(
        '../app/drive/components/DriveStarredSubView.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    const lines = src
      .split('\n')
      .filter((l) => l.includes('--quant-warning'))
      // Intentionally documented exception in the code comment.
      .filter(
        (l) => !l.trim().startsWith('*') && !l.trim().startsWith('{/*'),
      );
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      // Glyph-only usage: amber allowed only as plain text color on the star.
      expect(line).toContain('text-[var(--quant-warning)]');
      expect(line).not.toContain('bg-[var(--quant-warning)]');
      expect(line).not.toContain('border-[var(--quant-warning)]');
      expect(line).not.toContain('hover:border-[var(--quant-warning)]');
      expect(line).not.toContain('group-hover:text-[var(--quant-warning)]');
    }
  });
});
