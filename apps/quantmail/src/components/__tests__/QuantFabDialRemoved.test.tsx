// @vitest-environment jsdom

// Silence React's "not configured to support act" warning in this jsdom
// harness — act() flushes effects synchronously here by design.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// ============================================================================
// QuantFab dial removal (2026-10-24) + narrowed contract (2026-10-25).
//
// Root cause, part 1 (2026-10-24): `QuantFab` carried a full multi-action
// dial branch (`role="menu"` rows, arrow-key nav, Escape/outside-press
// close, focus restore) that dial mode gated on more than one action —
// but `AppShell`'s fab table returns at most one action on every route
// (null on /calendar, /compose, /thread, /quantgit and settings; exactly
// one elsewhere), and no other `QuantFab` mount exists. The dial shipped
// unexercised, kept alive by a stale AppShell comment claiming `/calendar`
// mounted its own four-entry `QuantFab`. The branch was deleted, plus the
// dial-only `icon`/`tone` action fields, and both stale AppShell comments
// were corrected.
//
// Root cause, part 2 (2026-10-25) — the hole the deletion left: the prop
// stayed `actions: FabAction[]`, so a caller could still hand the button
// two actions while it fired only the first. The 2026-10-24 suite even
// PINNED that silent drop ("renders NO dial markup even when handed two
// actions ... tap fires the first action only") as if it were intended.
// That test was the stale artifact and is removed here: a single button
// must not accept a list it cannot honour. The contract is now narrowed
// to `action: FabAction | null` — more than one action is
// unrepresentable, not merely unrendered — and a stale `actions` array
// (or an array passed as `action` through plain JS) throws loudly instead
// of rendering a button that ignores everything past the first action.
//
// These tests pin:
//   (1) a single action fires on tap, with exactly one button and no dial
//       affordances (the only behaviour that ever shipped);
//   (2) null renders nothing (the route opt-out, unchanged in spirit);
//   (3) the legacy `actions` array prop throws loudly (no silent drop);
//   (4) an array passed as `action` throws loudly;
//   (5) source pins: no dial machinery, no array prop, no `actions[0]`,
//       and the narrowed `action: FabAction | null` type with no
//       dial-only fields on `FabAction`;
//   (6) AppShell passes a single action and no longer claims `/calendar`
//       mounts its own QuantFab.
//
// NEGATIVE CONTROL: tests (3), (5) and (6) fail on the pre-fix
// (ff300cba2) code — there the `actions` array renders a button instead
// of throwing, `actions: FabAction[]` / `actions[0]` are present in
// QuantFab.tsx, and AppShell still builds `fabActions`.
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

describe('QuantFab dial removal + narrowed single-action contract', () => {
  it('fires the single action on tap, with no dial affordances', () => {
    const onSelect = vi.fn();
    const c = renderEl(<QuantFab action={{ id: 'compose', label: 'Compose email', onSelect }} />);
    const trigger = c.querySelector<HTMLButtonElement>('button[aria-label="Compose email"]');
    expect(trigger).not.toBeNull();
    expect(c.querySelectorAll('button').length).toBe(1);
    expect(c.querySelector('[role="menu"]')).toBeNull();
    expect(c.querySelector('[role="menuitem"]')).toBeNull();
    expect(c.querySelector('[data-fab-action]')).toBeNull();
    tap(trigger!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    // No dial affordances on a direct-tap button.
    expect(trigger!.getAttribute('aria-haspopup')).toBeNull();
    expect(trigger!.getAttribute('aria-expanded')).toBeNull();
  });

  it('renders nothing for null action (route opt-out)', () => {
    const c = renderEl(<QuantFab action={null} />);
    expect(c.querySelector('[data-quant-fab]')).toBeNull();
    expect(c.querySelector('button')).toBeNull();
  });

  it('throws loudly for the legacy actions array prop instead of dropping all but the first', () => {
    const first = vi.fn();
    const second = vi.fn();
    expect(() =>
      renderEl(
        // @ts-expect-error — legacy shape, deliberately rejected at runtime too.
        <QuantFab
          actions={[
            { id: 'a', label: 'First', onSelect: first },
            { id: 'b', label: 'Second', onSelect: second },
          ]}
        />,
      ),
    ).toThrow(/single `action`/);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('throws loudly for an array passed as action through plain JS', () => {
    expect(() =>
      renderEl(
        // @ts-expect-error — array is not a single action, even untyped.
        <QuantFab action={[{ id: 'a', label: 'First', onSelect: () => {} }]} />,
      ),
    ).toThrow(/single `action`/);
  });

  it('carries no dial machinery and no array prop in source', () => {
    expect(fabSrc).not.toMatch(/isDial/);
    expect(fabSrc).not.toMatch(/role="menu"/);
    expect(fabSrc).not.toMatch(/role="menuitem"/);
    expect(fabSrc).not.toMatch(/data-fab-action/);
    expect(fabSrc).not.toMatch(/AnimatePresence|motion\.div/);
    expect(fabSrc).not.toMatch(/ArrowUp|ArrowDown/);
    expect(fabSrc).not.toMatch(/FabTone|ROW_CLASS/);
    // The narrowed contract itself.
    expect(fabSrc).toMatch(/action: FabAction \| null/);
    expect(fabSrc).not.toMatch(/actions: FabAction\[\]/);
    expect(fabSrc).not.toMatch(/actions\[0\]/);
    expect(fabSrc).not.toMatch(/actions\.length/);
    // FabAction carries no dial-only fields (checked as field declarations,
    // not prose: the history comment above legitimately names icon/tone).
    expect(fabSrc).not.toMatch(/^\s*(icon|tone)\??:/m);
  });

  it('AppShell passes a single action and no longer claims /calendar mounts its own QuantFab', () => {
    expect(shellSrc).not.toMatch(/mounts its own `QuantFab`/);
    expect(shellSrc).not.toMatch(/the copy `\/calendar` mounts/);
    expect(shellSrc).toMatch(/fabAction: FabAction \| null/);
    expect(shellSrc).not.toMatch(/fabActions/);
    expect(shellSrc).toMatch(/<QuantFab action=\{fabAction\} \/>/);
  });
});
