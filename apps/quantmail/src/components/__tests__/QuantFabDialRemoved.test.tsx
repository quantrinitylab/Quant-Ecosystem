// @vitest-environment jsdom

// Silence React's "not configured to support act" warning in this jsdom
// harness — act() flushes effects synchronously here by design.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// ============================================================================
// QuantFab dial removal (2026-10-24) — the finding this suite pins.
//
// Root cause: `QuantFab` carried a full multi-action dial branch (`role="menu"`
// rows, arrow-key nav, Escape/outside-press close, focus restore) that dial
// mode gated on `actions.length > 1` — but `AppShell`'s fab table returns at
// most one action on every route (empty on /calendar, /compose, /thread,
// /quantgit and settings; exactly one elsewhere), and no other `QuantFab`
// mount exists. The dial shipped unexercised, kept alive by a stale AppShell
// comment claiming `/calendar` mounted its own four-entry `QuantFab`.
//
// The fix deletes the dial branch (plus the dial-only `icon`/`tone` action
// fields) and corrects both stale AppShell comments. `QuantFab` is now a
// single-action direct-tap button; a future multi-action caller must bring
// the dial back WITH a test that renders it open.
//
// These tests pin:
//   (1) a single action fires on tap (the only behaviour that ever shipped);
//   (2) even when handed two actions, NO dial markup renders (no menu role,
//       no menuitem rows, no aria-haspopup) and the tap fires the first
//       action only — extra actions are never silently presented as a dial;
//   (3) empty actions render nothing (the route opt-out, unchanged);
//   (4) source pins: no dial machinery left in QuantFab.tsx, and AppShell no
//       longer claims `/calendar` mounts its own QuantFab.
//
// Component assertions use the repo's createRoot + act harness with plain DOM
// queries (no @testing-library/react in this app).
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, vi, afterEach } from 'vitest';

// framer-motion is gone from QuantFab, but keep the matchMedia shim harmless:
// useReducedMotion is no longer imported, jsdom still lacks matchMedia for
// other providers in the tree.
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
const shellSrc = readFileSync(join(process.cwd(), 'src/components/AppShell.tsx'), 'utf8');

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

function tap(button: HTMLButtonElement) {
  act(() => {
    button.click();
  });
}

describe('QuantFab dial removal (2026-10-24)', () => {
  it('fires the single action on tap', () => {
    const onSelect = vi.fn();
    const c = renderEl(<QuantFab actions={[{ id: 'compose', label: 'Compose email', onSelect }]} />);
    const trigger = c.querySelector<HTMLButtonElement>('button[aria-label="Compose email"]');
    expect(trigger).not.toBeNull();
    tap(trigger!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    // No dial affordances on a direct-tap button.
    expect(trigger!.getAttribute('aria-haspopup')).toBeNull();
    expect(trigger!.getAttribute('aria-expanded')).toBeNull();
  });

  it('renders NO dial markup even when handed two actions', () => {
    const first = vi.fn();
    const second = vi.fn();
    const c = renderEl(
      <QuantFab
        actions={[
          { id: 'a', label: 'First', onSelect: first },
          { id: 'b', label: 'Second', onSelect: second },
        ]}
      />,
    );
    expect(c.querySelector('[role="menu"]')).toBeNull();
    expect(c.querySelector('[role="menuitem"]')).toBeNull();
    expect(c.querySelector('[data-fab-action]')).toBeNull();
    expect(c.querySelectorAll('button').length).toBe(1);
    const trigger = c.querySelector<HTMLButtonElement>('button');
    expect(trigger!.getAttribute('aria-label')).toBe('First');
    tap(trigger!);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('renders nothing for empty actions (route opt-out)', () => {
    const c = renderEl(<QuantFab actions={[]} />);
    expect(c.querySelector('[data-quant-fab]')).toBeNull();
    expect(c.querySelector('button')).toBeNull();
  });

  it('carries no dial machinery in source', () => {
    expect(fabSrc).not.toMatch(/isDial/);
    expect(fabSrc).not.toMatch(/role="menu"/);
    expect(fabSrc).not.toMatch(/role="menuitem"/);
    expect(fabSrc).not.toMatch(/data-fab-action/);
    expect(fabSrc).not.toMatch(/AnimatePresence|motion\.div/);
    expect(fabSrc).not.toMatch(/ArrowUp|ArrowDown/);
    expect(fabSrc).not.toMatch(/FabTone|ROW_CLASS/);
  });

  it('AppShell no longer claims /calendar mounts its own QuantFab', () => {
    expect(shellSrc).not.toMatch(/mounts its own `QuantFab`/);
    expect(shellSrc).not.toMatch(/the copy `\/calendar` mounts/);
  });
});
