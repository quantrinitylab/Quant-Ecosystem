// @vitest-environment jsdom
// ============================================================================
// Compose-honesty P0: DockedComposer's undo-send must be GENUINE.
//
// Before this fix, handleSend fired apiClient.composeEmail + sendEmail
// IMMEDIATELY and then showed the countdown bar's "Undo" — the message was
// already delivered, so "Send cancelled. Draft restored." was a lie twice
// over (sent anyway, and the "restored" draft went into an unmounted composer
// nobody could see).
//
// These tests pin the honest contract by capturing the queueSend options:
//   (a) pressing Send must NOT call composeEmail/sendEmail and must NOT close
//       the composer — the send lives only in onSendNow;
//   (b) invoking the captured onSendNow performs the real send and then
//       closes the composer;
//   (c) invoking the captured onUndo performs NO network send at all and
//       reports "Send cancelled. Draft restored." truthfully;
//   (d) a rejecting onSendNow (failed delivery) hands the words back with an
//       error toast via onSendFailed — the bar never celebrates a lost send.
//
// The tests render the REAL component and drive the REAL Send button,
// asserting only observable behaviour.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DockedComposer } from '../DockedComposer';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

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

// --- Captured queueSend options ------------------------------------------------
interface CapturedQueue {
  to: string;
  subject?: string;
  body?: string;
  onSendNow?: () => Promise<void>;
  onSendFailed?: (error: unknown) => void | Promise<void>;
  onUndo?: () => void | Promise<void>;
}
let captured: CapturedQueue | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('../InboxToast', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../hooks/useContacts', () => ({
  useContacts: () => ({ data: [] }),
}));

const composeEmail = vi.fn();
const sendEmail = vi.fn();
const updateDraft = vi.fn();
vi.mock('../../services/api-client', () => ({
  apiClient: {
    get composeEmail() {
      return composeEmail;
    },
    get sendEmail() {
      return sendEmail;
    },
    get updateDraft() {
      return updateDraft;
    },
  },
}));

vi.mock('../UndoSendCountdownBar', () => ({
  useUndoSend: () => ({
    queueSend: (opts: CapturedQueue) => {
      captured = opts;
    },
  }),
}));

vi.mock('../../lib/email-body', () => ({
  composeMessageBodies: (text: string) => ({ bodyText: text, bodyHtml: text }),
  adjustRangesForEdit: () => [],
  applyInlineFormat: (ranges: unknown) => ranges,
}));

vi.mock('../../lib/email-signature-preference', () => ({
  loadDefaultSignatureHtml: async () => '',
}));

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({ confirm: vi.fn(async () => true), dialog: null }),
}));

// --- Harness -------------------------------------------------------------------
interface Harness {
  container: HTMLDivElement;
  root: Root;
  onClose: ReturnType<typeof vi.fn>;
}

const mounted: Harness[] = [];

function renderComposer(): Harness {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  act(() => {
    root.render(<DockedComposer isOpen={true} onClose={onClose} />);
  });
  const harness = { container, root, onClose };
  mounted.push(harness);
  return harness;
}

afterEach(() => {
  while (mounted.length > 0) {
    const h = mounted.pop()!;
    act(() => {
      h.root.unmount();
    });
    h.container.remove();
  }
  document.body.innerHTML = '';
  captured = null;
  composeEmail.mockReset();
  sendEmail.mockReset();
  updateDraft.mockReset();
});

async function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype,
    'value',
  )?.set;
  const protoSetter = Object.getOwnPropertyDescriptor(input, 'value')?.set;
  await act(async () => {
    // Prefer the native setter so React's onChange fires.
    const native = setter ?? protoSetter;
    native?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function fillAndSend(container: HTMLElement) {
  const to = container.querySelector<HTMLInputElement>('#docked-composer-to')!;
  const subject = container.querySelector<HTMLInputElement>('#docked-composer-subject')!;
  const body = container.querySelector<HTMLTextAreaElement>(
    'textarea[placeholder^="Write your email here"]',
  )!;
  await typeInto(to, 'kundan@quantmail.in');
  await typeInto(subject, 'honesty check');
  await typeInto(body, 'the undo must be real');
  const sendBtn = container.querySelector<HTMLButtonElement>(
    '[data-testid="docked-composer-send-button"]',
  )!;
  await act(async () => {
    sendBtn.click();
  });
  // Let the async handleSend settle.
  await act(async () => {
    await Promise.resolve();
  });
}

describe('DockedComposer genuine undo-send', () => {
  it('(a) Send queues but does NOT deliver immediately and does NOT close', async () => {
    const { container, onClose } = renderComposer();
    await fillAndSend(container);

    expect(captured).not.toBeNull();
    expect(composeEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // The composer minimizes (stays mounted) instead of closing.
    expect(
      container.querySelector('[data-testid="docked-composer-minimized"]'),
    ).not.toBeNull();
  });

  it('(b) onSendNow performs the real send and then closes', async () => {
    const { container, onClose } = renderComposer();
    composeEmail.mockResolvedValue({ success: true, data: { id: 'draft-1' } });
    sendEmail.mockResolvedValue({ success: true, data: {} });

    await fillAndSend(container);
    expect(captured?.onSendNow).toBeTypeOf('function');

    await act(async () => {
      await captured!.onSendNow!();
    });

    expect(composeEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith('draft-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('(c) onUndo sends NOTHING — the toast tells the truth', async () => {
    const { container, onClose } = renderComposer();
    const { showToast } = await import('../InboxToast');

    await fillAndSend(container);
    expect(captured?.onUndo).toBeTypeOf('function');

    await act(async () => {
      await captured!.onUndo!();
    });

    expect(composeEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith({
      text: 'Send cancelled. Draft restored.',
      type: 'info',
    });
    // The composer is restored visibly (un-minimized) with the draft.
    expect(
      container.querySelector('[data-testid="docked-composer-minimized"]'),
    ).toBeNull();
    expect(
      container.querySelector<HTMLInputElement>('#docked-composer-subject')?.value,
    ).toBe('honesty check');
  });

  it('(d) a failed onSendNow restores the draft with an honest error, never "sent"', async () => {
    const { container, onClose } = renderComposer();
    const { showToast } = await import('../InboxToast');
    composeEmail.mockResolvedValue({ success: false, error: { message: 'SMTP down' } });

    await fillAndSend(container);

    await act(async () => {
      await expect(captured!.onSendNow!()).rejects.toThrow('SMTP down');
    });

    // The manager's failure path hands the words back with the truth.
    await act(async () => {
      await captured!.onSendFailed!(new Error('SMTP down'));
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith({ text: 'SMTP down', type: 'error' });
    // Draft is back on screen, not lost.
    expect(
      container.querySelector<HTMLInputElement>('#docked-composer-subject')?.value,
    ).toBe('honesty check');
  });

});
