// @vitest-environment jsdom
// ============================================================================
// AuthPageTransition — zero-JS replacement for framer-motion PageTransition
// on the public auth pages.
//
// Finding (queue 2026-10-12, P0 perf-load): /login shipped 114KB raw (36KB
// gzip) of framer-motion for a single fade-in, because the login page wrapped
// itself in `PageTransition` from `@quant/shared-ui` (motion.div opacity 0→1
// + y 20→0). The fix replaces it on the auth pages (login, register,
// forgot-password, reset-password) with a pure CSS @keyframes animation —
// zero JS, exact same visual (opacity 0→1, translateY(20px→0), 300ms,
// cubic-bezier(0.0, 0.0, 0.2, 1.0) = @quant/brand duration.moderate + easeOut).
//
// These tests pin the fix:
//   1. AuthPageTransition renders children with the `auth-page-transition`
//      class by default (the CSS class that carries the animation).
//   2. `animated={false}` renders a plain div (mirrors PageTransition's
//      `animated` flag / reduced-motion branch).
//   3. A custom className is merged, not clobbered.
//   4. Source scan: none of the auth page sources may import `framer-motion`
//      or the shared-ui `PageTransition` — a regression would silently
//      re-add the 114KB chunk to the public auth shell.
//   5. CSS parity: globals.css must define `@keyframes auth-page-enter`
//      with the exact from/to values and the exact duration/easing, plus a
//      prefers-reduced-motion guard (mirrors useReducedMotion).
// ============================================================================

import { describe, expect, it, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import { AuthPageTransition } from '../AuthPageTransition';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderTransition(props?: { animated?: boolean; className?: string }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AuthPageTransition {...props}>
        <span data-testid="child">hello</span>
      </AuthPageTransition>,
    );
  });
  return container!.firstElementChild as HTMLElement;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

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

describe('AuthPageTransition', () => {
  it('renders children with the auth-page-transition animation class', () => {
    const el = renderTransition();
    expect(el.tagName).toBe('DIV');
    expect(el.classList.contains('auth-page-transition')).toBe(true);
    expect(el.querySelector('[data-testid="child"]')?.textContent).toBe('hello');
  });

  it('animated={false} renders a plain div with no animation class', () => {
    const el = renderTransition({ animated: false });
    expect(el.classList.contains('auth-page-transition')).toBe(false);
    expect(el.querySelector('[data-testid="child"]')?.textContent).toBe('hello');
  });

  it('merges a custom className instead of clobbering it', () => {
    const el = renderTransition({ className: 'my-wrapper' });
    expect(el.classList.contains('auth-page-transition')).toBe(true);
    expect(el.classList.contains('my-wrapper')).toBe(true);
  });

  it('imports nothing at runtime (zero-JS: no framer-motion, no react hooks)', () => {
    const raw = readFileSync(findSource('components/auth/AuthPageTransition.tsx'), 'utf8');
    // Strip comments: the header documents what this replaces (and names
    // framer-motion in prose); the assertion is about executable code.
    const source = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');
    expect(source).not.toMatch(/framer-motion/);
    // No *runtime* import from 'react' — `import type` is erased at compile
    // time and contributes zero JS to the bundle.
    expect(source).not.toMatch(/import\s+(?!type\b)[^;]*from\s+'react'/);
    expect(source).not.toMatch(/use[A-Z]\w*\(/);
  });
});

describe('auth pages carry no framer-motion', () => {
  const authPages = [
    'app/(auth)/login/page.tsx',
    'app/(auth)/register/page.tsx',
    'app/(auth)/forgot-password/page.tsx',
    'app/(auth)/reset-password/page.tsx',
  ];

  for (const page of authPages) {
    it(`${page} does not import framer-motion or shared-ui PageTransition`, () => {
      const source = readFileSync(findSource(page), 'utf8');
      expect(source).not.toMatch(/framer-motion/);
      // The bare identifier PageTransition must not appear at all; the local
      // replacement is named AuthPageTransition.
      expect(source).not.toMatch(/(?<![A-Za-z])PageTransition/);
      expect(source).toMatch(/AuthPageTransition/);
    });
  }
});

describe('auth-page-enter CSS parity with PageTransition', () => {
  const css = readFileSync(findSource('app/(auth)/auth.css'), 'utf8');

  it('defines @keyframes auth-page-enter with opacity 0→1 and translateY(20px→0)', () => {
    const block = css.match(/@keyframes auth-page-enter\s*\{[^}]*\{[^}]*\}[^}]*\}/s);
    expect(block).not.toBeNull();
    const text = block![0].replace(/\s+/g, ' ');
    // from: opacity 0 + translateY(20px) — mirrors initial={{ opacity: 0, y: 20 }}
    expect(text).toMatch(/from\s*\{\s*opacity:\s*0;\s*transform:\s*translateY\(20px\);?\s*\}/);
    // to: opacity 1 + translateY(0) — mirrors animate={{ opacity: 1, y: 0 }}
    expect(text).toMatch(/to\s*\{\s*opacity:\s*1;\s*transform:\s*translateY\(0\);?\s*\}/);
  });

  it('applies 300ms cubic-bezier(0.0, 0.0, 0.2, 1.0) — duration.moderate + easeOut', () => {
    const rule = css.match(/\.auth-page-transition\s*\{[^}]*\}/);
    expect(rule).not.toBeNull();
    const text = rule![0].replace(/\s+/g, ' ');
    // duration.moderate = 300ms; ease = [0.0, 0.0, 0.2, 1.0]
    expect(text).toMatch(/animation:\s*auth-page-enter\s+300ms\s+cubic-bezier\(0\.0,\s*0\.0,\s*0\.2,\s*1\.0\)/);
  });

  it('disables the animation under prefers-reduced-motion (mirrors useReducedMotion)', () => {
    const guard = css.match(
      /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[^}]*\.auth-page-transition[^}]*\}/s,
    );
    expect(guard).not.toBeNull();
    expect(guard![0].replace(/\s+/g, ' ')).toMatch(/animation:\s*none/);
  });
});
