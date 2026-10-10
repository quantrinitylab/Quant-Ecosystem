// @vitest-environment jsdom
// ===========================================================================
// QM-QUANTY-005 — Quanty drawer history is EPHEMERAL session state.
//
// The drawer used to persist full transcripts (user + assistant message text)
// to localStorage under `quantmail_quanty_chats_v1` and restore them on the
// next visit: a durable plaintext copy of everything said to the assistant —
// in a drawer that opens with a live email in context — outside every
// retention/export/deletion control the product offers.
//
// The classification is now explicit: transcripts live in component state for
// as long as the page is open, and nowhere else. These tests render the REAL
// drawer and drive the REAL controls, asserting only observable behaviour:
//   (a) a full conversation writes NOTHING to localStorage;
//   (b) a pre-seeded legacy transcript is purged on mount and never restored;
//   (c) the in-session chat list (open / restore / delete / clear) works
//       entirely from memory;
//   (d) a fresh mount — the reload case — starts with no transcript and no
//       history.
// (a) and (b) fail against the pre-fix drawer: it wrote the key on every
// successful turn and restored the seeded history into the menu.
// ===========================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QuantyCopilotDrawer } from '../components/QuantyCopilotDrawer';

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

// The transcript pane autoscrolls via Element.scrollTo, unimplemented in
// jsdom. Shimmed as a no-op: scrolling is not what these tests assert.
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

const LEGACY_KEY = 'quantmail_quanty_chats_v1';
const ASSISTANT_REPLY = 'Here is the answer.';

// ---------------------------------------------------------------------------
// Module mocks. Every mock function/object is created ONCE (vi.hoisted /
// module scope) so hooks receive stable identities across renders — a mock
// that returns a fresh function identity per render can spin the component
// into a render loop (the PR #773 CI OOM lesson).
// ---------------------------------------------------------------------------

const authenticatedFetchMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { message: 'Here is the answer.' } }),
  })),
);
const toastMock = vi.hoisted(() => vi.fn());
const quantyReactMock = vi.hoisted(() => vi.fn());
const queueSendMock = vi.hoisted(() => vi.fn());
const undoSendValue = vi.hoisted(() => ({ queueSend: queueSendMock }));
const i18nValue = vi.hoisted(() => ({ locale: 'en' as const }));
const composeEmailMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock('../services/browser-auth-session', () => ({
  browserAuthSession: { authenticatedFetch: authenticatedFetchMock },
}));
vi.mock('../lib/ai-intent-preference', () => ({
  readAIIntent: () => 'balanced',
  clientTimeoutForIntent: () => 60000,
}));
vi.mock('../services/api-client', () => ({
  apiClient: { composeEmail: composeEmailMock, sendEmail: sendEmailMock },
}));
vi.mock('../components/InboxToast', () => ({ showToast: toastMock }));
vi.mock('../components/UndoSendCountdownBar', () => ({
  useUndoSend: () => undoSendValue,
}));
vi.mock('../lib/quanty/reactions', () => ({
  quantyReact: quantyReactMock,
  useQuantyMood: () => 'idle',
}));
vi.mock('../i18n', () => ({ useI18n: () => i18nValue }));
// The mascot is pure decoration for these assertions; a null stub keeps the
// render about the drawer's behaviour, not the mascot's SVG.
vi.mock('../components/Quanty', () => ({ Quanty: () => null }));

// ---------------------------------------------------------------------------
// Harness (the repo's createRoot + act pattern, cf. PeopleList.test.tsx)
// ---------------------------------------------------------------------------

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function renderDrawer(): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<QuantyCopilotDrawer isOpen onClose={() => {}} />);
  });
  return host;
}

function unmountDrawer() {
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
  unmountDrawer();
  window.localStorage.clear();
  vi.clearAllMocks();
});

beforeEach(() => {
  window.localStorage.clear();
});

