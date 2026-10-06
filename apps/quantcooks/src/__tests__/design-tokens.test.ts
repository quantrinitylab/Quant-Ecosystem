// ============================================================================
// QuantCooks — design-token visual check (P0-3).
//
// Root cause of the invisible "Sign in" button / invisible logo tile: the
// components are themed on --brand-* / --quant-* CSS variables, but
// src/pages/globals.css never defined them (and never imported the
// @quant/brand preset) — so bg-[var(--brand-primary)] degraded to
// transparent and white-on-white text.
//
// This test pins the fix two ways:
//   1. every semantic token the themed components use is defined with a
//      non-empty value in both :root and .dark,
//   2. NO var(--x) referenced anywhere in the app's source is left undefined
//      (the exact failure mode that made the button invisible).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, '..', '..'); // apps/quantcooks
const GLOBALS_CSS = join(APP_ROOT, 'src', 'pages', 'globals.css');

/** Declarations inside a selector block: { '--token': 'value' }. */
function declarationsInBlock(css: string, selector: string): Map<string, string> {
  // Strip comments first: a comment chunk would otherwise swallow the
  // declaration that follows it when we split on ';'.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g');
  const out = new Map<string, string>();
  for (const match of clean.matchAll(re)) {
    for (const decl of match[1].split(';')) {
      const m = decl.match(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*(.+?)\s*$/);
      if (m) out.set(m[1], m[2]);
    }
  }
  return out;
}

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walkTsx(full, acc);
    } else if (/\.(tsx|ts|css)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Every var(--token) referenced in the app's source files. */
function usedTokens(): Set<string> {
  const used = new Set<string>();
  for (const file of walkTsx(join(APP_ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
      used.add(m[1]);
    }
  }
  return used;
}

const REQUIRED_TOKENS = [
  '--brand-primary',
  '--quant-background',
  '--quant-foreground',
  '--quant-surface',
  '--quant-border',
  '--quant-muted',
  '--quant-muted-foreground',
  '--quant-destructive',
];

describe('design tokens (globals.css)', () => {
  const css = readFileSync(GLOBALS_CSS, 'utf8');
  const root = declarationsInBlock(css, ':root');
  const dark = declarationsInBlock(css, '.dark');

  it.each(REQUIRED_TOKENS)('defines %s in :root with a real color value', (token) => {
    const value = root.get(token);
    expect(value, `${token} missing from :root in globals.css`).toBeDefined();
    expect(value!.trim().length).toBeGreaterThan(0);
    // A resolved var() must not be empty/transparent — the exact P0-3 failure.
    expect(value!.trim()).not.toBe('transparent');
  });

  it.each(REQUIRED_TOKENS)('defines %s in .dark too (no white-on-white in dark mode)', (token) => {
    const value = dark.get(token);
    expect(value, `${token} missing from .dark in globals.css`).toBeDefined();
    expect(value!.trim().length).toBeGreaterThan(0);
  });

  it('leaves no var(--x) used in source undefined (the invisible-button failure mode)', () => {
    const defined = new Set([...root.keys(), ...dark.keys()]);
    const missing = [...usedTokens()].filter((token) => !defined.has(token));
    expect(missing, `undefined CSS tokens referenced in source: ${missing.join(', ')}`).toEqual(
      [],
    );
  });

  it('gives the Sign in button a visible background (brand-primary is a solid color)', () => {
    // login.tsx: bg-[var(--brand-primary)] text-white — must resolve to a
    // non-transparent color or the button is invisible again.
    const value = root.get('--brand-primary')!;
    expect(value).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i);
  });
});
