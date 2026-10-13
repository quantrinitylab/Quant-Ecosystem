// ============================================================================
// AuthBrandPanel — zero-JS brand mark on the signed-out auth pages.
//
// Finding (queue 2026-10-12, P1 perf-load): AuthBrandPanel's BrandLockup
// rendered the interactive canvas <QuantMailLogo interactive={false}> for
// /login, /register, /forgot-password and /reset-password. The canvas mark
// drags the marks/living-logo pipeline plus a rAF repaint loop into the
// signed-out shell for a lockup that can never animate (no hover, no spin,
// no blink response with interactive={false}) — and paints nothing until its
// first rAF frame, leaving an empty box on first paint. (The framer-motion
// half of this finding was already removed when QuantMailLogo's own motion
// moved to the CSS qm-logo-motion classes; the canvas pipeline was what
// remained.)
//
// The fix renders <QuantMailLogoStatic> instead — the pure-SVG twin whose
// geometry is derived bezier-for-bezier from QuantMailLogo's own markMPath
// (the sanctioned "SVG matches the Canvas-2D M-mark design" brand lock;
// BrandLoader ships the same mark on the splash loader). Same locked mark,
// zero JS, paints on first paint.
//
// These tests pin the fix (renderToStaticMarkup — apps/quantmail has no
// @testing-library/react):
//   1. The panel's lockups render as pure SVG: the static mark's ember
//      gradient is present, and there is no <canvas>, no qm-logo-motion
//      span class, no framer-motion anywhere in the markup.
//   2. Both lockup sizes still render (mobile 32, desktop 40).
//   3. The rendered mark carries the locked M silhouette + eyes (not an
//      empty svg), and the lockup keeps its accessible name.
//   4. Source scan: AuthBrandPanel.tsx must import QuantMailLogoStatic and
//      must NOT import the canvas QuantMailLogo, framer-motion, or anything
//      under the marks/ pipeline — a regression silently re-adds the canvas
//      loop to the public auth shell.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AuthBrandPanel } from '../AuthBrandPanel';

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

/** Source with block and line comments stripped (the fix is documented in prose). */
function readSourceStripped(relApp: string): string {
  return readFileSync(findSource(relApp), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function renderPanel(): string {
  return renderToStaticMarkup(
    <AuthBrandPanel eyebrow="Test eyebrow" title="Test title" subtitle="Test subtitle" />,
  );
}

describe('AuthBrandPanel brand mark is zero-JS', () => {
  it('renders the static SVG mark — no canvas, no motion classes, no framer-motion', () => {
    const html = renderPanel();
    // QuantMailLogoStatic's ember plate gradient.
    expect(html).toContain('qm-static-plate');
    // The canvas QuantMailLogo renders a <canvas> and wraps it in the
    // CSS-motion span; neither may survive in the signed-out shell.
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('qm-logo-motion');
    expect(html).not.toContain('framer-motion');
  });

  it('renders both lockup sizes as SVG (mobile 32, desktop 40)', () => {
    const html = renderPanel();
    expect(html).toContain('width="32"');
    expect(html).toContain('width="40"');
  });

  it('renders the locked M silhouette with eyes, not an empty svg', () => {
    const html = renderPanel();
    // M_PATH: the 54x44 bezier from QuantMailLogo's markMPath (x 23, y 30).
    expect(html).toContain('M 30 74 A 7 7 0 0 1 23 67');
    expect(html).toContain('C 38 32 44 47 50 47');
    // Eyes at rest: open pupils on the (40.5, 60) / (59.5, 60) centreline.
    expect(html).toContain('cx="40.5" cy="60"');
    expect(html).toContain('cx="59.5" cy="60"');
  });

  it('lockup keeps its accessible name for screen readers', () => {
    const html = renderPanel();
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="[^"]+"/);
  });
});

describe('AuthBrandPanel source pins the zero-JS brand path', () => {
  it('imports QuantMailLogoStatic, never the canvas QuantMailLogo / marks pipeline', () => {
    const source = readSourceStripped('components/auth/AuthBrandPanel.tsx');
    expect(source).toMatch(/from '\.\.\/QuantMailLogoStatic'/);
    // Exact closing quote: must not match '../QuantMailLogoStatic'.
    expect(source).not.toMatch(/from '\.\.\/QuantMailLogo'/);
    expect(source).not.toMatch(/framer-motion/);
    expect(source).not.toMatch(/from '\.\.\/marks\//);
    expect(source).not.toMatch(/from '\.\/marks\//);
  });
});
