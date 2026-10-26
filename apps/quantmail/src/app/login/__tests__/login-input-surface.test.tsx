// ============================================================================
// Login input surface — solid dark inputs, no backdrop-filter
// (fix/qm-login-input-backdrop-r2).
//
// Finding (queue 2026-10-12, P2 perf-runtime): the email and password inputs
// used `bg-[var(--quant-surface)]/90 backdrop-blur` — backdrop-filter forces
// extra compositing passes on mobile GPUs on every keystroke/focus for zero
// visual gain on a pure-black page. The fix renders both inputs on a solid
// surface with no backdrop-filter.
//
// These tests pin the fix with source scans (apps/quantmail has no
// @testing-library/react, so no component rendering — same convention as
// the sibling login-shell suite). Rendering is unnecessary here: the defect
// lives entirely in the static class strings.
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

const readSource = (relApp: string): string =>
  readFileSync(findSource(relApp), 'utf8');

describe('login input surface (no backdrop-filter)', () => {
  it('login-form.tsx contains no backdrop-blur / backdrop-filter at all', () => {
    const src = readSource('app/login/login-form.tsx');
    expect(src).not.toContain('backdrop-blur');
    expect(src).not.toContain('backdrop-filter');
  });

  it('email input renders on a solid surface (no translucent + blur pair)', () => {
    const src = readSource('app/login/login-form.tsx');
    expect(src).not.toContain('bg-[var(--quant-surface)]/90 backdrop-blur');
    // The email field keeps its shape/border/focus styling, minus the blur.
    expect(src).toContain(
      'w-full rounded-xl border bg-[var(--quant-surface)] px-3.5 py-3 text-sm text-white',
    );
  });

  it('password wrapper renders on a solid surface (no translucent + blur pair)', () => {
    const src = readSource('app/login/login-form.tsx');
    expect(src).toContain(
      'flex overflow-hidden rounded-xl border bg-[var(--quant-surface)] transition-all',
    );
  });
});
