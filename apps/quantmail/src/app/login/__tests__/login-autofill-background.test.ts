// @vitest-environment jsdom
// ============================================================================
// Login email input background — autofill must stay near-black
// (fix/qm-login-email-input-bg)
//
// Finding (queue 2026-10-12, P2 darkui-audit): /login email input rendered
// mid-gray rgb(59,59,59) (#3b3b3b) — visibly lighter than the near-black
// password field wrapper on the same form, violating the pure-black lock.
//
// Root cause, established from current origin/main source (no live browser
// is available to this agent, so the mechanism is pinned statically):
//   1. The declared styles are ALREADY unified — both the email input and
//      the password wrapper declare bg-[var(--quant-surface)]/90, and the
//      dark theme sets --quant-surface: #000000 over the #0b0b0c auth form.
//      No #3b3b3b literal exists anywhere in the auth surface code, so a
//      declared-style fix would be a no-op.
//   2. The one remaining mechanism that paints a mid-gray over an author
//      background is the browser's UA autofill paint: #login-id carries
//      autoComplete="username", so on returning visits Chrome/Safari
//      autofill it and repaint its background gray, while the password
//      wrapper (a <div>, not an <input>) keeps the declared near-black.
//      The app had zero autofill overrides anywhere.
// The fix is a .auth-shell-scoped :-webkit-autofill / :autofill rule that
// repaints autofilled auth inputs near-black (#000, the same --quant-surface
// the class declares) with white text fill, covering login, register,
// forgot-password and recovery forms that share the shell.
//
// These tests pin the fix (source + CSS scans — apps/quantmail has no
// @testing-library/react):
//   1. The .auth-shell autofill rule exists, covers hover/focus, and
//      includes the standard :autofill variant alongside -webkit-autofill.
//   2. Its inset shadow is near-black #000 and its text fill is white.
//   3. It is scoped to .auth-shell inputs (no global input autofill rule
//      leaking into in-app surfaces).
//   4. The email input still declares bg-[var(--quant-surface)] and no
//      #3b3b3b literal survives in the login form, so the autofill and
//      non-autofill states cannot drift apart again.
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

/** Selector list + declaration block of the .auth-shell autofill rule. */
function autofillRule(css: string): { selectors: string; block: string } {
  const idx = css.indexOf('.auth-shell input:-webkit-autofill');
  expect(idx, '.auth-shell autofill rule must exist in globals.css').toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  expect(open).toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(open);
  return { selectors: css.slice(idx, open), block: css.slice(open + 1, close) };
}

describe('login email input autofill background', () => {
  it('the .auth-shell autofill rule covers base, hover and focus states in both vendor and standard forms', () => {
    const { selectors } = autofillRule(readSource('app/globals.css'));
    for (const selector of [
      '.auth-shell input:-webkit-autofill',
      '.auth-shell input:-webkit-autofill:hover',
      '.auth-shell input:-webkit-autofill:focus',
      '.auth-shell input:autofill',
      '.auth-shell input:autofill:hover',
      '.auth-shell input:autofill:focus',
    ]) {
      expect(selectors, `autofill rule must include ${selector}`).toContain(selector);
    }
  });

  it('the autofill repaint is near-black with white text, matching the declared field surface', () => {
    const { block } = autofillRule(readSource('app/globals.css'));
    expect(block).toContain('0 0 0 1000px #000 inset');
    expect(block).toContain('-webkit-box-shadow');
    expect(block).toContain('box-shadow');
    expect(block).toContain('-webkit-text-fill-color: #fff');
    expect(block).not.toContain('#3b3b3b');
  });

  it('the autofill rule is scoped to .auth-shell, not a global input rule', () => {
    const css = readSource('app/globals.css');
    // No bare (unscoped) autofill selector anywhere in the sheet.
    const unscoped = /(^|[\n;}])\s*input:-webkit-autofill/m.exec(css);
    expect(unscoped, 'no global input:-webkit-autofill rule may leak into in-app surfaces').toBeNull();
  });

  it('the login email input still declares the near-black surface token and carries no gray literal', () => {
    const form = readSource('app/login/login-form.tsx');
    const emailIdx = form.indexOf('id="login-id"');
    expect(emailIdx).toBeGreaterThanOrEqual(0);
    const inputWindow = form.slice(emailIdx, emailIdx + 1200);
    expect(inputWindow).toContain('bg-[var(--quant-surface)]');
    expect(form).not.toContain('#3b3b3b');
    expect(form).not.toContain('rgb(59, 59, 59)');
    // The token the class points at is pure black in the dark theme, so the
    // #000 autofill repaint matches the declared (non-autofill) rendering.
    const css = readSource('app/globals.css');
    expect(css).toContain('--quant-surface: #000000');
  });
});
