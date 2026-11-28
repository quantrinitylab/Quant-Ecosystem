import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * qm-quantgit-ask-quanty-accent — per-app accent regression test.
 *
 * Finding (2026-10-12, [P2] [quantgit]): the desktop sidebar's "Ask Quanty"
 * CTA rendered in Mail-orange on the QuantGit route, breaking the per-app
 * color-change theming. Root cause: the canonical `.sidebar-quanty-cta`
 * rule in globals.css hardcoded `background: var(--quant-primary)` (Mail
 * orange). AppShell sets `--app-accent` per route, and a duplicate override
 * in workplace.css (`background: var(--app-accent)`) left the CTA's color
 * depending on which stylesheet won the cross-file cascade — fragile, and
 * wrong wherever globals.css loaded without workplace.css.
 *
 * Fix: the canonical rule in globals.css now uses `var(--app-accent)`, and
 * the duplicate workplace.css override was removed so the CTA has exactly
 * one background definition. These tests pin:
 *  - the globals.css CTA rule's background is `var(--app-accent)` and
 *    contains no `var(--quant-primary)` (no Mail-orange leak);
 *  - workplace.css defines no competing `.sidebar-quanty-cta` rule;
 *  - the `:root` fallback for `--app-accent` is still Mail-orange, so
 *    routes outside the shell keep a working accent;
 *  - the chain that makes /quantgit purple: AppShell sets `--app-accent`
 *    from the route theme, the route theme maps /quantgit to the
 *    `quantgit` theme, and PILLAR_ACCENTS pins QuantGit to #8B5CF6
 *    (user-locked 2026-10-09: Mail orange, Calendar blue, Drive green,
 *    Contacts amber, QuantGit purple).
 *
 * The dark label color (#17100a) is intentionally unchanged: it contrasts
 * 8.15:1 on Mail orange and 4.45:1 on QuantGit purple, so it stays readable
 * on every app's accent without a per-app text-color branch.
 */

const GLOBALS = readFileSync(
  new URL('../app/globals.css', import.meta.url),
  'utf8',
);
const WORKPLACE = readFileSync(
  new URL('../app/workplace.css', import.meta.url),
  'utf8',
);
const APP_SHELL = readFileSync(
  new URL('../components/AppShell.tsx', import.meta.url),
  'utf8',
);
const APP_THEME = readFileSync(
  new URL('../lib/app-theme.ts', import.meta.url),
  'utf8',
);
const PILLAR_ACCENTS = readFileSync(
  new URL('../components/pillar-accents.ts', import.meta.url),
  'utf8',
);

function ctaRule(): string {
  const match = GLOBALS.match(/\.sidebar-quanty-cta \{[^}]*\}/);
  expect(match, 'globals.css must define a .sidebar-quanty-cta rule').not.toBeNull();
  return match![0];
}

describe('quantgit Ask Quanty CTA follows the per-app accent', () => {
  it('the canonical CTA rule uses var(--app-accent), not Mail-orange', () => {
    const rule = ctaRule();
    expect(rule).toContain('background: var(--app-accent)');
    expect(rule).not.toContain('var(--quant-primary)');
  });

  it('workplace.css defines no competing CTA background rule', () => {
    // A second definition in another stylesheet is what made the CTA's
    // color cascade-dependent; exactly one definition may exist.
    expect(WORKPLACE).not.toMatch(/\.sidebar-quanty-cta\s*\{/);
  });

  it('the :root --app-accent fallback stays Mail-orange outside the shell', () => {
    expect(GLOBALS).toMatch(/--app-accent:\s*var\(--quant-primary\)/);
  });

  it('AppShell drives --app-accent from the route theme on every route', () => {
    expect(APP_SHELL).toContain("'--app-accent': appTheme.accent");
  });

  it('/quantgit resolves to the quantgit theme, pinned to purple #8B5CF6', () => {
    expect(APP_THEME).toMatch(/pathname\.startsWith\('\/quantgit'\)\) return APP_THEMES\.quantgit/);
    expect(PILLAR_ACCENTS).toMatch(/quantgit:\s*'#8B5CF6'/);
  });
});
