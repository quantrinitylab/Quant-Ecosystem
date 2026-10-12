// @vitest-environment jsdom
// ============================================================================
// Root error boundary (app/error.tsx) — zero-JS replacement for framer-motion.
//
// Finding (queue 2026-10-12, P0 perf-load): app/error.tsx is the
// route-independent error boundary, bundled with every route. It imported
// { motion, useReducedMotion } from 'framer-motion' directly — another copy of
// the ~114KB runtime in the route-independent payload — for a gentle enter
// animation (opacity 0→1 + scale 0.9→1, spring.gentle) and a hover/tap press
// scale on the "Try again" button (whileHover 1.02 / whileTap 0.98,
// spring.snappy). The shared-ui <Button> ALSO pulled framer-motion in
// (useReducedMotion for its loading spinner), so the fix replaces the button
// with a plain <button> carrying the exact shared-Button primary/md classes.
//
// These tests pin the fix:
//   1. The boundary renders the error UI: title, description, "Try again"
//      button, "Go to Inbox" link, digest reference when present.
//   2. Clicking "Try again" calls reset().
//   3. The enter wrapper carries the qm-error-enter class and the button
//      wrapper carries qm-error-press (the CSS hooks that replace motion.div).
//   4. Source scan: error.tsx imports no framer-motion and pulls none in
//      transitively (no @quant/shared-ui import) — a regression would
//      silently re-add the runtime to the every-route chunk.
//   5. CSS parity: the shipped <style> defines @keyframes qm-error-enter with
//      opacity 0→1 / scale 0.9→1, applies it as a 500ms brand-ease-out
//      animation (mirrors critically-damped spring.gentle), defines the
//      hover 1.02 / active 0.98 press rule (mirrors whileHover/whileTap), and
//      disables all of it under prefers-reduced-motion (mirrors
//      useReducedMotion).
// ============================================================================

import { describe, expect, it, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import ErrorBoundary from '../error';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderBoundary(props?: {
  error?: Error & { digest?: string };
  reset?: () => void;
}) {
  const error = props?.error ?? new Error('boom');
  const reset = props?.reset ?? (() => {});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<ErrorBoundary error={error} reset={reset} />);
  });
  return container!;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/** error.tsx lives next to this test file (src/app/__tests__/error-boundary.test.tsx).
 *  Walk up from cwd like the auth-page-transition suite does. */
