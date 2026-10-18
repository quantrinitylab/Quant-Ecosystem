// @vitest-environment jsdom
// ============================================================================
// Thread quick-reply shortcut guard (fix/qm-thread-quickreply-shortcut-guard).
//
// Before the fix, /thread/[id]'s keyboard shortcuts `f` (forward) and `x`
// (select) called unguarded router.push, while every other thread exit (edge
// swipe, back button via onClose, Esc, swipe-to-next-thread) went through
// the ThreadLeaveGuard confirm. Typing a quick reply then hitting `f` or `x`
// vaporised the typed-but-unsent text with no confirm — the same silent-loss
// class as the edge-swipe/back-button defect fixed by the leave guard
// (fix/qm-thread-quickreply-discard guards leaveThread + onNavigateToThread
// only).
//
// The fix routes onForward and onSelect through the page's existing
// guardedNavigate/leaveGuardRef confirm flow.
//
// These tests render the REAL thread page with the REAL keyboard engine and
// the REAL branded discard dialog: press a key, assert the confirm appears
// when quick-reply text is present and navigation is held; answer the
// dialog and assert navigation proceeds (Discard) or is cancelled
// (Keep editing). No @testing-library/react (not a quantmail dependency).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { keyboardEngine } from '../lib/keyboard/engine';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// jsdom does not implement matchMedia; framer-motion's useReducedMotion (used
// by ConfirmDialog) probes it. Environment shim only — no behaviour mocked.
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
  })) as typeof window.matchMedia;
}

const THREAD_ID = 'thread-1';

/** Typed-but-unsent quick-reply text the stubbed thread view holds. */
const guardState = vi.hoisted(() => ({ text: '' }));

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: nav.back }),
  useParams: () => ({ id: THREAD_ID }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('../hooks/useMailMutations', () => ({
  useMailMutations: () => ({
    archive: vi.fn(),
    unarchive: vi.fn(),
    trash: vi.fn(),
    markUnread: vi.fn(),
    toggleStar: vi.fn(),
  }),
}));

vi.mock('../hooks/useEdgeSwipeBack', () => ({
  useEdgeSwipeBack: () => {},
}));

vi.mock('../components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/AppSidebar', () => ({
  AppSidebar: () => null,
}));

/*
 * Stub for the heavy thread view: wires the REAL useThreadLeaveGuard (and its
 * real branded dialog) against the quick-reply text, filling the PAGE's own
 * leaveGuardRef — exactly what the real ConversationalThreadView does — so
 * the test proves the page's guardedNavigate consults the guard on `f`/`x`.
 */
vi.mock('../components/ConversationalThreadView', async () => {
  const React = await import('react');
  const { useThreadLeaveGuard } = await import('../hooks/useThreadLeaveGuard');
  return {
    ConversationalThreadView: ({
      leaveGuardRef,
    }: {
      leaveGuardRef: { current: unknown };
    }) => {
      const [text] = React.useState(() => guardState.text);
      const { dialog } = useThreadLeaveGuard(
        text,
        () => {},
        leaveGuardRef as React.RefObject<import('../hooks/useThreadLeaveGuard').ThreadLeaveGuard | null>,
      );
      return <>{dialog}</>;
    },
  };
});

// The page is the default export of a route file; the static import below
// resolves after the hoisted vi.mock calls.
import ThreadPage from '../app/thread/[id]/page';

/** Minimal KeyboardEvent stand-in with a working preventDefault. */
function fakeKeydown(key: string) {
  return {
    key,
    code: `Key${key.toUpperCase()}`,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 27,
    defaultPrevented: false,
    target: null,
    preventDefault() {
      (this as { defaultPrevented: boolean }).defaultPrevented = true;
    },
    stopPropagation() {},
  };
}

function press(key: string) {
  const event = fakeKeydown(key);
  (keyboardEngine as unknown as { handleKeyDown(e: unknown): void }).handleKeyDown(event);
}

/** Let pending promises and framer-motion animations settle. */
async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

function dialogButton(selector: string): HTMLButtonElement {
  const btn = document.querySelector<HTMLButtonElement>(selector);
  if (!btn) throw new Error(`${selector} not found`);
  return btn;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function renderPage(): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<ThreadPage />);
  });
}

beforeEach(() => {
  nav.push.mockClear();
  nav.replace.mockClear();
  nav.back.mockClear();
  guardState.text = '';
});

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
  document.body.innerHTML = '';
});

describe('/thread/[id] keyboard shortcut leave guard', () => {
  it('`f` with unsent quick-reply text shows the discard confirm and holds navigation', async () => {
    guardState.text = 'typing a reply…';
    renderPage();
    press('f');
    await flush();

    expect(document.querySelector('.confirm-title')?.textContent).toBe('Discard draft?');
    expect(document.querySelector('.confirm-message')?.textContent).toBe(
      "This message hasn't been saved. Discard it?",
    );
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('Discard on the `f` confirm proceeds to the forward compose target', async () => {
    guardState.text = 'typing a reply…';
    renderPage();
    press('f');
    await flush();

    await click(dialogButton('.confirm-confirm'));
    await flush();

    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledWith(`/compose?forward=${THREAD_ID}`);
  });

  it('Keep editing on the `f` confirm cancels navigation and keeps the draft', async () => {
    guardState.text = 'typing a reply…';
    renderPage();
    press('f');
    await flush();

    await click(dialogButton('.confirm-cancel'));
    await flush();

    expect(nav.push).not.toHaveBeenCalled();
    await flush(300);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('`x` with unsent quick-reply text shows the discard confirm and holds navigation', async () => {
    guardState.text = 'typing a reply…';
    renderPage();
    press('x');
    await flush();

    expect(document.querySelector('.confirm-title')?.textContent).toBe('Discard draft?');
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('Discard on the `x` confirm proceeds to the inbox select target', async () => {
    guardState.text = 'typing a reply…';
    renderPage();
    press('x');
    await flush();

    await click(dialogButton('.confirm-confirm'));
    await flush();

    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledWith(`/?view=inbox&selected=${THREAD_ID}`);
  });

  it('`f` with an empty reply bar navigates immediately with no confirm', async () => {
    guardState.text = '';
    renderPage();
    press('f');
    await flush();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(nav.push).toHaveBeenCalledWith(`/compose?forward=${THREAD_ID}`);
  });

  it('`x` with an empty reply bar navigates immediately with no confirm', async () => {
    guardState.text = '';
    renderPage();
    press('x');
    await flush();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(nav.push).toHaveBeenCalledWith(`/?view=inbox&selected=${THREAD_ID}`);
  });
});
