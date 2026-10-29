// ============================================================================
// Privacy page — pure-black / no-divider-lines design lock
// (fix/qm-privacy-dividers)
//
// Finding (queue 2026-10-12, P2 darkui-audit): /privacy carried divider lines
// across the surface — sidebar border-bottom dividers, header border-b, and
// data-matrix table row borders — violating the user-locked pure-black /
// no-divider-lines rule. Same defect class as the drive/contacts/search
// divider items.
//
// What changed since the audit, and what this fix still had to do:
//   - The sidebar + app-header items are already gone: /privacy is a
//     standalone public page since aa56d1f36 (no AppShell/AppSidebar), and
//     the data-matrix table markup carries no border classes (Tailwind
//     preflight zeroes table borders; globals.css has no table border rule).
//   - What REMAINED on the rendered /privacy surface were three divider
//     lines in the shared auth chrome (AuthShell/AuthBrandPanel, also used
//     by /terms, /login, /register):
//       1. `.auth-shell-brand { border-right: ... }` — vertical divider
//          between the brand column and the form (desktop).
//       2. `.auth-brand-desktop > footer { border-top: ... }` — divider
//          above the brand footer (desktop).
//       3. `.auth-brand-panel::after` — a 1px gradient rule across the
//          bottom of the brand panel, visible under the mobile brand strip
//          too (the panel is 5rem tall on mobile).
//     All three are removed; separation is spacing + panel backgrounds only.
//   - Deliberately KEPT (not divider lines): the rounded feature-card and
//     icon-chip outlines, and the decorative orbit rings — those are card /
//     decoration outlines, not lines separating sections. The v1 proof-card
//     rules (.auth-preview-row border-bottom, .auth-proof-topline
//     border-bottom) are dead CSS — no component references those classes
//     since the v2 feature cards replaced the proof card — so they render
//     no divider anywhere and are out of scope here.
//
// These tests pin the fix (source + CSS scans — apps/quantmail has no
// @testing-library/react; the privacy page is a client island):
//   1. The brand-column rule has no border-right divider.
//   2. The brand-footer rule has no border-top divider (padding kept).
//   3. The brand-panel ::after divider rule is gone entirely.
//   4. privacy/page.tsx markup has no border/divide classes and no <hr>.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Walk up from cwd to find a repo-relative source file. */
function findSource(relApp: string): string {
  const rels = [`src/${relApp}`, `apps/quantmail/src/${relApp}`];
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
  throw new Error(`could not locate ${relApp} from ${process.cwd()}`);
}

const readSource = (relApp: string): string => readFileSync(findSource(relApp), 'utf8');

/** Strip /* ... *\/ CSS comments so notes may name a removed rule. */
const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Strip {/* ... *\/} JSX comments so notes may name a removed class. */
const stripJsxComments = (tsx: string): string => tsx.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** Extract the declaration block of a CSS rule starting at its selector. */
function cssRuleBlock(css: string, selector: string): string {
  const idx = css.indexOf(selector);
  expect(idx, `${selector} rule must exist in globals.css`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  expect(open).toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(open);
  return css.slice(open + 1, close);
}

// Matches a border shorthand / side declaration inside a CSS block,
// e.g. "border-right: 1px solid ..." — not font names or class substrings.
const BORDER_DECL_RE = /(^|[;{\s])border(-(top|right|bottom|left))?\s*:/;

describe('privacy page: no divider lines, spacing-only separation', () => {
  it('the brand column has no border-right divider', () => {
    const css = stripCssComments(readSource('app/globals.css'));
    const block = cssRuleBlock(css, '.auth-shell-brand {');
    expect(BORDER_DECL_RE.test(block), 'border divider must be gone from .auth-shell-brand').toBe(false);
    // Pin the exact defect declaration.
    expect(css).not.toContain('border-right: 1px solid rgba(255,255,255,.075)');
  });

  it('the brand footer has no border-top divider (padding-top kept)', () => {
    const css = stripCssComments(readSource('app/globals.css'));
    const block = cssRuleBlock(css, '.auth-brand-desktop > footer {');
    expect(BORDER_DECL_RE.test(block), 'border divider must be gone from the brand footer').toBe(false);
    expect(css).not.toContain('border-top: 1px solid rgba(255,255,255,.07)');
    // Spacing-only separation: the footer keeps its top padding.
    expect(block).toMatch(/padding-top\s*:\s*\S+/);
  });

  it('the brand-panel ::after divider rule is gone entirely', () => {
    const css = stripCssComments(readSource('app/globals.css'));
    expect(css).not.toContain('.auth-brand-panel::after');
  });

  it('privacy markup has no border/divide classes and no <hr>', () => {
    const page = stripJsxComments(readSource('app/privacy/page.tsx'));
    const classAttrs = [...page.matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
    expect(classAttrs.length).toBeGreaterThan(0);
    for (const classes of classAttrs) {
      for (const token of classes.split(/\s+/)) {
        expect(token.startsWith('border'), `no border class in privacy markup, got ${token}`).toBe(false);
        expect(token.startsWith('divide-'), `no divide class in privacy markup, got ${token}`).toBe(false);
      }
    }
    expect(page).not.toContain('<hr');
    // The data-matrix table itself: no border classes on table/thead/tbody/tr.
    expect(page).toMatch(/<table className="w-full text-left text-xs">/);
  });
});
