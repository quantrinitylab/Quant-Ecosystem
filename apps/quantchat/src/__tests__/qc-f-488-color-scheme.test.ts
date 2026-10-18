// ============================================================================
// QC-F-488 — no `color-scheme` declaration anywhere in the app (regression net)
// ============================================================================
//
// The app's theme system only swaps `--quant-*` tokens via the `.dark`
// class (globals.css `:root` / `.dark` blocks, driven by ThemeProvider's
// resolved theme). The browser was never told the scheme, so every native
// widget — date/time/color picker indicators and popups, select popups,
// scrollbars — rendered in the UA's default LIGHT scheme even for
// dark-resolved users. On Memories' `bg-black/40` date inputs the calendar
// indicator (a dark glyph) was effectively invisible on black.
//
// The root-cause fix is a single declaration pair in the one file both
// router shells import (src/app/globals.css): `color-scheme: light` on
// `:root` and `color-scheme: dark` on `.dark`, so the scheme always
// follows the resolved theme class. No per-component declarations, no
// picker-indicator filter hacks, no `only` keyword (which would fight a
// user's forced-scheme preference).
//
// This suite is a source contract in the qc-f-044 pattern. All checks are
// BLOCK-SCOPED: a declaration in the wrong block must fail, not pass.
//   T1: `:root` declares `color-scheme: light` (and not dark).
//   T2: `.dark` declares `color-scheme: dark`, the `.dark` block starts
//       after `:root` (source-order cascade pin), and no declaration
//       uses `only`.
//   T3: globals.css carries exactly 2 `color-scheme` declarations, and
//       no shipped .ts/.tsx source declares one of its own (single
//       source of truth).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Resolve a repo source file regardless of whether the suite runs with the
// cwd at the quantchat app or at the monorepo root (qc-f-044 pattern).
function readAppSource(relFromApp: string): string {
  const candidates = [
    resolve(process.cwd(), relFromApp),
    resolve(process.cwd(), 'apps/quantchat', relFromApp),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not locate source file: ${relFromApp}`);
  return readFileSync(found, 'utf8');
}

function appRoot(): string {
  const candidates = [
    resolve(process.cwd()),
    resolve(process.cwd(), 'apps/quantchat'),
  ];
  const found = candidates.find((p) => existsSync(join(p, 'src/app/globals.css')));
  if (!found) throw new Error('Could not locate quantchat app root');
  return found;
}

const globalsCss = readAppSource('src/app/globals.css');

/**
 * Body of the first top-level block whose selector line is exactly the
 * given selector (e.g. `:root` or `.dark`). The globals.css token blocks
 * are flat (no nested braces); the scan still counts braces so a nested
 * rule can never silently truncate the block. Returns '' when absent.
 */
function blockBody(selector: string): string {
  // Selector must start a line (the token blocks are top-level rules).
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`);
  const m = re.exec(globalsCss);
  if (!m) return '';
  const open = globalsCss.indexOf('{', m.index);
  let depth = 0;
  for (let i = open; i < globalsCss.length; i++) {
    if (globalsCss[i] === '{') depth++;
    else if (globalsCss[i] === '}') {
      depth--;
      if (depth === 0) return globalsCss.slice(open + 1, i);
    }
  }
  return '';
}

function blockStart(selector: string): number {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`);
  const m = re.exec(globalsCss);
  return m ? m.index : -1;
}

describe('QC-F-488: color-scheme follows the resolved theme', () => {
  it('T1: :root block declares color-scheme: light (and not dark)', () => {
    const root = blockBody(':root');
    // Guard the guard: the block really is the token block.
    expect(root).toContain('--quant-background');
    expect(root).toMatch(/color-scheme\s*:\s*light\s*;/);
    expect(root).not.toMatch(/color-scheme\s*:\s*[^;]*dark/);
  });

  it('T2: .dark block declares color-scheme: dark, after :root, with no `only`', () => {
    const dark = blockBody('.dark');
    expect(dark).toContain('--quant-background');
    expect(dark).toMatch(/color-scheme\s*:\s*dark\s*;/);
    // Cascade pin: equal specificity, so source order decides — `.dark`
    // must come after `:root` or dark-resolved users would stay light.
    expect(blockStart(':root')).toBeGreaterThanOrEqual(0);
    expect(blockStart('.dark')).toBeGreaterThan(blockStart(':root'));
    // `only` would override a user's forced-scheme preference — banned
    // in either block (and anywhere in the file).
    expect(globalsCss).not.toMatch(/color-scheme\s*:\s*only\b/);
  });

  it('T3: exactly two declarations in globals.css and none in shipped ts/tsx', () => {
    const declarations = globalsCss.match(/color-scheme\s*:/g) ?? [];
    expect(declarations).toHaveLength(2);

    // Single source of truth: no component/page may declare its own
    // scheme. Walk shipped src only, excluding tests.
    const srcRoot = join(appRoot(), 'src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry !== '__tests__') walk(full);
        } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
          const text = readFileSync(full, 'utf8');
          if (/color-scheme|colorScheme/.test(text)) offenders.push(full);
        }
      }
    };
    walk(srcRoot);
    expect(offenders).toEqual([]);
  });
});
