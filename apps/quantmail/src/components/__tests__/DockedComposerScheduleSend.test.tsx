// @vitest-environment jsdom
// ============================================================================
// Schedule-send in the DockedComposer (inbox's primary composer).
//
// Root finding: the DockedComposer — the primary inbox composer — had no
// schedule-send at all (ScheduleSendModal was wired only in
// EmailComposer.tsx, the /compose page), while Gmail ships schedule-send on
// every compose surface. This wires the SAME modal into DockedComposer with
// the SAME backend contract: POST /emails/:id/send with `{ sendAt }` (the
// backend 400s past times — PR #908's convention), and the same 10-second
// recall window (a scheduled send defers to it; it never bypasses it).
//
// These tests pin the fix:
//   (a) the schedule-send entry point renders in DockedComposer
//       (renderToStaticMarkup — CI has no @testing-library/react);
//   (b) a past scheduledAt is rejected with an honest error and never
//       queued (PR #908 convention, belt-and-braces beyond the modal);
//   (c) a future scheduledAt is queued with the recall-window metadata and
//       the real send calls sendEmail(id, { sendAt }) — the exact backend
//       contract EmailComposer uses on /compose;
//   (d) Undo inside the recall window cancels the schedule before a single
//       byte is delivered — never silently cancelled, never double-sent.
//       The countdown bar's scheduled-send copy ("Scheduling…" / "Email
//       scheduled!") and the queueSend duplicate-guard identity are pinned in
//       UndoSendScheduledCopy.test.tsx and UndoSendDuplicateGuard.test.ts.
//
// The tests render the REAL component and drive the REAL Schedule button.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
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
  scheduledAt?: string;
  successLabel?: string;
  onSendNow?: () => Promise<void>;
  onSendFailed?: (error: unknown) => void | Promise<void>;
  onUndo?: () => void | Promise<void>;
}
let captured: CapturedQueue | null = null;

// --- Captured ScheduleSendModal props ------------------------------------------
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (scheduledAt: string) => void;
}
let modalProps: ModalProps | null = null;

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

// The real modal's calendar UI is heavy; capture its props so tests drive
// onSchedule directly with past/future ISOs (the modal's own past-time
// rejection is pinned separately in ScheduleSendModalPastTime.test.tsx).
vi.mock('../ScheduleSendModal', () => ({
  ScheduleSendModal: (props: ModalProps) => {
    modalProps = props;
    return null;
  },
  isPastScheduleTime: (scheduled: Date, now: Date = new Date()) =>
    scheduled.getTime() <= now.getTime(),
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
  modalProps = null;
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
    const native = setter ?? protoSetter;
    native?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function fillDraft(container: HTMLElement) {
  const to = container.querySelector<HTMLInputElement>('#docked-composer-to')!;
  const subject = container.querySelector<HTMLInputElement>('#docked-composer-subject')!;
  const body = container.querySelector<HTMLTextAreaElement>(
    'textarea[placeholder^="Write your email here"]',
  )!;
  await typeInto(to, 'kundan@quantmail.in');
  // The chip-based To: row commits on Enter — without this, toRecipients stays
  // empty and handleSend bails with "Please specify at least one recipient".
  await act(async () => {
    to.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await typeInto(subject, 'schedule honesty check');
  await typeInto(body, 'the schedule must be real');
}

// Click the Schedule button, then confirm the mocked modal with `iso`.
async function scheduleWithIso(container: HTMLElement, iso: string) {
  const scheduleBtn = container.querySelector<HTMLButtonElement>(
    '[data-testid="docked-composer-schedule-button"]',
  )!;
  await act(async () => {
    scheduleBtn.click();
  });
  expect(modalProps).not.toBeNull();
  expect(modalProps!.isOpen).toBe(true);
  await act(async () => {
    modalProps!.onSchedule(iso);
    await Promise.resolve();
  });
}

describe('DockedComposer schedule-send', () => {
  it('(a) the schedule-send entry point renders in the toolbar', () => {
    const html = renderToStaticMarkup(
      <DockedComposer isOpen={true} onClose={() => {}} />,
    );
    expect(html).toContain('data-testid="docked-composer-schedule-button"');
    expect(html).toContain('Schedule send');
  });

  it('(b) a past scheduledAt is rejected honestly and never queued', async () => {
    const { container } = renderComposer();
    const { showToast } = await import('../InboxToast');

    await fillDraft(container);
    await scheduleWithIso(container, new Date(Date.now() - 60_000).toISOString());

    expect(showToast).toHaveBeenCalledWith({
      text: 'That time has already passed — pick a future time to schedule your send.',
      type: 'error',
    });
    // Never queued: no recall countdown, no delivery, nothing scheduled.
    expect(captured).toBeNull();
    expect(composeEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('(c) a future scheduledAt queues with honest metadata and sends with { sendAt }', async () => {
    const { container, onClose } = renderComposer();
    const futureIso = new Date(Date.now() + 3_600_000).toISOString();
    composeEmail.mockResolvedValue({ success: true, data: { id: 'draft-1' } });
    sendEmail.mockResolvedValue({ success: true, data: {} });

    await fillDraft(container);
    await scheduleWithIso(container, futureIso);

    // Queued through the same recall window, with the scheduled identity so
    // the bar's copy stays honest.
    expect(captured).not.toBeNull();
    expect(captured!.scheduledAt).toBe(futureIso);
    expect(captured!.successLabel).toBe('Email scheduled!');
    expect(composeEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // The composer minimizes (stays mounted) so Undo can restore it.
    expect(
      container.querySelector('[data-testid="docked-composer-minimized"]'),
    ).not.toBeNull();

    // The real send — fires only after the recall window closes — carries
    // the EXACT backend contract EmailComposer uses on /compose:
    // compose keeps `scheduledAt` in the draft payload, send posts `sendAt`.
    await act(async () => {
      await captured!.onSendNow!();
    });
    expect(composeEmail).toHaveBeenCalledTimes(1);
    expect(composeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAt: futureIso }),
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith('draft-1', { sendAt: futureIso });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('(d) Undo inside the recall window cancels the schedule — nothing delivered', async () => {
    const { container, onClose } = renderComposer();
    const { showToast } = await import('../InboxToast');

    await fillDraft(container);
    await scheduleWithIso(container, new Date(Date.now() + 3_600_000).toISOString());
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
    ).toBe('schedule honesty check');
  });
});
