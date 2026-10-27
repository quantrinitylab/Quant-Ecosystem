// BrandWordmarkVector — the signed-out lockup is a vector logo, not text.
// (R4 re-attempt of PR #1694; see BrandWordmarkVector.tsx header.)
//
// Finding (queue 2026-10-12, P2, logo-audit): the signed-out brand
// surfaces rendered the wordmark as font-rendered HTML text spans next
// to the vector M mark — words standing in as half the logo lockup.
// The user-locked direction is a vector SVG lockup. These tests pin it:
// the lockup wordmark and byline render as SVG paths only (no
// font-rendered elements anywhere in the chain), AuthBrandPanel uses the
// vector components (not the text BrandWordmark), and the brand icons
// (favicon, notification icon) are the M mark, never the Quanty ghost.

import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BrandWordmarkVector,
  BrandBylineVector,
} from '../BrandWordmarkVector';

function readSource(rel: string): string {
  // Works whether vitest runs from apps/quantmail (the convention) or the
  // repo root: try the direct path and the apps/quantmail-prefixed path.
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    for (const candidate of [join(dir, rel), join(dir, 'apps/quantmail', rel)]) {
      try {
        return readFileSync(candidate, 'utf8');
      } catch {
        // try the next candidate
      }
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`brand-wordmark-vector: could not locate ${rel}`);
}

describe('BrandWordmarkVector renders paths, never font-rendered text', () => {
  it('wordmark markup is SVG paths with the brand colours, no text element', () => {
    const html = renderToStaticMarkup(<BrandWordmarkVector app="mail" fontSize={20} />);
    expect(html).toContain('<svg');
    expect(html).toContain('<path');
    expect(html).not.toContain('<text');
    // Brand word in the foreground colour, app name in the Mail accent.
    expect(html).toContain('var(--quant-foreground)');
    expect(html).toContain('var(--quant-primary)');
    // The lockup names the brand for no one: the wrapper in AuthBrandPanel
    // carries role="img" + the accessible name, so these SVGs stay silent.
    expect(html).toContain('aria-hidden="true"');
  });

  it('every app variant renders as paths', () => {
    for (const app of ['mail', 'calendar', 'drive', 'contacts', 'code'] as const) {
      const html = renderToStaticMarkup(<BrandWordmarkVector app={app} fontSize={20} />);
      expect(html).toContain('<path');
      expect(html).not.toContain('<text');
    }
  });

  it('wordmark geometry is wider than tall at the lockup size', () => {
    const html = renderToStaticMarkup(<BrandWordmarkVector app="mail" fontSize={20} />);
    const width = Number(/width="([\d.]+)"/.exec(html)?.[1]);
    const height = Number(/height="([\d.]+)"/.exec(html)?.[1]);
    expect(Number.isFinite(width)).toBe(true);
    expect(Number.isFinite(height)).toBe(true);
    expect(width).toBeGreaterThan(height);
    // 20px text read ~16px of glyph height; the vector must match, not
    // balloon to the full 20px line box or shrink to a thumbnail.
    expect(height).toBeGreaterThan(12);
    expect(height).toBeLessThan(20);
  });

  it('byline markup is SVG paths, no text element', () => {
    const html = renderToStaticMarkup(<BrandBylineVector />);
    expect(html).toContain('<svg');
    expect(html).toContain('<path');
    expect(html).not.toContain('<text');
    expect(html).toContain('#A1A4AC');
  });

  it('the vector component source itself contains no font-rendered text element', () => {
    const src = readSource('src/components/BrandWordmarkVector.tsx');
    expect(src).not.toContain('<text');
  });
});

describe('AuthBrandPanel uses the vector lockup', () => {
  it('imports the vector wordmark, not the text wordmark', () => {
    const src = readSource('src/components/auth/AuthBrandPanel.tsx');
    expect(src).toContain('BrandWordmarkVector');
    expect(src).toContain('BrandBylineVector');
    expect(src).not.toContain("from '../BrandWordmark'");
  });

  it('never renders the byline as a text span', () => {
    const src = readSource('src/components/auth/AuthBrandPanel.tsx');
    expect(src).not.toContain('{quantMailAuthLockup.byline}');
    // The accessible name still comes from the canonical contract — the
    // lockup announces once via the wrapper's aria-label.
    expect(src).toContain('quantMailAuthLockup.accessibleName');
  });
});

describe('brand icons are the M mark, never the ghost', () => {
  it('favicon.svg is the vector M mark with no raster fallback', () => {
    const src = readSource('public/favicon.svg');
    expect(src).toContain('<svg');
    expect(src).not.toContain('<image');
    // The canonical 54x44 M bezier from the Canvas-2D mark.
    expect(src).toContain('M 30 74');
  });

  it('the service worker notification icon is the M mark, not the ghost', () => {
    const src = readSource('public/sw.js');
    expect(src).toContain("icon: '/favicon.svg'");
    expect(src).not.toContain('quanty-ghost');
  });
});