/** Let the mocked fetch round trip and the resulting state commits land. */
async function flushTurns() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function setPrompt(container: ParentNode, value: string) {
  const input = container.querySelector<HTMLInputElement>(
    'input[placeholder="Enter a prompt here"]',
  );
  expect(input, 'prompt input renders').not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  act(() => {
    setter.call(input!, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function sendPrompt(container: ParentNode, value: string) {
  setPrompt(container, value);
  const form = container.querySelector('form');
  expect(form, 'prompt form renders').not.toBeNull();
  act(() => {
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await flushTurns();
}

function openHistoryMenu(container: ParentNode) {
  const toggle = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  expect(toggle, 'history toggle renders').not.toBeNull();
  act(() => {
    toggle!.click();
  });
  return container;
}

function menuText(container: ParentNode): string {
  // AnimatePresence keeps a closing menu mounted until its exit animation
  // finishes, so a reopened menu can briefly coexist with the exiting one.
  // The current menu is the LAST one in document order.
  const menus = container.querySelectorAll('[class*="w-64"]');
  return menus[menus.length - 1]?.textContent ?? '';
}

describe('QM-QUANTY-005 — ephemeral Quanty drawer history', () => {
  it('(a) a full conversation writes nothing to localStorage', async () => {
    const container = renderDrawer();

    await sendPrompt(container, 'Alpha question');
    expect(container.textContent).toContain(ASSISTANT_REPLY);

    // The session list does hold the chat — in memory.
    openHistoryMenu(container);
    expect(menuText(container)).toContain('Alpha question');

    await sendPrompt(container, 'Beta follow-up');
    expect(container.textContent).toContain('Beta follow-up');

    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('(b) a pre-seeded legacy transcript is purged on mount and never restored', async () => {
    window.localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify([
        {
          id: 'old-1',
          date: '09:41 AM',
          preview: 'Seeded secret preview',
          messages: [
            { role: 'user', text: 'Seeded secret question' },
            { role: 'assistant', text: 'Seeded secret answer' },
          ],
        },
      ]),
    );

    const container = renderDrawer();

    // Purged, not read.
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();

    // Nothing seeded reaches the transcript or the session list.
    expect(container.textContent).not.toContain('Seeded secret question');
    expect(container.textContent).not.toContain('Seeded secret answer');
    openHistoryMenu(container);
    expect(menuText(container)).not.toContain('Seeded secret preview');
    expect(menuText(container)).toContain('No chats yet in this session');
  });

  it('(c) the session chat list restores, deletes and clears — from memory only', async () => {
    const container = renderDrawer();

    await sendPrompt(container, 'Alpha question');
    openHistoryMenu(container);
    expect(menuText(container)).toContain('Alpha question');

    // Restore: tapping the entry loads its transcript and closes the menu.
    const entry = Array.from(
      container.querySelectorAll<HTMLElement>('div[class*="cursor-pointer"]'),
    ).find((d) => d.textContent?.includes('Alpha question'));
    expect(entry, 'session entry renders').toBeDefined();
    act(() => {
      entry!.click();
    });
    expect(container.textContent).toContain('Alpha question');
    expect(container.textContent).toContain(ASSISTANT_REPLY);

    // Delete: the entry goes away, still without touching storage.
    openHistoryMenu(container);
    const deleteBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete chat"]',
    );
    expect(deleteBtn, 'delete control renders').not.toBeNull();
    act(() => {
      deleteBtn!.click();
    });
    expect(menuText(container)).toContain('No chats yet in this session');
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();

    // A further turn re-snapshots the ongoing conversation; Clear all then
    // empties the in-memory list (the empty render is the same code path the
    // delete step already asserted) and says so via the toast.
    await sendPrompt(container, 'Beta follow-up');
    openHistoryMenu(container);
    expect(menuText(container)).toContain('Alpha question');
    const clearBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Clear all',
    );
    expect(clearBtn, 'clear-all control renders').not.toBeNull();
    act(() => {
      clearBtn!.click();
    });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Session chat history cleared' }),
    );
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('(d) a fresh mount starts with no transcript and no history (reload semantics)', async () => {
    const first = renderDrawer();
    await sendPrompt(first, 'Alpha question');
    expect(first.textContent).toContain(ASSISTANT_REPLY);
    unmountDrawer();

    const second = renderDrawer();
    expect(second.textContent).not.toContain('Alpha question');
    expect(second.textContent).not.toContain(ASSISTANT_REPLY);
    openHistoryMenu(second);
    expect(menuText(second)).toContain('No chats yet in this session');
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });
});
