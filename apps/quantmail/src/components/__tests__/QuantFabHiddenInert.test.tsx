// @vitest-environment jsdom

// Silence React's "not configured to support act" warning in this jsdom
// harness — act() flushes effects synchronously here by design.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// ============================================================================
// QM-A11Y-CHROME-HIDDEN-INERT (2026-10-19) — scroll-hidden FAB must leave the
// tab order, not just the accessibility tree.
//
// Root cause: QuantFab's root div set `aria-hidden={!chromeVisible}` while
// hidden on scroll-down, but the trigger button stayed
// tab-focusable — `pointer-events: none` only kills the pointer path.
// TalkBack/VoiceOver users could land keyboard/focus on an invisible control,
// and focused content inside `aria-hidden` is a spec violation.
//
// The fix adds `inert={!chromeVisible}` to the root, mirroring AppShell's
// drawer (`inert={!isDrawerPresented}`): the whole subtree — the single
// trigger — leaves the tab order AND the accessibility tree while collapsed.
// (The dial rows this comment used to mention were deleted 2026-10-24;
// the contract narrowed to a single action 2026-10-25.)
//
// The ContextBottomNavBar half of the queued finding no longer exists on
// origin/main (no aria-hidden toggle, no scroll-hide wiring there), so this
// suite pins the FAB contract only.
//
// These tests pin:
//   (1) while visible: no `inert` attribute, aria-hidden="false", the trigger
//       is a normal tabbable button;
//   (2) while scroll-hidden: `inert` present, aria-hidden="true" — the trigger
//       is unreachable by Tab;
//   (3) toggling visibility flips the attributes both ways (reveal restores
//       tab order);
//   (4) the source wires `inert` to the same visibility bit as `aria-hidden`
//       (no drift between the two).
//
// Component assertions use the repo's createRoot + act harness with plain DOM
// queries (no @testing-library/react in this app). The scroll-chrome store is
// driven directly instead of synthesizing scroll events.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, vi, afterEach } from 'vitest';

// framer-motion's useReducedMotion probes matchMedia, which jsdom lacks.
// Environment shim only — no behaviour mocked.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Drive the shared scroll-chrome store directly instead of scrolling.
let mockChromeVisible = true;
vi.mock('../useScrollChrome', () => ({
  useChromeVisible: () => mockChromeVisible,
}));

import { QuantFab } from '../QuantFab';

const fabSrc = readFileSync(join(process.cwd(), 'src/components/QuantFab.tsx'), 'utf8');

const ACTION = { id: 'compose', label: 'Compose', onSelect: () => {} };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderEl(el: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(el);
  });
  return container!;
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
  mockChromeVisible = true;
  vi.clearAllMocks();
});

function fabRootEl(c: HTMLElement): HTMLDivElement {
  const el = c.querySelector<HTMLDivElement>('[data-quant-fab]');
  expect(el).not.toBeNull();
  return el!;
}

describe('QuantFab scroll-hidden chrome (QM-A11Y-CHROME-HIDDEN-INERT)', () => {
  it('is tabbable and exposed while the chrome is visible', () => {
    mockChromeVisible = true;
    const c = renderEl(<QuantFab action={ACTION} />);
    const el = fabRootEl(c);
    // No inert attribute at all — React omits inert={false}.
    expect(el.hasAttribute('inert')).toBe(false);
    expect(el.getAttribute('aria-hidden')).toBe('false');
    const trigger = el.querySelector<HTMLButtonElement>('button[aria-label="Compose"]');
    expect(trigger).not.toBeNull();
    // A plain button with no tabindex/-1/disabled is in the tab order.
    expect(trigger!.tabIndex).toBe(0);
  });

  it('goes inert + aria-hidden while scroll-hidden (no focusable invisible controls)', () => {
    mockChromeVisible = false;
    const c = renderEl(<QuantFab action={ACTION} />);
    const el = fabRootEl(c);
    expect(el.hasAttribute('inert')).toBe(true);
    expect(el.getAttribute('aria-hidden')).toBe('true');
    // The trigger still renders (visual slide/fade animation needs it) but
    // inert removes the whole subtree from sequential focus navigation.
    const trigger = el.querySelector<HTMLButtonElement>('button[aria-label="Compose"]');
    expect(trigger).not.toBeNull();
  });

  it('restores tab order when the chrome reappears on scroll-up', () => {
    mockChromeVisible = false;
    const c = renderEl(<QuantFab action={ACTION} />);
    const el = fabRootEl(c);
    expect(el.hasAttribute('inert')).toBe(true);

    mockChromeVisible = true;
    act(() => {
      root!.render(<QuantFab action={ACTION} />);
    });
    expect(el.hasAttribute('inert')).toBe(false);
    expect(el.getAttribute('aria-hidden')).toBe('false');
    const trigger = el.querySelector<HTMLButtonElement>('button[aria-label="Compose"]');
    expect(trigger).not.toBeNull();
    expect(trigger!.tabIndex).toBe(0);
  });

  it('wires inert to the same visibility bit as aria-hidden (source pin, no drift)', () => {
    // The two must never disagree: inert on the same boolean that drives
    // aria-hidden/pointer-events/transform.
    expect(fabSrc).toMatch(/aria-hidden=\{!chromeVisible\}/);
    expect(fabSrc).toMatch(/inert=\{!chromeVisible\}/);
  });
});
