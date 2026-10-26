// @vitest-environment jsdom
// ============================================================================
// Schedule-send in ThreadComposer (the mobile person-thread reply composer).
//
// Root finding (qm-auto, 2026-10-12, [P2] [mobile-inbox]): the mobile thread
// composer had no schedule-send — Gmail's mobile compose offers it from the
// overflow menu — and the only send-later component in the tree,
// EmailSendLater.tsx, was imported/rendered NOWHERE (dead code). The composer
// itself has since gained the canonical ScheduleSendModal wiring (same pick
// logic, same past-time rejection, same POST /emails/:id/send `{ sendAt }`
// contract as DockedComposer/EmailComposer), so this suite pins that wiring
// instead of re-adding a second picker, and the dead EmailSendLater.tsx +
// its globals.css rules are deleted alongside it.
//
// These tests pin:
//   (a) the schedule-send entry point renders in the thread composer
//       (renderToStaticMarkup — CI has no @testing-library/react), disabled
//       while the box is empty and enabled once text is typed;
//   (b) a past scheduledAt is rejected with an honest error and never
//       composed/sent (the belt-and-braces guard in handleSend, same
//       convention as DockedComposer PR #908);
//   (c) a future scheduledAt goes through the real send path with the exact
//       backend contract: compose a chat-kind draft in-reply-to the thread's
//       last message, then sendEmail(id, { sendAt }) — and toasts
//       "Message scheduled", never "Message sent".
//
// The tests render the REAL component and drive the REAL schedule button.
// The real modal's calendar UI is heavy, so its props are captured and
// onSchedule is driven directly with past/future ISOs (the modal's own
// past-time rejection is pinned separately in ScheduleSendModalPastTime).
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadComposer } from '../ThreadComposer';
import type { PersonConversation } from '../../lib/peopleGrouping';

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

// --- Captured ScheduleSendModal props -----------------------------------------
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (scheduledAt: string) => void;
}
let modalProps: ModalProps | null = null;

vi.mock('../InboxToast', () => ({
  showToast: vi.fn(),
}));

const composeEmail = vi.fn();
const sendEmail = vi.fn();
vi.mock('../../services/api-client', () => ({
  apiClient: {
    get composeEmail() {
      return composeEmail;
    },
    get sendEmail() {
      return sendEmail;
    },
  },
}));

vi.mock('../ScheduleSendModal', () => ({
  ScheduleSendModal: (props: ModalProps) => {
    modalProps = props;
    return null;
  },
  isPastScheduleTime: (scheduled: Date, now: Date = new Date()) =>
    scheduled.getTime() <= now.getTime(),
}));

// The templates picker is never opened by these tests; stub it so its own
// backend fetch surface cannot interfere with the schedule-send path.
vi.mock('../EmailTemplates', () => ({
  EmailTemplates: () => null,
}));

// --- Fixture ------------------------------------------------------------------
const conversation = {
  personKey: 'priya@quantmail.in',
  name: 'Priya',
  email: 'priya@quantmail.in',
  messages: [],
  lastMessage: { id: 'msg-42', subject: 'Project update' },
  lastActivityAt: new Date(),
  unreadCount: 0,
  lastMessageFromMe: false,
  world: 'log',
  participantEmails: ['priya@quantmail.in'],
  hasGroupMessages: false,
} as unknown as PersonConversation;

// --- Harness -------------------------------------------------------------------
interface Harness {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Harness[] = [];

function renderComposer(): Harness {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ThreadComposer conversation={conversation} currentUserId="user-1" />,
    );
  });
  const harness = { container, root };
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
  modalProps = null;
  composeEmail.mockReset();
  sendEmail.mockReset();
  vi.clearAllMocks();
});

