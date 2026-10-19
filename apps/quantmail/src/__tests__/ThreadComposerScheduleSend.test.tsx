// @vitest-environment jsdom
// ============================================================================
// Schedule-send in the ThreadComposer (person-thread reply composer).
//
// Root finding: the ThreadComposer — the reply box on the People view, the
// default home surface — had no schedule-send at all (zero `schedul` matches
// in the file), while Gmail ships schedule-send on every compose surface and
// both DockedComposer and the /compose page's EmailComposer already wire the
// SAME ScheduleSendModal. This wires that same modal into the thread
// composer with the SAME backend contract: POST /emails/:id/send with
// `{ sendAt }` (the backend 400s past times — PR #908's convention), and the
// SAME 10-second recall window (a scheduled send defers to it; it never
// bypasses it, so Undo genuinely cancels the schedule before it exists
// server-side).
//
// Layers, following this repo's established test conventions:
//  1. Pure-function: `executeThreadSend` carries an optional `scheduledAt`
//     into `deps.sendEmail(id, { sendAt })` and toasts "Message scheduled";
//     the immediate path stays byte-identical (no options object, "Message
//     sent").
//  2. Behavioural: the component mounted under a REAL UndoSendProvider with
//     a real UndoSendManager, driven under fake timers — the Schedule
//     button opens the modal, a future pick is queued with the recall-window
//     metadata, window expiry sends exactly once with `{ sendAt }`, and a
//     past pick is rejected honestly before anything is queued.
//  3. Wiring pins: readFileSync source assertions on the real component —
//     these fail on the pre-fix code, which had no modal import, no schedule
//     button, and no sendAt wiring anywhere.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  UndoSendManager,
  UndoSendProvider,
  UNDO_SEND_COUNTDOWN_SEC,
} from '../components/UndoSendCountdownBar';

const toastMock = vi.hoisted(() => vi.fn());
const composeMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());

vi.mock('../services/api-client', () => ({
  apiClient: { composeEmail: composeMock, sendEmail: sendMock },
}));
vi.mock('../components/InboxToast', () => ({ showToast: toastMock }));

// The real modal's calendar UI is heavy; capture its props so tests drive
// onSchedule directly with past/future ISOs (the modal's own past-time
// rejection is pinned separately in ScheduleSendModalPastTime.test.tsx).
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (scheduledAt: string) => void;
}
let modalProps: ModalProps | null = null;

vi.mock('../components/ScheduleSendModal', () => ({
  ScheduleSendModal: (props: ModalProps) => {
    modalProps = props;
    return null;
  },
  isPastScheduleTime: (scheduled: Date, now: Date = new Date()) =>
    scheduled.getTime() <= now.getTime(),
}));

import {
  ThreadComposer,
  executeThreadSend,
  type ThreadSendDeps,
} from '../components/ThreadComposer';

const composerSource = readFileSync(
  join(import.meta.dirname, '../components/ThreadComposer.tsx'),
  'utf8',
);

const FUTURE_ISO = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
const PAST_ISO = new Date(Date.now() - 1000 * 60 * 60).toISOString();

function makeConversation() {
  const lastMessage = {
    id: 'msg-9',
    subject: 'Hi there',
    from: { email: 'ada@x.com', name: 'Ada' },
    to: [{ email: 'me@quantmail.in' }],
  };
  return {
    personKey: 'ada',
    name: 'Ada',
    email: 'ada@x.com',
    messages: [lastMessage],
    lastMessage,
    lastActivityAt: new Date('2026-10-10T10:00:00Z'),
    unreadCount: 0,
    lastMessageFromMe: false,
    world: 'log',
    participantEmails: ['ada@x.com'],
  };
}

function makeDeps(): ThreadSendDeps {
  return {
    composeEmail: composeMock,
    sendEmail: sendMock,
    toast: (text, type) => toastMock({ text, type }),
  };
}

function okCompose(id = 'draft-1') {
  return { success: true, data: { id }, error: undefined };
}
function okSend() {
  return { success: true, data: undefined, error: undefined };
}

// Mount the real composer under a real UndoSendProvider, type text, click
// the Schedule button, and pick a time via the captured modal props — the
// full schedule-send flow without the heavy calendar UI.
interface Mounted {
  container: HTMLElement;
  unmount: () => Promise<void>;
  textarea: HTMLTextAreaElement;
  scheduleButton: HTMLButtonElement;
  manager: UndoSendManager;
  queueSendSpy: ReturnType<typeof vi.spyOn>;
}

