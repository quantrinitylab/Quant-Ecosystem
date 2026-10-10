// @vitest-environment jsdom
// ===========================================================================
// QM-QUANTY-012 — Quanty command bar recent commands are SESSION-ONLY.
//
// The command bar used to persist the last 5 typed commands to localStorage
// under `quanty-recent-commands` and restore them on the next visit: a
// durable plaintext copy of free-typed instructions to an AI agent — text that
// can carry anything the user asked Quanty to do — outside every retention,
// export and deletion control the product offers.
//
// The classification is now explicit (mirroring QM-QUANTY-005): recent
// commands live in component state for this page session only, and nowhere
// else; the legacy key is purged on mount and never read. These tests render
// the REAL command bar and drive the REAL controls, asserting only observable
// behaviour:
//   (a) typing/executing commands writes NOTHING to localStorage;
//   (b) a pre-seeded legacy command list is purged on mount and never
//       restored into the UI;
//   (c) the in-session recent list (add / dedupe / pick) works entirely from
//       memory;
//   (d) a fresh mount — the reload case — starts with no recent commands.
// (a) and (b) fail against the pre-fix command bar: it wrote the key on every
// submit and restored the seeded list into the recent menu on mount.
// ===========================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QuantyCommandBar } from '../components/QuantyLiveAgent/QuantyCommandBar';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// framer-motion reads matchMedia (reduced motion), which jsdom does not
// implement. Test-environment shim only; product behaviour is untouched.
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

const LEGACY_KEY = 'quanty-recent-commands';

// ---------------------------------------------------------------------------
// The submit handler is created ONCE (vi.hoisted / module scope) so the
// component receives a stable identity across renders — a mock that returns a
// fresh function identity per render can spin a component into a render loop
// (the PR #773 CI OOM lesson).
// ---------------------------------------------------------------------------

const onSubmitMock = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Harness (the repo's createRoot + act pattern, cf. the QM-QUANTY-005 suite)
// ---------------------------------------------------------------------------

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function renderBar(): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<QuantyCommandBar onSubmit={onSubmitMock} />);
  });
  return host;
}

function unmountBar() {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
}

afterEach(() => {
  unmountBar();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function commandInput(container: ParentNode): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Quanty ko command dein"]');
  expect(input, 'command input renders').not.toBeNull();
  return input!;
}

function typeCommand(container: ParentNode, value: string) {
  const input = commandInput(container);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function submitCommand(container: ParentNode, value: string) {
  typeCommand(container, value);
  const send = container.querySelector<HTMLButtonElement>('button[aria-label="Command bhejein"]');
  expect(send, 'send button renders').not.toBeNull();
  expect(send!.disabled, 'send button enables once a command is typed').toBe(false);
  act(() => {
    send!.click();
  });
  expect(commandInput(container).value, 'input clears after submit').toBe('');
}

function recentToggle(container: ParentNode): HTMLButtonElement {
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Recent commands dekhein"], button[aria-label="Recent commands band karein"]',
  );
  expect(toggle, 'recent commands toggle renders').not.toBeNull();
  return toggle!;
}

function openRecentList(container: ParentNode) {
  const toggle = recentToggle(container);
  expect(toggle.disabled, 'recent toggle enables once the session list has entries').toBe(false);
  act(() => {
    toggle.click();
  });
}

/** Texts of the entries in the currently open recent list (last one wins —
 * AnimatePresence keeps a closing list mounted until its exit finishes). */
function recentEntries(container: ParentNode): string[] {
  const lists = container.querySelectorAll('ul[aria-label="Recent commands"]');
  const current = lists[lists.length - 1];
  if (!current) return [];
  return Array.from(current.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
}

describe('QM-QUANTY-012 — session-only Quanty recent commands', () => {
  it('(a) typing and executing commands writes nothing to localStorage', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const container = renderBar();

    submitCommand(container, 'mere unread emails archive kar do');
    submitCommand(container, 'kal ki meeting ki summary banao');

    expect(onSubmitMock).toHaveBeenCalledTimes(2);
    expect(onSubmitMock).toHaveBeenNthCalledWith(1, 'mere unread emails archive kar do');
    expect(onSubmitMock).toHaveBeenNthCalledWith(2, 'kal ki meeting ki summary banao');

    // Nothing was written — not even transiently — and nothing is stored.
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('(b) a pre-seeded legacy command list is purged on mount and never restored', () => {
    window.localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify(['gupt purani command ek', 'gupt purani command do']),
    );

    const container = renderBar();

    // Purged, not read.
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();

    // Nothing seeded reaches the UI: the session list is empty, so the recent
    // toggle stays disabled and no seeded text renders anywhere.
    expect(recentToggle(container).disabled).toBe(true);
    expect(container.textContent).not.toContain('gupt purani command ek');
    expect(container.textContent).not.toContain('gupt purani command do');
    expect(recentEntries(container)).toEqual([]);
  });

  it('(c) the in-session recent list adds, dedupes and picks — from memory only', () => {
    const container = renderBar();

    submitCommand(container, 'pehla session command');
    submitCommand(container, 'dusra session command');
    // Re-submitting an existing command moves it to the front (dedupe).
    submitCommand(container, 'pehla session command');

    openRecentList(container);
    expect(recentEntries(container)).toEqual(['pehla session command', 'dusra session command']);

    // Picking an entry loads it back into the input.
    const lists = container.querySelectorAll('ul[aria-label="Recent commands"]');
    const current = lists[lists.length - 1];
    const entry = Array.from(current.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'dusra session command',
    );
    expect(entry, 'session entry renders').toBeDefined();
    act(() => {
      entry!.click();
    });
    expect(commandInput(container).value).toBe('dusra session command');

    // All of it happened without touching storage.
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('(d) a fresh mount starts with no recent commands (reload semantics)', () => {
    const first = renderBar();
    submitCommand(first, 'session command ek');
    openRecentList(first);
    expect(recentEntries(first)).toEqual(['session command ek']);
    unmountBar();

    const second = renderBar();
    expect(recentToggle(second).disabled).toBe(true);
    expect(second.textContent).not.toContain('session command ek');
    expect(recentEntries(second)).toEqual([]);
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });
});
