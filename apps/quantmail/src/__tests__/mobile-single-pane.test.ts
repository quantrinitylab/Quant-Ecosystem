// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { MOBILE_BREAKPOINT_PX } from '../hooks/useIsMobile';

/**
 * CSS contract tests for the mobile single-pane inbox.
 *
 * The P0 mobile bug: at ~384px the inbox rendered the desktop two-pane
 * layout squeezed — list crushed, ~70% wasted on the empty preview pane.
 * These tests pin the breakpoint rules that guarantee a true single pane
 * on phones, and pin the JS/CSS breakpoint sync so taps navigate to the
 * full-screen thread route exactly when the reading pane is hidden.
 */
const cssDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const shellCss = readFileSync(join(cssDir, 'shell.css'), 'utf8');

describe('mobile single-pane CSS contract', () => {
  const mobileBlock = (() => {
    const start = shellCss.indexOf('@media (max-width: 899px)');
    expect(start).toBeGreaterThan(-1);
    // The first mobile block runs until the next top-level comment/section.
    return shellCss.slice(start, start + 4000);
  })();

  it('hides the reading pane below the breakpoint', () => {
    expect(mobileBlock).toMatch(/\.reading-pane\s*\{\s*display:\s*none/);
  });

  it('gives the conversation list full width below the breakpoint', () => {
    expect(mobileBlock).toMatch(/\.inbox-list-pane\s*\{[^}]*width:\s*100%/);
  });

  it('stacks the workspace vertically below the breakpoint', () => {
    expect(mobileBlock).toMatch(/\.inbox-workspace\s*\{[^}]*flex-direction:\s*column/);
  });

  it('slide-in animation is defined for the thread view', () => {
    expect(shellCss).toMatch(/@keyframes\s+quantmail-thread-slide-in/);
    expect(mobileBlock).toMatch(/\.thread-workspace\s*\{[^}]*animation:\s*quantmail-thread-slide-in/);
  });

  it('respects prefers-reduced-motion for the slide-in', () => {
    expect(shellCss).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*?\.thread-workspace\s*\{\s*animation:\s*none/);
  });

  it('small-phone row rules exist (<480px)', () => {
    expect(shellCss).toMatch(/@media\s*\(max-width:\s*479px\)[\s\S]*?\.mail-row\s*\{/);
  });

  it('JS breakpoint matches the CSS media query (899px = 900 - 1)', () => {
    // CSS: max-width: 899px  ⟺  JS: (max-width: ${MOBILE_BREAKPOINT_PX - 1}px)
    expect(shellCss).toContain('@media (max-width: 899px)');
    expect(MOBILE_BREAKPOINT_PX - 1).toBe(899);
  });

  it('documents the sync requirement in shell.css', () => {
    expect(shellCss).toMatch(/MOBILE_BREAKPOINT_PX/);
  });
});
