// @vitest-environment jsdom
// ============================================================================
// Thread quick-reply leave guard (fix/qm-thread-quickreply-discard).
//
// Before the fix, /thread's leave paths — the left-edge swipe, the header
// back button (via onClose), Esc, and swipe-to-next-thread — all funnelled
// into an unguarded leaveThread(false) while quickReplyText was
// component-only state with zero persistence: typing a reply then swiping
// from the screen edge vaporised the text with no confirm and nothing in
// Drafts.
//
// The fix mirrors /compose's discard guard (L773/qm-compose-edge-swipe-
// discard): the thread page consults the view's ThreadLeaveGuard before any
// navigation away, and the branded confirm asks first when the bar holds
// typed-but-unsent text. The copy is /compose's verbatim discard wording
// (EmailComposer.handleDiscardDraft) — no new copy, no new design language.
//
// These tests drive the REAL hook and the REAL branded dialog, asserting
// only observable behaviour: the promise outcome, and the dialog's title,
// message and button labels.
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import type { RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useThreadLeaveGuard, type ThreadLeaveGuard } from '../hooks/useThreadLeaveGuard';

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

const mounted: Root[] = [];

function renderGuard(initialText: string): {
  guardRef: RefObject<ThreadLeaveGuard | null>;
  root: Root;
  getText: () => string;
} {
  const guardRef: RefObject<ThreadLeaveGuard | null> = { current: null };
  let currentText = initialText;
  function Harness() {
    const [text, setText] = React.useState(initialText);
    currentText = text;
    const { dialog } = useThreadLeaveGuard(text, setText, guardRef);
    return <>{dialog}</>;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Harness />);
  });
  mounted.push(root);
  return { guardRef, root, getText: () => currentText };
}

afterEach(() => {
  while (mounted.length > 0) {
    const root = mounted.pop()!;
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = '';
});

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

function dialogTitle(): string | null {
  return document.querySelector('.confirm-title')?.textContent ?? null;
}

function dialogMessage(): string | null {
  return document.querySelector('.confirm-message')?.textContent ?? null;
}

function dialogButton(selector: string): HTMLButtonElement {
  const btn = document.querySelector<HTMLButtonElement>(selector);
  if (!btn) throw new Error(`${selector} not found`);
  return btn;
}

describe('useThreadLeaveGuard', () => {
  it('resolves true with no dialog when the reply bar is empty', async () => {
    const { guardRef } = renderGuard('');
    expect(guardRef.current).not.toBeNull();
    await expect(guardRef.current!.confirmLeaveIfNeeded()).resolves.toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('resolves true with no dialog for whitespace-only text', async () => {
    const { guardRef } = renderGuard('   \n  ');
    await expect(guardRef.current!.confirmLeaveIfNeeded()).resolves.toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows the verbatim /compose discard copy when text is present', async () => {
    const { guardRef } = renderGuard('typing a reply…');
    // Start the guard but do not await: the dialog must be answerable first.
    // Wrapped in act so confirm()'s open state lands cleanly.
    let pending!: Promise<boolean>;
    act(() => {
      pending = guardRef.current!.confirmLeaveIfNeeded();
    });
    await flush();
    expect(dialogTitle()).toBe('Discard draft?');
    expect(dialogMessage()).toBe("This message hasn't been saved. Discard it?");
    expect(dialogButton('.confirm-confirm').textContent).toBe('Discard');
    expect(dialogButton('.confirm-cancel').textContent).toBe('Keep editing');
    // Answer Discard so the pending promise settles and the run stays clean.
    await click(dialogButton('.confirm-confirm'));
    await expect(pending).resolves.toBe(true);
  });

  it('Discard resolves true and clears the bar (no leak into the next thread)', async () => {
    const { guardRef, getText } = renderGuard('unsent words');
    let resolved: boolean | undefined;
    let pending!: Promise<void>;
    act(() => {
      pending = guardRef
        .current!.confirmLeaveIfNeeded()
        .then((v) => {
          resolved = v;
        });
    });
    await flush();
    await click(dialogButton('.confirm-confirm'));
    await pending;
    await flush();
    expect(resolved).toBe(true);
    // The discarded text is gone: the view instance is reused across thread
    // navigations, so it must not leak into the next thread's composer.
    expect(getText()).toBe('');
  });

  it('Keep editing resolves false and the text stays put', async () => {
    const { guardRef, getText } = renderGuard('unsent words');
    let resolved: boolean | undefined;
    let pending!: Promise<void>;
    act(() => {
      pending = guardRef
        .current!.confirmLeaveIfNeeded()
        .then((v) => {
          resolved = v;
        });
    });
    await flush();
    await click(dialogButton('.confirm-cancel'));
    await pending;
    await flush();
    expect(resolved).toBe(false);
    expect(getText()).toBe('unsent words');
    // The dialog closes after the answer (exit animation ~0.2s); nothing navigated.
    await flush(300);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('clears the guard ref on unmount', async () => {
    const { guardRef, root } = renderGuard('unsent words');
    expect(guardRef.current).not.toBeNull();
    act(() => {
      root.unmount();
    });
    expect(guardRef.current).toBeNull();
  });
});