async function typeInto(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  await act(async () => {
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function scheduleWithIso(container: HTMLElement, iso: string) {
  const scheduleBtn = container.querySelector<HTMLButtonElement>(
    '[data-testid="thread-composer-schedule-button"]',
  )!;
  await act(async () => {
    scheduleBtn.click();
  });
  expect(modalProps).not.toBeNull();
  expect(modalProps!.isOpen).toBe(true);
  await act(async () => {
    modalProps!.onSchedule(iso);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('ThreadComposer schedule-send', () => {
  it('(a) the schedule-send entry point renders, disabled when empty, enabled with text', () => {
    const emptyHtml = renderToStaticMarkup(
      <ThreadComposer conversation={conversation} currentUserId="user-1" />,
    );
    expect(emptyHtml).toContain('data-testid="thread-composer-schedule-button"');
    expect(emptyHtml).toContain('Schedule send');
    // Empty box: the schedule button must be disabled — an empty message is
    // never scheduled (same rule as the Send button).
    const scheduleBtnTag = emptyHtml.match(
      /<button[^>]*data-testid="thread-composer-schedule-button"[^>]*>/,
    );
    expect(scheduleBtnTag).not.toBeNull();
    // The real disabled ATTRIBUTE (not the `disabled:opacity-40` class,
    // which is present in both states).
    expect(scheduleBtnTag![0]).toContain('disabled=""');

    // With text in the box (a tapped smart reply, or a restored draft) the
    // button is enabled.
    const filledHtml = renderToStaticMarkup(
      <ThreadComposer
        conversation={conversation}
        currentUserId="user-1"
        suggestedReply={{ text: 'Sounds good, thanks!', nonce: 1 }}
      />,
    );
    const filledBtnTag = filledHtml.match(
      /<button[^>]*data-testid="thread-composer-schedule-button"[^>]*>/,
    );
    expect(filledBtnTag).not.toBeNull();
    expect(filledBtnTag![0]).not.toContain('disabled=""');
  });

  it('(b) a past scheduledAt is rejected honestly and never composed/sent', async () => {
    const { container } = renderComposer();
    const { showToast } = await import('../InboxToast');

    const box = container.querySelector<HTMLTextAreaElement>('#people-reply-input')!;
    await typeInto(box, 'the schedule must be real');
    await scheduleWithIso(container, new Date(Date.now() - 60_000).toISOString());

    expect(showToast).toHaveBeenCalledWith({
      text: 'That time has already passed — pick a future time to schedule your send.',
      type: 'error',
    });
    expect(composeEmail).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('(c) a future scheduledAt composes a chat draft and sends with { sendAt }', async () => {
    const { container } = renderComposer();
    const { showToast } = await import('../InboxToast');
    const futureIso = new Date(Date.now() + 3_600_000).toISOString();
    composeEmail.mockResolvedValue({ success: true, data: { id: 'draft-9' } });
    sendEmail.mockResolvedValue({ success: true, data: {} });

    const box = container.querySelector<HTMLTextAreaElement>('#people-reply-input')!;
    await typeInto(box, 'the schedule must be real');
    await scheduleWithIso(container, futureIso);

    // The fixed #771 send path: chat-kind draft to the person, in-reply-to
    // the thread's last message, automatic Re: subject (never doubled).
    expect(composeEmail).toHaveBeenCalledWith({
      to: [{ email: 'priya@quantmail.in' }],
      subject: 'Re: Project update',
      bodyText: 'the schedule must be real',
      messageKind: 'chat',
      inReplyTo: 'msg-42',
    });
    // The schedule contract: sendAt carries the future time.
    expect(sendEmail).toHaveBeenCalledWith('draft-9', { sendAt: futureIso });
    expect(showToast).toHaveBeenCalledWith({
      text: 'Message scheduled',
      type: 'success',
    });
  });

  it('executeThreadSend carries sendAt for a scheduled send, omits it for immediate', async () => {
    const { executeThreadSend } = await import('../ThreadComposer');
    const toasts: Array<{ text: string; type: string }> = [];
    const deps = {
      composeEmail: vi.fn(async () => ({ success: true, data: { id: 'draft-9' } })),
      sendEmail: vi.fn(async () => ({ success: true })),
      toast: (text: string, type: 'success' | 'error') => {
        toasts.push({ text, type });
      },
    };
    const futureIso = new Date(Date.now() + 3_600_000).toISOString();
    const scheduled = await executeThreadSend(
      deps,
      conversation,
      'Re: Project update',
      'scheduled body',
      futureIso,
    );
    expect(scheduled.ok).toBe(true);
    expect(deps.sendEmail).toHaveBeenCalledWith('draft-9', { sendAt: futureIso });
    expect(toasts).toContainEqual({ text: 'Message scheduled', type: 'success' });

    deps.sendEmail.mockClear();
    toasts.length = 0;
    const immediate = await executeThreadSend(
      deps,
      conversation,
      'Re: Project update',
      'immediate body',
    );
    expect(immediate.ok).toBe(true);
    // Immediate send stays byte-identical: one arg, no options object.
    expect(deps.sendEmail).toHaveBeenCalledWith('draft-9');
    expect(toasts).toContainEqual({ text: 'Message sent', type: 'success' });
  });
});
