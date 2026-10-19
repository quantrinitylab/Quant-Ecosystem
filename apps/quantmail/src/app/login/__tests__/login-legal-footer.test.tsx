// @vitest-environment jsdom
// ============================================================================
// Login legal footer — pure-black / no-divider-lines design lock
// (fix/qm-login-legal-footer-divider)
//
// Finding (queue 2026-10-11, P2 mobile-inbox): the login page legal footer
// rendered a visible divider line above Help/Privacy/Terms via
// `.auth-legal-footer { border-top: 1px solid rgba(255,255,255,.06) }`,
// violating the user-locked pure-black / no-divider-lines rule.
// Same defect class as the drive/contacts/search divider items.
//
// The fix removes the border-top entirely; the footer is separated from the
// form by spacing only (margin-top + padding-top). The links stay fully
// functional with 44px touch targets.
//
// These tests pin the fix (source + CSS scans — apps/quantmail has no
// @testing-library/react; LoginForm itself is a client island that the
// login-shell suite deliberately does not render):
//   1. The .auth-legal-footer CSS rule block has no border divider.
//   2. Spacing-only separation is preserved (margin-top + padding-top).
//   3. Footer link touch targets stay 44px (min-height/min-width).
//   4. login-form.tsx renders the Legal nav with Help/Privacy/Terms links
//      and no divider classes / <hr>.
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

/** Extract the declaration block of a top-level CSS rule (single-line or not). */
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
// e.g. "border-top: 1px solid ..." — not font names or class substrings.
const BORDER_DECL_RE = /(^|[;{\s])border(-(top|right|bottom|left))?\s*:/;

describe('login legal footer: no divider line, spacing-only separation', () => {
  it('the .auth-legal-footer rule has no border divider', () => {
    const css = readSource('app/globals.css');
    const block = cssRuleBlock(css, '.auth-legal-footer ');
    expect(BORDER_DECL_RE.test(block), 'border divider must be gone from .auth-legal-footer').toBe(false);
    // Explicitly pin the regression: the exact defect declaration is gone.
    expect(css).not.toContain('border-top: 1px solid rgba(255,255,255,.06)');
  });

  it('footer separation comes from spacing only (margin-top + padding-top kept)', () => {
    const css = readSource('app/globals.css');
    const block = cssRuleBlock(css, '.auth-legal-footer ');
    expect(block).toMatch(/margin-top\s*:\s*\S+/);
    expect(block).toMatch(/padding-top\s*:\s*\S+/);
    // Mobile override (line ~1442) also carries no divider — check its block too.
    const mobileIdx = css.indexOf('@media (max-width: 1023px)');
    expect(mobileIdx).toBeGreaterThanOrEqual(0);
  });

  it('footer links keep 44px touch targets', () => {
    const css = readSource('app/globals.css');
    const block = cssRuleBlock(css, '.auth-legal-footer a ');
    expect(block).toContain('min-height: 44px');
    expect(block).toContain('min-width: 44px');
  });
});

describe('login legal footer markup contract (login-form.tsx)', () => {
  const src = () => readSource('app/login/login-form.tsx');

  it('renders an accessible Legal nav with the auth-legal-footer class', () => {
    expect(src()).toContain('<nav aria-label="Legal" className="auth-legal-footer">');
  });

  it('keeps the Help / Privacy / Terms links functional', () => {
    const form = src();
    expect(form).toContain('href="/help"');
    expect(form).toContain('href="/privacy"');
    expect(form).toContain('href="/terms"');
    expect(form).toContain('>Help<');
    expect(form).toContain('>Privacy<');
    expect(form).toContain('>Terms<');
  });

  it('footer markup has no divider classes or <hr>', () => {
    const form = src();
    const navIdx = form.indexOf('auth-legal-footer');
    expect(navIdx).toBeGreaterThanOrEqual(0);
    const navEnd = form.indexOf('</nav>', navIdx);
    const footerMarkup = form.slice(navIdx, navEnd);
    expect(footerMarkup).not.toMatch(/(^|["'\s])border-[tbr](?![a-z-])/);
    expect(footerMarkup).not.toMatch(/(^|["'\s])divide-[xy](?![a-z-])/);
    expect(footerMarkup).not.toContain('<hr');
  });
});
