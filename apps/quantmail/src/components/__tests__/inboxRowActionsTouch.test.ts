// ============================================================================
// Inbox row quick actions — touch/keyboard reachability + hover-bar overlap.
//
// P1 2026-10-11 (customer-audits/2026-10-11-mobile-style.md, Part B):
// (a) row quick actions were hover-only — zero actions reachable on touch;
// (b) the floating hover bar visually overlapped the row below.
//
// Root cause of (b): `HoverActions` is a framer-motion `motion.div` that writes
// an inline `transform: translateX(...)` for its slide-in animation. An inline
// `transform` replaces the stylesheet's `transform: translateY(-50%)`
// wholesale, parking the bar's TOP edge at the row's vertical midpoint and
// spilling its bottom half onto the row below. The fix centers the bar with
// the standalone `translate` property, which composes with `transform`
// instead of being replaced by it.
//
// These tests pin:
//   (1) the bar's CSS centers via `translate`, never `transform`;
//   (2) the bar stays hidden on coarse pointers (touch never gets a stuck bar);
//   (3) the row's "…" touch menu is gated on hover CAPABILITY, not width, so a
//       touch laptop / landscape tablet gets actions too;
//   (4) the row reveals the bar on keyboard focus, not just mouse hover.
// ============================================================================

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const globalsCss = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
const shellCss = readFileSync(new URL('../../app/shell.css', import.meta.url), 'utf8');
const pageTsx = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8');

/** Strip /* … *​/ comments so prose in comments can't fake a declaration. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extract the declaration block for the FIRST top-level rule whose selector
 * list contains `selector`. Returns the raw text between the braces.
 */
function ruleBlock(css: string, selector: string): string {
  const clean = stripComments(css);
  const idx = clean.indexOf(selector);
  if (idx === -1) throw new Error(`selector not found: ${selector}`);
  const open = clean.indexOf('{', idx);
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    if (clean[i] === '{') depth++;
    if (clean[i] === '}') {
      depth--;
      if (depth === 0) return clean.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after: ${selector}`);
}

/** Extract the full `@media <query> { … }` block (balanced braces). */
function mediaBlock(css: string, query: string): string {
  const clean = stripComments(css);
  const atRule = `@media ${query}`;
  const idx = clean.indexOf(atRule);
  if (idx === -1) throw new Error(`media query not found: ${atRule}`);
  const open = clean.indexOf('{', idx);
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    if (clean[i] === '{') depth++;
    if (clean[i] === '}') {
      depth--;
      if (depth === 0) return clean.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after: ${atRule}`);
}

describe('hover-actions vertical centering (row-below overlap regression)', () => {
  it('centers with the standalone `translate` property, never `transform`', () => {
    const block = ruleBlock(globalsCss, '.hover-actions');
    // The framer-motion inline transform must have nothing to clobber.
    expect(block).not.toMatch(/(^|;)\s*transform\s*:/);
    expect(block).toMatch(/translate\s*:\s*0\s+-50%/);
  });

  it('still hides the bar on coarse pointers (no stuck bar on touch)', () => {
    const block = mediaBlock(shellCss, '(hover: none), (pointer: coarse)');
    expect(block).toContain('.hover-actions');
    expect(block).toMatch(/display\s*:\s*none/);
  });
});

describe('row touch menu (… button) reachability', () => {
  it('is hidden only where the hover bar already covers everything', () => {
    const block = mediaBlock(shellCss, '(hover: hover) and (pointer: fine)');
    expect(block).toContain('.row-touch-menu');
    expect(block).toMatch(/display\s*:\s*none/);
  });

  it('the inbox row uses the capability-gated class, not a width gate', () => {
    expect(pageTsx).toContain('row-touch-menu');
    // The old `sm:hidden` gate left coarse-pointer devices ≥640px (touch
    // laptops, landscape tablets) with zero row actions.
    expect(pageTsx).not.toMatch(/className="sm:hidden shrink-0"/);
  });
});

describe('keyboard reachability of row quick actions', () => {
  it('the row reveals the action bar on focus as well as on hover', () => {
    expect(pageTsx).toMatch(
      /isHovered \|\| showSnoozeMenu \|\| isRowFocused/,
    );
  });
});
