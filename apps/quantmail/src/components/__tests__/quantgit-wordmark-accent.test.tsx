import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync } from 'node:fs';
import { BrandWordmark } from '../BrandWordmark';

/**
 * qm-quantgit-accent-old-build — QuantGit purple-accent lock, wordmark + ghost pill.
 *
 * The 2026-10-12 live old-build screenshot showed QuantGit branding in Mail
 * orange: the "Quant Git" wordmark rendered "Git" in orange, and the sidebar
 * "Ask Quanty" pill was orange. On origin/main both were already masked by
 * overrides (AppShell sets --app-accent to purple on /quantgit; workplace.css,
 * loaded after globals.css, re-points the pill at --app-accent) — but the two
 * stale orange paths below survived underneath, so any load-order or reuse
 * change would resurrect the exact reported symptom:
 *  - BrandWordmark rendered the app NAME in text-[var(--quant-primary)]
 *    (Mail orange) for every app, including app="code" ("Git");
 *  - globals.css .sidebar-quanty-cta used background: var(--quant-primary).
 *
 * These tests pin both paths at var(--app-accent), which resolves to Mail
 * orange by default (globals.css) and to the active app's locked accent
 * inside AppShell — so Mail screens are pixel-identical and QuantGit
 * screens can never go orange again.
 */

const WORDMARK_SRC = readFileSync(
  new URL('../BrandWordmark.tsx', import.meta.url),
  'utf8',
);
const GLOBALS_CSS = readFileSync(
  new URL('../../app/globals.css', import.meta.url),
  'utf8',
);

describe('quantgit wordmark + ghost-pill accent', () => {
  it('BrandWordmark app="code" renders "Git" in var(--app-accent), never Mail-orange', () => {
    const html = renderToStaticMarkup(<BrandWordmark app="code" />);
    expect(html).toContain('Quant');
    expect(html).toContain('Git');
    expect(html).toContain('text-[var(--app-accent)]');
    expect(html).not.toContain('text-[var(--quant-primary)]');
  });

  it('BrandWordmark app="mail" still renders the same labels', () => {
    const html = renderToStaticMarkup(<BrandWordmark app="mail" />);
    expect(html).toContain('Quant');
    expect(html).toContain('Mail');
  });

  it('BrandWordmark source no longer hardcodes --quant-primary for the app name', () => {
    expect(WORDMARK_SRC).toContain('text-[var(--app-accent)]');
    expect(WORDMARK_SRC).not.toContain('text-[var(--quant-primary)]');
  });

  it('globals.css .sidebar-quanty-cta background resolves through --app-accent', () => {
    const rule = GLOBALS_CSS.match(/\.sidebar-quanty-cta \{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toContain('background: var(--app-accent)');
    expect(rule![0]).not.toContain('var(--quant-primary)');
  });
});
