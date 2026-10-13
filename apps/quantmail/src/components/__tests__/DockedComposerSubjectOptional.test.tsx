// @vitest-environment jsdom
// ============================================================================
// Subject-optional composer — the subjectless-draft data-loss defect.
//
// Before this fix, DockedComposer treated the subject as hard-required in two
// places:
//   1. `saveDraftToServer` bailed with `return false` on an empty subject, so
//      a long subjectless draft was NEVER persisted to the server — the
//      indicator said "Couldn't save" with no reason, and with zero
//      beforeunload protection anywhere in the app, closing the tab lost the
//      entire draft.
//   2. `handleSend` blocked sending with "Please enter an email subject".
//
// The fix: the subject is optional. Empty-subject drafts autosave exactly
// like the rest (the backend composeSchema now accepts ''), and sending
// without a subject goes through the Gmail-style "Send without a subject?"
// confirmation — an explicit choice, never a silent send or a hard block.
//
// These tests render the REAL component and drive the REAL Send button,
// asserting only observable behaviour: which API calls fire, what the
// confirm dialog asks, and that the save indicator tells the truth.
// (Interaction pattern copied from DockedComposerCloseConfirm.test.tsx.)
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DockedComposer } from '../DockedComposer';
import { DRAFT_AUTOSAVE_DELAY_MS } from '../useDraftAutosave';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// NOTE: no module-level vi.useFakeTimers() here — deliberately. The autosave
// tests (a)/(b) enable fake timers explicitly for the 10s debounce, while the
// dialog tests (c)/(d)/(e) run on REAL timers: the shared ConfirmDialog's
// framer-motion exit animation (AnimatePresence, 200ms) never completes under
// fake timers in this environment — the panel freezes mid-exit with its exit
// styles applied and never unmounts, so "Keep editing → dialog gone" can only
// be asserted after a real wall-clock wait. (Interaction pattern copied from
// DockedComposerCloseConfirm.test.tsx, which passes with real timers.)

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

// --- Observable network/send surface ---------------------------------------
const mocks = vi.hoisted(() => ({
  composeEmail: vi.fn(async () => ({ success: true, data: { id: 'draft-1' } })),
  updateDraft: vi.fn(async () => ({ success: true, data: { id: 'draft-1' } })),
  sendEmail: vi.fn(async () => ({ success: true })),
  queueSend: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('../InboxToast', () => ({
  showToast: mocks.showToast,
}));

vi.mock('../../hooks/useContacts', () => ({
  useContacts: () => ({ data: [] }),
}));

vi.mock('../../services/api-client', () => ({
  apiClient: {
    composeEmail: mocks.composeEmail,
    updateDraft: mocks.updateDraft,
    sendEmail: mocks.sendEmail,
  },
}));

vi.mock('../UndoSendCountdownBar', () => ({
  useUndoSend: () => ({ queueSend: mocks.queueSend }),
}));

vi.mock('../../lib/email-body', () => ({
  composeMessageBodies: (text: string) => ({ bodyText: text, bodyHtml: text }),
  adjustRangesForEdit: () => [],
  applyInlineFormat: (ranges: unknown) => ranges,
}));

vi.mock('../../lib/email-signature-preference', () => ({
  loadDefaultSignatureHtml: async () => '',
}));

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(async () => ({})),
}));

// ---------------------------------------------------------------------------
// Render / interaction helpers
// ---------------------------------------------------------------------------

interface Harness {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Harness[] = [];

function renderComposer(
  props: { initialTo?: string; initialSubject?: string; initialBody?: string } = {},
): Harness {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <DockedComposer
        isOpen={true}
        onClose={() => {}}
        onDiscard={() => {}}
        initialTo={props.initialTo}
        initialSubject={props.initialSubject}
        initialBody={props.initialBody}
      />,
    );
  });
  const harness = { container, root };
  mounted.push(harness);
  return harness;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  while (mounted.length > 0) {
    const h = mounted.pop()!;
    act(() => {
      h.root.unmount();
    });
    h.container.remove();
  }
  document.body.innerHTML = '';
  vi.clearAllTimers();
  // The autosave tests below enable fake timers explicitly; always restore
  // real timers so the dialog tests (and any later file) are unaffected.
  vi.useRealTimers();
});

/** Advance FAKE timers (autosave debounce). Only valid inside tests (a)/(b). */
async function settleFake(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Real wall-clock wait (framer-motion exit animations). The shared
 * ConfirmDialog unmounts via AnimatePresence's 200ms exit animation, which
 * does not complete under fake timers — mirror DockedComposerCloseConfirm.
 */
async function flushReal(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flushReal();
}

function sendButton(container: HTMLElement): HTMLButtonElement {
  const btn = container.querySelector<HTMLButtonElement>(
    '[data-testid="docked-composer-send-button"]',
  );
  if (!btn) throw new Error('send button not found');
  return btn;
}

function subjectInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    '#docked-composer-subject',
  );
  if (!input) throw new Error('subject input not found');
  return input;
}

function bodyTextarea(container: HTMLElement): HTMLTextAreaElement {
  const area = container.querySelector<HTMLTextAreaElement>('textarea');
  if (!area) throw new Error('body textarea not found');
  return area;
}