function errorSource(): string {
  const rels = ['src/app/error.tsx', 'apps/quantmail/src/app/error.tsx'];
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    for (const rel of rels) {
      const candidate = join(dir, rel);
      if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate app/error.tsx from ${process.cwd()}`);
}

/** The <style> element the boundary ships; strip comments the same way. */
function stripComments(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

describe('error boundary renders the error UI', () => {
  it('shows the title, description, try-again button and inbox link', () => {
    const el = renderBoundary();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('#global-error-title')?.textContent).toBe(
      "QuantMail couldn't open this view",
    );
    expect(el.querySelector('#global-error-description')?.textContent).toMatch(
      /couldn't finish loading this view/,
    );
    expect(el.querySelector('button[type="button"]')?.textContent).toBe('Try again');
    const inboxLink = el.querySelector('a[href="/"]');
    expect(inboxLink?.textContent).toBe('Go to Inbox');
    expect(el.querySelector('a[href="mailto:support@quantrinity.in"]')).not.toBeNull();
  });

  it('calls reset when "Try again" is clicked', () => {
    const reset = vi.fn();
    const el = renderBoundary({ reset });
    const button = el.querySelector('button[type="button"]') as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('shows the digest reference when provided and omits it otherwise', () => {
    const withDigest = renderBoundary({
      error: Object.assign(new Error('boom'), { digest: 'abc123' }),
    });
    expect(withDigest.textContent).toMatch(/Reference: abc123/);
    act(() => {
      root!.unmount();
    });
    container!.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(<ErrorBoundary error={new Error('boom')} reset={() => {}} />);
    });
    expect(container!.textContent).not.toMatch(/Reference:/);
  });

  it('wraps the content in the CSS enter and press hooks', () => {
    const el = renderBoundary();
    const enter = el.querySelector('.qm-error-enter');
    expect(enter).not.toBeNull();
    expect(enter!.classList.contains('flex')).toBe(true);
    const press = el.querySelector('.qm-error-press');
    expect(press).not.toBeNull();
    expect(press!.querySelector('button[type="button"]')).not.toBeNull();
  });
});

describe('error boundary carries no framer-motion', () => {
  it('error.tsx imports no framer-motion (source scan, comments stripped)', () => {
    const source = stripComments(errorSource());
    expect(source).not.toMatch(/framer-motion/);
    expect(source).not.toMatch(/motion\./);
    expect(source).not.toMatch(/useReducedMotion/);
  });

  it('error.tsx pulls no transitive framer-motion via shared-ui', () => {
    const source = stripComments(errorSource());
    // The shared-ui <Button> imports useReducedMotion from framer-motion;
    // the boundary must not import anything from @quant/shared-ui.
    expect(source).not.toMatch(/@quant\/shared-ui/);
  });

  it('the try-again button keeps the shared-Button primary/md look', () => {
    const el = renderBoundary();
    const button = el.querySelector('button[type="button"]') as HTMLButtonElement;
    // Brand primary orange, dark text, 44px touch floor — the pixels the
    // shared Button variant="primary" size="md" rendered.
    expect(button.className).toMatch(/bg-\[#FF8C42\]/);
    expect(button.className).toMatch(/text-\[#111111\]/);
    expect(button.className).toMatch(/min-h-\[44px\]/);
  });
});

describe('qm-error-enter CSS parity with the old motion.div pair', () => {
  /** Read the shipped <style> from a rendered boundary. */
  function shippedCss(): string {
    const el = renderBoundary();
    const style = el.querySelector('style');
    expect(style).not.toBeNull();
    return style!.textContent!.replace(/\s+/g, ' ');
  }

  it('defines @keyframes qm-error-enter with opacity 0→1 and scale 0.9→1', () => {
    const css = shippedCss();
    expect(css).toMatch(/@keyframes qm-error-enter/);
    // from: opacity 0 + scale(0.9) — mirrors initial={{ opacity: 0, scale: 0.9 }}
    expect(css).toMatch(/from\s*\{\s*opacity:\s*0;\s*transform:\s*scale\(0\.9\);?\s*\}/);
    // to: opacity 1 + scale(1) — mirrors animate={{ opacity: 1, scale: 1 }}
    expect(css).toMatch(/to\s*\{\s*opacity:\s*1;\s*transform:\s*scale\(1\);?\s*\}/);
  });

  it('applies the enter animation as 500ms brand ease-out (mirrors spring.gentle)', () => {
    const css = shippedCss();
    // spring.gentle { stiffness: 100, damping: 20, mass: 1 } is critically
    // damped: no overshoot, ~0.5s settle — brand easeOut, 500ms.
    expect(css).toMatch(
      /\.qm-error-enter\s*\{\s*animation:\s*qm-error-enter\s+500ms\s+cubic-bezier\(0\.0,\s*0\.0,\s*0\.2,\s*1\.0\);?\s*\}/,
    );
  });

  it('defines the hover 1.02 / active 0.98 press rule (mirrors whileHover/whileTap)', () => {
    const css = shippedCss();
    expect(css).toMatch(/\.qm-error-press:hover\s*\{\s*transform:\s*scale\(1\.02\);?\s*\}/);
    expect(css).toMatch(/\.qm-error-press:active\s*\{\s*transform:\s*scale\(0\.98\);?\s*\}/);
  });

  it('disables all animation under prefers-reduced-motion (mirrors useReducedMotion)', () => {
    const css = shippedCss();
    const guard = css.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*)\}/);
    expect(guard).not.toBeNull();
    const body = guard![1];
    expect(body).toMatch(/\.qm-error-enter[^}]*animation:\s*none/);
    expect(body).toMatch(/\.qm-error-press[^{]*\{[^}]*transition:\s*none/);
    expect(body).toMatch(/transform:\s*none/);
  });
});
