#!/usr/bin/env node
/*
 * Token codemod — convert hardcoded hex inside Tailwind arbitrary brackets
 * (`bg-[#RRGGBB]`, `text-[#RRGGBB]`, `border-[#RRGGBB]`, `ring-[#RRGGBB]`, etc.)
 * to the themeable `--quant-*` / `--brand-*` CSS variables defined in globals.css.
 *
 * SAFETY RULES (verified empirically against the running Tailwind 3.4.13 build):
 *  - Only touches hex INSIDE `-[#...]` brackets (Tailwind arbitrary values).
 *    Bare hex strings in data arrays (color pickers, language/tone colors, OAuth
 *    brand colors) are NOT in brackets, so they are never matched.
 *  - SKIPS any occurrence with an opacity suffix `/NN` — `bg-[var(--x)]/NN` does
 *    not compile in TW3.4, and the brand/status colors are theme-constant so the
 *    hex-with-opacity form is already theme-correct. Leaving them is correct.
 *  - quantgit/ is EXCLUDED (its GitHub-dark palette is a separate design system
 *    handled in a later wave; converting it piecemeal would leave it half-themed).
 *
 * Usage:  node scripts/codemod-tokens.mjs --dry    (report only, writes nothing)
 *         node scripts/codemod-tokens.mjs --apply  (write changes)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'src');
const APPLY = process.argv.includes('--apply');

// hex (lowercased, no #) -> replacement CSS var. Non-opacity occurrences only.
const MAP = {
  // ---- Canonical neutrals (exact token values) ----
  '090a0c': '--quant-background',
  '080809': '--quant-background',
  '0b0c0f': '--quant-background',
  'f5f5f5': '--quant-foreground',
  '111318': '--quant-surface',
  '16181d': '--quant-surface-elevated',
  '0d0f12': '--quant-surface-subtle',
  'a1a4ac': '--quant-muted-foreground',
  '6b6e76': '--quant-text-muted',
  '282c35': '--quant-border',
  '3a404d': '--quant-border-strong',
  // ---- Brand + status (theme-constant; convert for consistency) ----
  'ff8c42': '--brand-primary',
  'ff9b5a': '--brand-primary-hover',
  'e8752f': '--brand-primary-pressed',
  'ffb875': '--brand-accent',
  '22c55e': '--quant-success',
  'ef4444': '--quant-destructive',
  'f59e0b': '--quant-warning',
  '3b82f6': '--quant-info',
  // ---- WAVE 2: drift near-blacks → canvas (collapse per design-system audit) ----
  '08090d': '--quant-background', '0a0b0e': '--quant-background', '0b0b0d': '--quant-background',
  '0c0c0f': '--quant-background', '0d0e11': '--quant-background', '0d0f13': '--quant-background',
  '0d1017': '--quant-background', '0e1014': '--quant-background', '101014': '--quant-background',
  '0f172a': '--quant-background',
  // ---- drift mid surfaces → surface ----
  '121216': '--quant-surface', '121316': '--quant-surface', '12141a': '--quant-surface',
  '121622': '--quant-surface', '141824': '--quant-surface',
  // ---- drift elevated surfaces → surface-elevated ----
  '181c26': '--quant-surface-elevated', '1a1d23': '--quant-surface-elevated',
  '1e1e24': '--quant-surface-elevated', '1e2128': '--quant-surface-elevated',
  '1e222a': '--quant-surface-elevated', '1e222b': '--quant-surface-elevated',
  '1f2228': '--quant-surface-elevated', '1f2328': '--quant-surface-elevated',
  '1f242c': '--quant-surface-elevated', '20232b': '--quant-surface-elevated',
  '25252e': '--quant-surface-elevated', '1c1f26': '--quant-border',
  // ---- GitHub-palette leakage OUTSIDE quantgit (drive/doc, editors, calendar) → quant roles ----
  '0d1117': '--quant-background', '010409': '--quant-background',
  '161b22': '--quant-surface', '21262d': '--quant-surface-elevated',
  '30363d': '--quant-border', '484f58': '--quant-border-strong',
  'e6edf3': '--quant-foreground', 'f0f6fc': '--quant-foreground', 'c9d1d9': '--quant-foreground',
  '7d8590': '--quant-muted-foreground', '8d96a0': '--quant-muted-foreground',
  '8b949e': '--quant-text-muted', '656d76': '--quant-text-muted', '6e7681': '--quant-text-muted',
  '58a6ff': '--quant-info', '238636': '--quant-success', '2ea043': '--quant-success',
  '3fb950': '--quant-success', 'f85149': '--quant-destructive', 'da3633': '--quant-destructive',
  'd29922': '--quant-warning',
  // ---- grey + status-light drift ----
  '9ca3af': '--quant-muted-foreground', '6b7280': '--quant-muted-foreground',
  '9e9e9e': '--quant-muted-foreground', '5e6472': '--quant-text-muted',
  '4c4654': '--quant-text-muted', '9b99a6': '--quant-text-muted',
  '4ade80': '--quant-success', '10b981': '--quant-success', 'f87171': '--quant-destructive',
  'fbbf24': '--quant-warning', '60a5fa': '--quant-info',
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'quantgit' || name === 'node_modules' || name === '.next') continue;
      walk(p, out);
    } else if (/\.(tsx|ts)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

// Match `<prefix>-[#hex]` where the bracket is NOT followed by `/` (opacity).
// prefix is a tailwind color utility (bg, text, border, ring, fill, stroke, from, to, via, decoration, outline, shadow, caret, accent, divide, placeholder).
const RE = /\b((?:bg|text|border|ring|fill|stroke|from|to|via|decoration|outline|caret|accent|divide|placeholder|ring-offset)(?:-[a-z]+)?)-\[#([0-9A-Fa-f]{6})\](?!\/)/g;

const files = walk(SRC);
let totalHits = 0, totalFiles = 0, skippedUnmapped = {};
const perFile = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let hits = 0;
  const next = src.replace(RE, (m, prefix, hex) => {
    const token = MAP[hex.toLowerCase()];
    if (!token) { skippedUnmapped[hex.toLowerCase()] = (skippedUnmapped[hex.toLowerCase()] || 0) + 1; return m; }
    hits++;
    return `${prefix}-[var(${token})]`;
  });
  if (hits > 0) {
    totalHits += hits; totalFiles++;
    perFile.push([relative(ROOT, file), hits]);
    if (APPLY) writeFileSync(file, next, 'utf8');
  }
}

perFile.sort((a, b) => b[1] - a[1]);
console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'} — ${totalHits} replacements across ${totalFiles} files\n`);
console.log('Top files:');
for (const [f, n] of perFile.slice(0, 25)) console.log(`  ${String(n).padStart(4)}  ${f}`);
const unmapped = Object.entries(skippedUnmapped).sort((a, b) => b[1] - a[1]);
console.log(`\nUnmapped hexes left in brackets (top 20 — candidates for a later wave / GitHub palette):`);
for (const [h, n] of unmapped.slice(0, 20)) console.log(`  ${String(n).padStart(4)}  #${h}`);
console.log(`\n(total distinct unmapped: ${unmapped.length})`);