/** Type into a controlled React field the way a real keystroke would land. */
async function typeInto(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(el),
    'value',
  )?.set;
  if (!setter) throw new Error('native value setter unavailable');
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settleFake();
}

/**
 * ConfirmDialog portals itself to document.body — query the whole document,
 * not the harness container.
 */
function dialogEl(): Element | null {
  return document.querySelector('[role="dialog"]');
}

function dialogButton(text: string): HTMLButtonElement {
  const dialog = dialogEl();
  if (!dialog) throw new Error('confirm dialog not open');
  const btn = Array.from(dialog.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text,
  );
  if (!btn) throw new Error(`dialog button "${text}" not found`);
  return btn as HTMLButtonElement;
}

function saveIndicator(container: HTMLElement): string | null {
  return (
    container.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? null
  );
}

// ---------------------------------------------------------------------------
// Subject-optional suite
// ---------------------------------------------------------------------------

describe('DockedComposer subject-optional behaviour', () => {
  it('(a) a subjectless draft autosaves to the server after the quiet period', async () => {
    // Fake timers for the 10s autosave debounce (see note at the top of
    // this file); restored to real timers in afterEach.
    vi.useFakeTimers();
    // NOTE: the draft is typed, not passed via props — the autosave
    // controller only schedules a save when the snapshot CHANGES, exactly
    // like a real typing session. Pre-filled props never go dirty.
    const { container } = renderComposer({ initialTo: 'friend@example.com' });
    await typeInto(bodyTextarea(container), 'A long subjectless draft worth keeping.');

    // The regression: saveDraftToServer used to `return false` before touching
    // the network when the subject was empty, so composeEmail NEVER fired for
    // a subjectless draft and the indicator said "Couldn't save".
    await settleFake(DRAFT_AUTOSAVE_DELAY_MS + 500);

    expect(mocks.composeEmail).toHaveBeenCalledTimes(1);
    expect(mocks.composeEmail.mock.calls[0][0]).toMatchObject({ subject: '' });
    // The indicator tells the truth about the save that really happened.
    expect(saveIndicator(container)).toBe('Saved');
  });

  it('(b) a draft WITH a subject still autosaves (no regression)', async () => {
    vi.useFakeTimers();
    const { container } = renderComposer({ initialTo: 'friend@example.com' });
    await typeInto(subjectInput(container), 'Quarterly numbers');
    await typeInto(bodyTextarea(container), 'Here they are.');

    await settleFake(DRAFT_AUTOSAVE_DELAY_MS + 500);

    expect(mocks.composeEmail).toHaveBeenCalledTimes(1);
    expect(mocks.composeEmail.mock.calls[0][0]).toMatchObject({
      subject: 'Quarterly numbers',
    });
    expect(saveIndicator(container)).toBe('Saved');
  });

  it('(c) Send without a subject asks "Send without a subject?" and waits', async () => {
    const { container } = renderComposer({
      initialTo: 'friend@example.com',
      initialBody: 'No subject on this one.',
    });

    await click(sendButton(container));

    // Gmail-style confirmation — an explicit choice, never a silent send.
    const dialog = dialogEl();
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Send without a subject?');
    // Nothing was queued behind the dialog's back.
    expect(mocks.queueSend).not.toHaveBeenCalled();
  });

  it('(d) "Keep editing" abandons the subjectless send; the draft is untouched', async () => {
    const { container } = renderComposer({
      initialTo: 'friend@example.com',
      initialBody: 'No subject on this one.',
    });

    await click(sendButton(container));
    expect(dialogEl()).not.toBeNull();

    await click(dialogButton('Keep editing'));
    // The dialog unmounts via framer-motion's 200ms exit animation, which
    // needs REAL wall-clock — under fake timers the panel freezes mid-exit
    // and never unmounts (the CI failure this fixes).
    await flushReal(500);

    expect(dialogEl()).toBeNull();
    expect(mocks.queueSend).not.toHaveBeenCalled();
    // The composer is still open with the content exactly where it was.
    expect(
      container.querySelector('[data-testid="docked-composer"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('#docked-composer-subject') as HTMLInputElement,
    ).not.toBeNull();
  });

  it('(e) "Send anyway" proceeds with the empty subject', async () => {
    const { container } = renderComposer({
      initialTo: 'friend@example.com',
      initialBody: 'No subject on this one.',
    });

    await click(sendButton(container));
    expect(dialogEl()).not.toBeNull();

    await click(dialogButton('Send anyway'));
    await flushReal(400);

    expect(mocks.queueSend).toHaveBeenCalledTimes(1);
    expect(mocks.queueSend.mock.calls[0][0]).toMatchObject({ subject: '' });
  });

  it('(f) Send WITH a subject never asks for confirmation', async () => {
    const { container } = renderComposer({
      initialTo: 'friend@example.com',
      initialSubject: 'Quarterly numbers',
      initialBody: 'Here they are.',
    });

    await click(sendButton(container));

    expect(dialogEl()).toBeNull();
    expect(mocks.queueSend).toHaveBeenCalledTimes(1);
    expect(mocks.queueSend.mock.calls[0][0]).toMatchObject({
      subject: 'Quarterly numbers',
    });
  });
});
