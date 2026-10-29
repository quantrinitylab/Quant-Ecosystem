// ============================================================================
// Privacy page accent lock: Mail surfaces use orange ONLY (user-locked
// 2026-10-09 per-app accents; Mail = orange). Finding (queue 2026-10-12 P2
// [darkui-audit]): /privacy rendered 7 emerald elements (rgb 52,211,153 —
// "Zero (0) Ads", "No External Sharing", "Never Shared" badges/cells) from
// the old `text-emerald-400` at-a-glance tiles and data-matrix cells.
//
// The 2026-10-13 copy-honesty rewrite already moved those cells to
// `text-[var(--brand-primary)]` (orange #FF8C42); the last green hook on the
// /privacy render path was the `auth-brand-glow-green` div in AuthBrandPanel,
// which AuthShell renders into BOTH the mobile and desktop brand slots.
// These tests pin the fixed state across both files that compose /privacy,
// so no emerald/green token can silently return to the page.
//
// Same source-assertion pattern as privacy-copy.test.ts: JSX comments are
// stripped, so audit notes may name a removed class without tripping the
// assertions.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function findSource(rels: string[], label: string): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    for (const rel of rels) {
      const candidate = join(dir, rel);
      if (existsSync(candidate)) return candidate;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`privacy-accents: could not locate ${label} from ${process.cwd()}`);
}

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '');
}

const privacyPage = stripComments(
  readFileSync(
    findSource(
      ['src/app/privacy/page.tsx', 'apps/quantmail/src/app/privacy/page.tsx'],
      'src/app/privacy/page.tsx',
    ),
    'utf8',
  ),
);

const authBrandPanel = stripComments(
  readFileSync(
    findSource(
      [
        'src/components/auth/AuthBrandPanel.tsx',
        'apps/quantmail/src/components/auth/AuthBrandPanel.tsx',
      ],
      'src/components/auth/AuthBrandPanel.tsx',
    ),
    'utf8',
  ),
);

// Any Tailwind green/emerald utility, any green hex that has ever painted a
// Mail surface, and any green-named hook class (a hook needs no CSS rule
// today to become a green paint server tomorrow).
const GREEN_TOKEN =
  /(text|bg|border|from|via|to|ring|divide|outline|shadow|accent|caret|decoration)-(emerald|green)-\d|emerald|#(?:34D399|10B981|22C55E|16A34A|15803D|43C95B|138808)|glow-green|brand-glow-green/i;

describe('Privacy page accent lock (Mail orange only)', () => {
  it('has no emerald/green token in the privacy page source', () => {
    expect(privacyPage).not.toMatch(GREEN_TOKEN);
  });

  it('has no emerald/green token in the auth brand panel rendered on /privacy', () => {
    expect(authBrandPanel).not.toMatch(GREEN_TOKEN);
  });

  it('paints the at-a-glance values and "Never Shared" cells orange, not green', () => {
    // The exact elements the audit flagged: the "Zero (0) Ads" tile value and
    // the data-matrix "Never Shared" cells. Each must sit in a
    // brand-primary (orange) element.
    expect(privacyPage).toMatch(
      /text-\[var\(--brand-primary\)\][\s\S]{0,80}Zero \(0\) Ads/,
    );
    const neverSharedCells = privacyPage.match(/Never Shared/g) ?? [];
    expect(neverSharedCells.length).toBeGreaterThanOrEqual(3);
    const orangeNeverShared = privacyPage.match(
      /font-semibold text-\[var\(--brand-primary\)\][\s\S]{0,80}Never Shared/g,
    ) ?? [];
    expect(orangeNeverShared.length).toBe(neverSharedCells.length);
  });
});
