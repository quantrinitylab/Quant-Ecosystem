// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// Regression guard for the logo-audit P1 (2026-10-12): the browser tab icon
// must be the QuantMail "M" mark vector SVG, FIRST in the icon order. The
// Quanty ghost is the mascot — it may live on mascot surfaces (service-worker
// and desktop-notification icons), but never in icon/favicon duty. The SVG
// must match the canonical Canvas 2D live mark (squircle ember plate + M).

const APP_DIR = new URL('../', import.meta.url); // apps/quantmail/src/
const PUBLIC_DIR = new URL('../../public/', import.meta.url);

const read = (url: URL): string => readFileSync(fileURLToPath(url), 'utf8');

/** Extract the `icons: { ... }` metadata block from the root layout source. */
function iconsBlock(): string {
  const src = read(new URL('./app/layout.tsx', APP_DIR));
  const start = src.indexOf('icons: {');
  expect(start, 'root layout.tsx must declare a metadata icons block').toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces in layout.tsx icons block');
}

/** Every '/...' asset path referenced inside the icons block. */
function referencedIconPaths(): string[] {
  const matches = iconsBlock().matchAll(/'(\/[^']+)'/g);
  return [...matches].map((m) => m[1]);
}

describe('favicon metadata (logo-audit P1 regression)', () => {
  it('tab icon is the M-mark SVG first — no ghost PNG in icon duty', () => {
    const block = iconsBlock();
    expect(block).toContain("url: '/favicon.svg'");
    expect(block).toContain("type: 'image/svg+xml'");
    expect(block).not.toContain('quanty-ghost');
  });

  it('shortcut icon is the M-mark SVG', () => {
    expect(iconsBlock()).toMatch(/shortcut:\s*'\/favicon\.svg'/);
  });

  it('apple-touch-icon is the M-mark PNG render, not the ghost', () => {
    const block = iconsBlock();
    expect(block).toMatch(/apple:\s*'\/apple-touch-icon\.png'/);
    expect(block).not.toContain('quanty-ghost-apple');
  });

  it('every icon path referenced by metadata exists under public/', () => {
    for (const p of referencedIconPaths()) {
      const file = new URL(`.${p}`, PUBLIC_DIR);
      expect(existsSync(fileURLToPath(file)), `missing icon asset: ${p}`).toBe(true);
    }
  });

  it('manifest.json serves the M-mark SVG first, no ghost in icons', () => {
    const manifest = JSON.parse(read(new URL('./manifest.json', PUBLIC_DIR)));
    expect(manifest.name).toBe('QuantMail');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons[0].src).toBe('/favicon.svg');
    expect(manifest.icons[0].type).toBe('image/svg+xml');
    for (const icon of manifest.icons) {
      expect(String(icon.src)).not.toContain('ghost');
    }
  });

  it('favicon.svg is the vector M mark (Canvas-2D live-mark design)', () => {
    const svg = read(new URL('./favicon.svg', PUBLIC_DIR)).trim();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    // Hand-authored vector reproduction of the canonical Canvas 2D live mark:
    // squircle ember plate + restored 54x44 M bezier (see file header comment).
    expect(svg).toContain('QuantMail favicon');
    expect(svg).toContain('id="qm-ember"');
    expect(svg).not.toContain('ghost');
  });
});