async function mountComposerAndPick(
  text: string,
  pickedAt: string,
  handlers: {
    onSent?: (text: string, subject: string) => void;
    onSendUndo?: (text: string, subject: string) => void;
    onSendError?: (text: string, subject: string) => void;
  } = {},
): Promise<Mounted> {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');

  const manager = new UndoSendManager();
  const queueSendSpy = vi.spyOn(manager, 'queueSend');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <UndoSendProvider manager={manager}>
        <ThreadComposer
          conversation={makeConversation() as any}
          currentUserId="user-1"
          onSent={handlers.onSent}
          onSendUndo={handlers.onSendUndo}
          onSendError={handlers.onSendError}
        />
      </UndoSendProvider>,
    );
  });

  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  expect(textarea).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set;
    setter?.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const scheduleButton = container.querySelector(
    'button[data-testid="thread-composer-schedule-button"]',
  ) as HTMLButtonElement;
  expect(scheduleButton).not.toBeNull();
  await act(async () => {
    scheduleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  expect(modalProps).not.toBeNull();
  expect(modalProps!.isOpen).toBe(true);

  // Pick the time through the modal's real contract — the component's
  // onSchedule handler closes the modal and runs handleSend(at).
  await act(async () => {
    modalProps!.onSchedule(pickedAt);
  });

  return {
    container,
    manager,
    queueSendSpy,
    textarea,
    scheduleButton,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      manager.destroy();
      container.remove();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  modalProps = null;
  // React 19's act(...) requires this flag in the test environment.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom does not implement scrollIntoView (the composer calls it on
  // textarea focus); stub it so the focus paths are exercisable.
  if (!Element.prototype.scrollIntoView) {
    (Element.prototype as any).scrollIntoView = vi.fn();
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('executeThreadSend schedule contract (pure function)', () => {
  it('carries scheduledAt into sendEmail as { sendAt } and toasts "Message scheduled"', async () => {
    composeMock.mockResolvedValue(okCompose('draft-9'));
    sendMock.mockResolvedValue(okSend());

    const outcome = await executeThreadSend(
      makeDeps(),
      makeConversation() as any,
      'Re: Hi there',
      'later words',
      FUTURE_ISO,
    );

    expect(outcome.ok).toBe(true);
    expect(composeMock).toHaveBeenCalledWith({
      to: [{ email: 'ada@x.com' }],
      subject: 'Re: Hi there',
      bodyText: 'later words',
      messageKind: 'chat',
      inReplyTo: 'msg-9',
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith('draft-9', { sendAt: FUTURE_ISO });
    expect(toastMock).toHaveBeenCalledWith({ text: 'Message scheduled', type: 'success' });
  });

  it('keeps the immediate-send call byte-identical: no options object, "Message sent" toast', async () => {
    composeMock.mockResolvedValue(okCompose('draft-1'));
    sendMock.mockResolvedValue(okSend());

    const outcome = await executeThreadSend(
      makeDeps(),
      makeConversation() as any,
      'Re: Hi there',
      'now words',
    );

    expect(outcome.ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith('draft-1');
    expect(toastMock).toHaveBeenCalledWith({ text: 'Message sent', type: 'success' });
  });

  it('a failed scheduled send reports ok:false with the honest error toast, never "scheduled"', async () => {
    composeMock.mockResolvedValue(okCompose('draft-f'));
    sendMock.mockResolvedValue({
      success: false,
      data: undefined,
      error: { message: 'SMTP down' },
    });

    const outcome = await executeThreadSend(
      makeDeps(),
      makeConversation() as any,
      'Re: Hi there',
      'doomed',
      FUTURE_ISO,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.errorMessage).toBe('SMTP down');
    expect(toastMock).toHaveBeenCalledWith({ text: 'SMTP down', type: 'error' });
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });
});

describe('ThreadComposer schedule-send through the shared queue', () => {
  it('the Schedule button renders and is disabled until the box has text', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const manager = new UndoSendManager();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <UndoSendProvider manager={manager}>
          <ThreadComposer conversation={makeConversation() as any} currentUserId="user-1" />
        </UndoSendProvider>,
      );
    });

    const scheduleButton = container.querySelector(
      'button[data-testid="thread-composer-schedule-button"]',
    ) as HTMLButtonElement;
    expect(scheduleButton).not.toBeNull();
    expect(scheduleButton.getAttribute('aria-label')).toBe('Schedule send');
    // Empty box: nothing to schedule.
    expect(scheduleButton.disabled).toBe(true);

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')
        ?.set;
      setter?.call(textarea, 'some words');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(scheduleButton.disabled).toBe(false);

    await act(async () => {
      root.unmount();
    });
    manager.destroy();
    container.remove();
  });

  it('a future pick is queued with the recall-window metadata; expiry sends exactly once with { sendAt }', async () => {
    composeMock.mockResolvedValue(okCompose('draft-7'));
    sendMock.mockResolvedValue(okSend());
    const onSent = vi.fn();
    const onSendUndo = vi.fn();

    const m = await mountComposerAndPick('scheduled words', FUTURE_ISO, { onSent, onSendUndo });

    // Queued — NOT sent yet: the 10-second recall window owns the send.
    expect(m.queueSendSpy).toHaveBeenCalledTimes(1);
    const opts = m.queueSendSpy.mock.calls[0][0];
    expect(opts.scheduledAt).toBe(FUTURE_ISO);
    // The bar never claims "sent" for a future schedule.
    expect(opts.successLabel).toBe('Email scheduled!');
    expect(composeMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    // The box cleared: the words live in the bubble + queue.
    expect(m.textarea.value).toBe('');
    const bar = m.container.querySelector('[data-testid="undo-send-bar"]');
    expect(bar).not.toBeNull();

    const { act } = await import('react');
    await act(async () => {
      vi.advanceTimersByTime(UNDO_SEND_COUNTDOWN_SEC * 1000);
    });

    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    // The exact backend contract DockedComposer and /compose use.
    expect(sendMock).toHaveBeenCalledWith('draft-7', { sendAt: FUTURE_ISO });
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledWith('scheduled words', 'Re: Hi there', expect.any(String));
    expect(onSendUndo).not.toHaveBeenCalled();

    await m.unmount();
  });

  it('Undo inside the recall window cancels the schedule before a single byte is delivered', async () => {
    composeMock.mockResolvedValue(okCompose());
    sendMock.mockResolvedValue(okSend());
    const onSendUndo = vi.fn();
    const onSent = vi.fn();

    const m = await mountComposerAndPick('second thoughts', FUTURE_ISO, { onSendUndo, onSent });
    expect(m.queueSendSpy).toHaveBeenCalledTimes(1);

    const { act } = await import('react');
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    const undoButton = m.container.querySelector('[data-testid="undo-button"]') as HTMLButtonElement;
    expect(undoButton).not.toBeNull();
    await act(async () => {
      undoButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Bubble withdrawn through the undo contract, words handed back…
    expect(onSendUndo).toHaveBeenCalledTimes(1);
    expect(onSendUndo).toHaveBeenCalledWith('second thoughts', 'Re: Hi there', expect.any(String));
    expect(m.textarea.value).toBe('second thoughts');
    // …and the schedule NEVER fires, even long past the window.
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    expect(composeMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();

    await m.unmount();
  });

  it('a past pick is rejected honestly: error toast, nothing queued, box keeps its text', async () => {
    composeMock.mockResolvedValue(okCompose());
    sendMock.mockResolvedValue(okSend());

    const m = await mountComposerAndPick('past words', PAST_ISO);

    // Belt-and-braces past-time guard (PR #908): rejected before queueing,
    // so the queue can never deliver it IMMEDIATELY while the UI claimed
    // "scheduled".
    expect(toastMock).toHaveBeenCalledWith({
      text: 'That time has already passed — pick a future time to schedule your send.',
      type: 'error',
    });
    expect(m.queueSendSpy).not.toHaveBeenCalled();
    expect(composeMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    // The box never cleared: nothing was queued.
    expect(m.textarea.value).toBe('past words');

    await m.unmount();
  });
});

describe('wiring pins (fail on the pre-fix code)', () => {
  it('ThreadComposer imports and renders the shared ScheduleSendModal', () => {
    expect(composerSource).toContain("from './ScheduleSendModal'");
    expect(composerSource).toContain('<ScheduleSendModal');
    expect(composerSource).toContain('onSchedule={(at)');
  });

  it('the send path carries scheduledAt into the POST /emails/:id/send contract', () => {
    expect(composerSource).toContain('sendEmail(composeRes.data.id, { sendAt: scheduledAt })');
    expect(composerSource).toContain('isPastScheduleTime');
  });

  it('the schedule entry point exists in the chat bar', () => {
    expect(composerSource).toContain('data-testid="thread-composer-schedule-button"');
    expect(composerSource).toContain('aria-label="Schedule send"');
  });

  it('a scheduled send defers to the recall window with the honest success label', () => {
    expect(composerSource).toContain('scheduledAt,');
    expect(composerSource).toContain("successLabel: scheduledAt ? 'Email scheduled!' : undefined");
  });
});
