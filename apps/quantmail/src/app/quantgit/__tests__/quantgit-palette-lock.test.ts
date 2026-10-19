import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { QuantGitRowSkeleton } from '../components/QuantGitSkeletons';

// QM-FIX-LOOP — QuantGit palette design lock (finding: GitHub-dark palette +
// divider lines violate the pure-black / no-divider-lines lock).
// Locked rules enforced here:
//   1. No GitHub-dark SURFACE classes: bg-[#0D1117], bg-[#21262D], bg-[#161B22],
//      bg-[#1F242C], bg-[#1C2128], bg-[#181C28], bg-[#111418], bg-[#0B0C0E]
//      (pure-black surfaces: bg-black / var(--quant-*) tokens only).
//   2. No hard-coded GitHub-dark BORDER grays: border-[#30363D],
//      border-[#21262D], border-[#232938] (use var(--quant-border)).
//   3. No blue-dominant accents: #58A6FF / #388BFD / #0969DA / #0A3069 / #1F6FEB
//      and off-lock purples #8957E5 / #A371F7 / #906FFA / #5319E7
//      (locked QuantGit accent is #8B5CF6), no blue-400/blue-500 utilities.
// Intentional non-matches (NOT violations, excluded below):
//   - syntax-highlight token colors (#79C0FF, #A5D6FF, #D2A8FF, #FFA657, ...)
//   - GitHub language-breakdown colors in page.tsx / constants.ts (data)
//   - terminal ANSI palette in BuildTerminal.tsx
//   - unwired GitHub theme-preset data in DeveloperAppearanceSettings.tsx

const QUANTGIT_DIR = path.resolve(__dirname, '..');

function quantgitSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      // skip this lock file itself: its doc comments name the banned tokens
      else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith('quantgit-palette-lock.test.ts'))
        out.push(p);
    }
  };
  walk(QUANTGIT_DIR);
  return out;
}

const SURFACE_RE =
  /(hover:|focus:|disabled:)?bg-\[#(?:0D1117|161B22|21262D|1F242C|1C2128|181C28|111418|0B0C0E)\]/i;
const BORDER_GRAY_RE =
  /border(-[lrtbxy])?-\[#(?:30363D|21262D|232938)\]/i;
const ACCENT_RE =
  /\[#(?:58A6FF|388BFD|0969DA|0A3069|1F6FEB|8957E5|A371F7|906FFA|5319E7)\]/i;
const BLUE_UTIL_RE = /(bg|text|border|from|via|to)-blue-(400|500)/;
// Unwired GitHub theme-preset DATA (never rendered as app surfaces).
const PRESET_DATA_RE = /\{\s*id:\s*\d+\s*,\s*name:/;

function scan(re: RegExp, skipPresetData: boolean): string[] {
  const offenders: string[] = [];
  for (const f of quantgitSourceFiles()) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (skipPresetData && PRESET_DATA_RE.test(line)) return;
      if (re.test(line))
        offenders.push(`${path.relative(QUANTGIT_DIR, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return offenders;
}

describe('QuantGit design lock: pure-black palette, purple accent', () => {
  it('covers the whole QuantGit surface (sanity: files were found)', () => {
    expect(quantgitSourceFiles().length).toBeGreaterThan(10);
  });

  it('no GitHub-dark surface classes (bg-[#0D1117], bg-[#21262D], …)', () => {
    expect(scan(SURFACE_RE, false), 'GitHub-dark surfaces violate the pure-black lock').toEqual([]);
  });

  it('no hard-coded GitHub-dark border grays (border-[#30363D], …)', () => {
    expect(scan(BORDER_GRAY_RE, false), 'use var(--quant-border) instead').toEqual([]);
  });

  it('no blue-dominant / off-lock accent hexes (#58A6FF, #8957E5, …)', () => {
    expect(scan(ACCENT_RE, true), 'locked QuantGit accent is #8B5CF6').toEqual([]);
  });

  it('no blue-400/blue-500 Tailwind utilities', () => {
    expect(scan(BLUE_UTIL_RE, false), 'shift blue utilities to #8B5CF6').toEqual([]);
  });

  it('rendered QuantGitRowSkeleton carries no banned palette classes', () => {
    const html = renderToStaticMarkup(
      React.createElement(QuantGitRowSkeleton, { rows: 2 }),
    );
    expect(html).toContain('quantgit-row-skeleton');
    for (const re of [SURFACE_RE, BORDER_GRAY_RE, ACCENT_RE, BLUE_UTIL_RE]) {
      expect(re.test(html), `rendered HTML matches ${re}`).toBe(false);
    }
  });
});
