// @vitest-environment jsdom
// ============================================================================
// AppShell CSS contract — P0-1 regression guard (2026-10-06)
//
// The off-canvas `.quant-shell-*` rules lived only in QuantMail's
// `globals.css`, so every other AppShell consumer (QuantAI, QuantChat,
// QuantAds) rendered the nav panel as a plain in-flow flex child: at 390px
// the sidebar + main pane crushed side-by-side and the app was unreadable.
//
// The rules now ship WITH the component in
// `packages/shared-ui/src/components/Layout/quant-shell.css`, and every
// consuming app's root layout imports it once. These tests pin that contract:
//   1. the CSS file exists next to AppShell.tsx,
//   2. it contains the off-canvas rules that make the panel an overlay
//      (position:fixed + translate3d(-102%) when closed, translate3d(0) open),
//   3. every `quant-shell-*` class AppShell.tsx renders has a matching
//      selector in the CSS (drift guard),
//   4. the hamburger toggle actually flips the panel's `is-open` class.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppShell } from '../AppShell';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, '..', 'quant-shell.css');
const tsxPath = join(here, '..', 'AppShell.tsx');

function readCss(): string {
  return readFileSync(cssPath, 'utf8');
}

/** Extract the declaration block for a selector (first match). */
function ruleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*{([^}]*)}`, 's'));
  return match ? match[1]! : null;
}

describe('quant-shell.css ships with AppShell', () => {
  it('exists next to AppShell.tsx', () => {
    expect(existsSync(cssPath)).toBe(true);
  });

  it('renders the nav panel as an off-canvas overlay, not an in-flow child', () => {
    const css = readCss();
    const panel = ruleBody(css, '.quant-shell-panel');
    expect(panel, '.quant-shell-panel rule must exist').not.toBeNull();
    // The exact regression: without `position: fixed` the panel is a plain
    // in-flow flex child and mobile two-pane squeeze returns.
    expect(panel).toMatch(/position:\s*fixed/);
    // Hidden off-canvas by default…
    expect(panel).toMatch(/translate3d\(-102%/);
  });

  it('slides the panel in when .is-open is set', () => {
    const css = readCss();
    const open = ruleBody(css, '.quant-shell-panel.is-open');
    expect(open, '.quant-shell-panel.is-open rule must exist').not.toBeNull();
    expect(open).toMatch(/translate3d\(0,\s*0,\s*0\)/);
  });

  it('styles the overlay scrim and the hamburger trigger', () => {
    const css = readCss();
    expect(ruleBody(css, '.quant-shell-overlay')).not.toBeNull();
    expect(ruleBody(css, '.quant-shell-overlay')).toMatch(/position:\s*fixed/);
    expect(ruleBody(css, '.quant-shell-trigger')).not.toBeNull();
  });

  it('keeps the mobile fullscreen padding rule', () => {
    const css = readCss();
    expect(css).toMatch(/@media\s*\(max-width:\s*768px\)/);
    expect(css).toMatch(/\[data-shell-fullscreen='true'\]/);
  });

  it('defines every class the off-canvas behaviour depends on (drift guard)', () => {
    // The off-canvas contract: these classes MUST be both rendered by
    // AppShell.tsx and styled by quant-shell.css. (quant-shell-header /
    // quant-shell-header-slot / quant-shell-close are intentionally unstyled
    // semantic hooks — their layout comes from Tailwind classes — so they
    // are excluded from the styled contract.)
    const required = [
      'quant-shell-panel',
      'quant-shell-overlay',
      'quant-shell-trigger',
      'quant-shell-pin',
      'quant-shell-unpin',
    ];
    const css = readCss();
    const tsx = readFileSync(tsxPath, 'utf8');
    for (const cls of required) {
      expect(tsx, `AppShell.tsx must render .${cls}`).toContain(cls);
      expect(
        css,
        `quant-shell.css must style .${cls} (P0-1: missing rule = mobile two-pane squeeze)`,
      ).toMatch(new RegExp(`\\.${cls}(?![\\w-])`));
    }
  });
});

describe('AppShell overlay behaviour', () => {
  it('toggles .is-open on the panel when the hamburger is clicked', () => {
    render(
      <AppShell sidebar={<nav>Nav</nav>} topBar={<div>Top</div>}>
        <div>Content</div>
      </AppShell>,
    );
    const panel = document.querySelector('.quant-shell-panel');
    expect(panel).not.toBeNull();
    expect(panel!.classList.contains('is-open')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Show navigation' }));
    expect(panel!.classList.contains('is-open')).toBe(true);

    // Escape closes it again.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(panel!.classList.contains('is-open')).toBe(false);
  });
});
