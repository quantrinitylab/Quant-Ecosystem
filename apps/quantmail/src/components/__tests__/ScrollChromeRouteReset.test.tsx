// @vitest-environment jsdom

// Silence React's "not configured to support act" warning in this jsdom
// harness — act() flushes effects synchronously here by design.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// ===========================================================================
// fix/qm-scroll-chrome-route-reset — scroll-hidden chrome must not leak
// across route changes.
//
// Root cause: useScrollChrome.ts keeps `chromeVisible` (and `lastY`) at
// module level, and nothing reset them on navigation — AppShell mounts once
// for the whole suite. Scroll down on the inbox (FAB hidden), switch pillars
// to /drive, and the fresh pillar painted with its FAB hidden until some
// scroll event re-evaluated; a page whose container never scrolls never
// fired one, so the FAB stayed hidden.
//
// The fix: `resetChromeVisible()` restores the fresh-load state (visible,
// lastY 0), called from AppShell on every pathname change.
//
// These tests pin, against the REAL store (no mock — the leak only exists
// in the shared module state):
//   (1) a scroll-down hides the chrome, and resetChromeVisible() reveals
//       it again (the route-change path);
//   (2) reset also zeroes the scroll baseline: the new page's first scroll
//       event is differenced against 0, not the old page's depth — so a
//       jump to 50px on the fresh page hides (fresh-load semantics), rather
//       than revealing because 50 < old lastY;
//   (3) reset while already visible is a silent no-op (no spurious emit,
//       no crash, chrome stays visible);
//   (4) AppShell wires the reset to pathname changes (source pin — rendering
//       the full shell in this harness is out of scope; the store behavior
//       above is what the wiring protects).
//
// Component assertions use the repo's createRoot + act harness with plain
// DOM queries (no @testing-library/react in this app). Scroll events are
// real: the store listens on window in the capture phase, so dispatching a
// scroll on an attached div with a set scrollTop drives it exactly like a
// nested scroll container does in production.
// ===========================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, afterEach } from 'vitest';

import { useChromeVisible, resetChromeVisible } from '../useScrollChrome';

const appShellSrc = readFileSync(join(process.cwd(), 'src/components/AppShell.tsx'), 'utf8');

function ChromeProbe() {
  const visible = useChromeVisible();
  return <span data-testid="chrome-probe">{visible ? 'visible' : 'hidden'}</span>;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let scroller: HTMLDivElement | null = null;

function renderProbe() {
  container = document.createElement('div');
  document.body.appendChild(container);
  // The scroll source: an attached element whose scrollTop the store reads
  // (capture-phase window listener sees the event with this as its target).
  scroller = document.createElement('div');
  document.body.appendChild(scroller);
  act(() => {
    root = createRoot(container!);
    root.render(<ChromeProbe />);
  });
  return container!;
}

function probeText(c: HTMLElement): string {
  const el = c.querySelector('[data-testid="chrome-probe"]');
  expect(el).not.toBeNull();
  return el!.textContent ?? '';
}

/** Drive the store exactly like a nested scroll container scrolling. */
function scrollTo(y: number) {
  scroller!.scrollTop = y;
  act(() => {
    scroller!.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
}

afterEach(() => {
  // Unmount BEFORE resetting: reset emits to subscribers, and emitting while
  // the probe is still mounted would update it outside act().
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  scroller?.remove();
  container = null;
  scroller = null;
  // Leave the shared module store in its fresh-load state for the next test.
  resetChromeVisible();
});

describe('scroll chrome route reset (fix/qm-scroll-chrome-route-reset)', () => {
  it('starts visible, hides on scroll-down, and reset reveals it again', () => {
    const c = renderProbe();
    expect(probeText(c)).toBe('visible');

    // One deliberate scroll-down past the 40px top zone hides the chrome.
    scrollTo(200);
    expect(probeText(c)).toBe('hidden');

    // The route-change reset: fresh pillar must paint with chrome visible,
    // without waiting for any scroll event on the new page.
    act(() => {
      resetChromeVisible();
    });
    expect(probeText(c)).toBe('visible');
  });

  it('resets the scroll baseline too, so the new page re-evaluates from 0', () => {
    const c = renderProbe();
    scrollTo(400);
    expect(probeText(c)).toBe('hidden');

    act(() => {
      resetChromeVisible();
    });
    expect(probeText(c)).toBe('visible');

    // Fresh-load semantics: first scroll on the new page starts from 0, so
    // a jump to 50px is a scroll-DOWN (diff +50 > 12) and hides again. If
    // lastY still held the old page's 400, this same event would read as a
    // scroll-UP (diff -350) and wrongly keep the chrome visible.
    scrollTo(50);
    expect(probeText(c)).toBe('hidden');
  });

  it('reset while already visible is a silent no-op', () => {
    const c = renderProbe();
    expect(probeText(c)).toBe('visible');
    act(() => {
      resetChromeVisible();
    });
    expect(probeText(c)).toBe('visible');
    // And the store still tracks scroll normally afterwards.
    scrollTo(200);
    expect(probeText(c)).toBe('hidden');
  });

  it('AppShell calls the reset on pathname change (source pin)', () => {
    expect(appShellSrc).toMatch(/import \{ resetChromeVisible \} from '\.\/useScrollChrome'/);
    expect(appShellSrc).toMatch(/resetChromeVisible\(\);/);
    // The reset must ride the same pathname dependency as the search-row
    // close — route changes only, not every render or search-param tweak.
    expect(appShellSrc).toMatch(/useEffect\(\(\) => \{\s*resetChromeVisible\(\);\s*\}, \[pathname\]\)/);
  });
});
