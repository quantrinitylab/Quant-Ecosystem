import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DriveMobileTabStrip } from '../app/drive/components/DriveMobileTabStrip';
import { DriveContextTabsHeader } from '../app/drive/components/DriveContextTabsHeader';

/**
 * qm-drive-blue-accent — per-app accent regression tests.
 *
 * Drive is the GREEN app (user-locked 2026-10-09 / pillar-accents.ts:
 * Mail orange, Calendar blue, Drive green #34A853, Contacts amber,
 * QuantGit purple). On /drive routes AppShell sets `--app-accent` to the
 * Drive green, so Drive UI must only use `var(--app-accent)`-derived accents —
 * never the hardcoded sky-blue `#38BDF8` (or its `#0284C7` / rgba(56,189,248,…)
 * companions) that once covered all 8 Drive subviews + both tab strips.
 *
 * These tests pin:
 *  - zero hardcoded sky-blue tokens anywhere under app/drive (components +
 *    page.tsx; the doc/[docId] editor was already token-clean);
 *  - the desktop + mobile tab strips render active states with the shared
 *    `var(--app-accent)` token, never the old blue;
 *  - the Drive page's shared-mode tabs / Details button use the token.
 *
 * Decorative file-type colors are intentionally NOT asserted here (that is
 * a separate concern; there are no such palettes in these files today).
 */

const DRIVE_DIR = new URL('../app/drive', import.meta.url);
const COMPONENTS_DIR = join(DRIVE_DIR.pathname, 'components');

const TSX_FILES: { name: string; src: string }[] = [];
for (const f of readdirSync(COMPONENTS_DIR)) {
  if (f.endsWith('.tsx')) {
    TSX_FILES.push({
      name: f,
      src: readFileSync(join(COMPONENTS_DIR, f), 'utf8'),
    });
  }
}
const PAGE = readFileSync(new URL('../app/drive/page.tsx', import.meta.url), 'utf8');

/** Sky-blue tokens that must never appear in Drive UI again. */
const FORBIDDEN_TOKENS = ['#38BDF8', '#38bdf8', '#0284C7', 'rgba(56,189,248'];

describe('qm-drive-blue-accent: no hardcoded blue in any drive surface', () => {
  for (const { name, src } of TSX_FILES) {
    describe(`components/${name}`, () => {
      for (const token of FORBIDDEN_TOKENS) {
        it(`does not contain "${token}"`, () => {
          expect(src).not.toContain(token);
        });
      }
    });
  }

  describe('drive/page.tsx', () => {
    for (const token of FORBIDDEN_TOKENS) {
      it(`does not contain "${token}"`, () => {
        expect(PAGE).not.toContain(token);
      });
    }
  });
});

describe('qm-drive-blue-accent: DriveMobileTabStrip uses the green accent token', () => {
  const src = TSX_FILES.find((f) => f.name === 'DriveMobileTabStrip.tsx')!.src;

  it('source references var(--app-accent) for the active tab', () => {
    expect(src).toContain('text-[var(--app-accent)]');
    expect(src).toContain('focus-visible:ring-[var(--app-accent)]');
  });

  it('renders the active tab pill with the accent token, not blue', () => {
    const html = renderToStaticMarkup(
      <DriveMobileTabStrip activeTab="home" onTabChange={() => {}} />,
    );
    expect(html).toContain('text-[var(--app-accent)]');
    expect(html).not.toContain('#38BDF8');
    expect(html).not.toContain('38bdf8');
  });
});

describe('qm-drive-blue-accent: DriveContextTabsHeader uses the green accent token', () => {
  const src = TSX_FILES.find((f) => f.name === 'DriveContextTabsHeader.tsx')!.src;

  it('source uses var(--app-accent) for the active tab + focus ring', () => {
    expect(src).toContain('text-[var(--app-accent)]');
    expect(src).toContain('focus-visible:ring-[var(--app-accent)]');
    expect(src).toContain(
      'border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]',
    );
  });

  it('renders the active tab with the accent token, not blue', () => {
    const html = renderToStaticMarkup(
      <DriveContextTabsHeader activeTab="home" onTabChange={() => {}} />,
    );
    expect(html).toContain('text-[var(--app-accent)]');
    expect(html).not.toContain('#38BDF8');
  });
});

describe('qm-drive-blue-accent: drive page shared-mode tabs use the token', () => {
  it('shared-mode tabs + preview Details button reference var(--app-accent)', () => {
    const matches = PAGE.match(/text-\[var\(--app-accent\)\]/g);
    expect(matches?.length).toBeGreaterThan(0);
  });
});
