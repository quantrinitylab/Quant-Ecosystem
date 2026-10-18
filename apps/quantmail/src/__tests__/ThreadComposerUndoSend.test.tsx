// @vitest-environment jsdom
// ============================================================================
// QM undo-send for the People thread composer.
//
// Before this fix, `ThreadComposer`'s `handleSend` ran `executeThreadSend`
// (compose+send) the instant Send was pressed — the person thread (the
// default home surface) was the only send path with no recall window, while
// EmailComposer, DockedComposer, quick reply and QuantyCopilotDrawer all
// route through `queueSend`/UndoSendManager (10s undo). The fix routes the
// thread composer through that same queue: the API calls live in `onSendNow`
// and fire only when the countdown closes; `onUndo` recalls the message with
// nothing sent and hands the words back to the box; `onSendFailed` keeps the
// P1-C failure contract (optimistic bubble withdrawn, words handed back,
// honest error toast — the bar never claims "sent" for a failed send).
//
// Layers, following this repo's established test conventions:
//  1. Behavioural: the component mounted under a REAL UndoSendProvider with
//     a real UndoSendManager, driven under fake timers — send is deferred,
//     Undo recalls, expiry sends exactly once, failure restores honestly.
//  2. Fallback pin: without a provider the direct send keeps today's exact
//     behavior (the composer is never broken by its host's wiring).
//  3. Wiring pins: readFileSync source assertions on the real components —
//     these fail on the pre-fix code, where handleSend fired the API
//     directly and no onSendUndo existed.
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

import { ThreadComposer } from '../components/ThreadComposer';

const composerSource = readFileSync(
  join(import.meta.dirname, '../components/ThreadComposer.tsx'),
  'utf8',
);
const personPageSource = readFileSync(
  join(import.meta.dirname, '../app/(app)/people/[personId]/page.tsx'),
  'utf8',
);

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

function okCompose(id = 'draft-1') {
  return { success: true, data: { id }, error: undefined };
}
function okSend() {
  return { success: true, data: undefined, error: undefined };
}

interface Mounted {
  container: HTMLElement;
  unmount: () => Promise<void>;
  textarea: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
  manager: UndoSendManager | null;
}

// Mount the real composer, type text, click send. With `withProvider` the
// composer sits under a real UndoSendProvider backed by a real manager whose
// timers are fake (built after vi.useFakeTimers in beforeEach).
async function mountComposerAndSend(
  text: string,
  handlers: {
    onSendStart?: (...args: unknown[]) => void;
    onSendError?: (text: string, subject: string) => void;
    onSendUndo?: (text: string, subject: string) => void;
    onSent?: (text: string, subject: string) => void;
  },
  withProvider: boolean,
): Promise<Mounted> {
  const { act } = await import('react');
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');

  const manager = withProvider ? new UndoSendManager() : null;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const composer = (
    <ThreadComposer
      conversation={makeConversation() as any}
      currentUserEmail="me@quantmail.in"
      onSendStart={handlers.onSendStart as any}
      onSendError={handlers.onSendError}
      onSendUndo={handlers.onSendUndo}
      onSent={handlers.onSent}
    />
  );
  await act(async () => {
    root.render(withProvider && manager ? <UndoSendProvider manager={manager}>{composer}</UndoSendProvider> : composer);
  });

  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  expect(textarea).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set;
    setter?.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const sendButton = container.querySelector('button[aria-label="Send message"]') as HTMLButtonElement;
  expect(sendButton).not.toBeNull();
  expect(sendButton.disabled).toBe(false);
  await act(async () => {
    sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  return {
    container,
    manager,
    textarea,
    sendButton,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      manager?.destroy();
      container.remove();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // jsdom does not implement scrollIntoView (the composer calls it on
  // textarea focus); stub it so the focus-on-undo path is exercisable.
  if (!Element.prototype.scrollIntoView) {
    (Element.prototype as any).scrollIntoView = vi.fn();
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ThreadComposer undo-send through the shared queue (with provider)', () => {
  it('defers the network send: nothing hits the API while the recall window is open', async () => {
    composeMock.mockResolvedValue(okCompose());
    sendMock.mockResolvedValue(okSend());
    const onSendStart = vi.fn();
    const onSent = vi.fn();

    const m = await mountComposerAndSend('undo me', { onSendStart, onSent }, true);

    // The optimistic contract fires first…
    expect(onSendStart).toHaveBeenCalledTimes(1);
    expect(onSendStart).toHaveBeenCalledWith('undo me', 'Re: Hi there');
    // …the box clears (words live in the bubble + queue)…
    expect(m.textarea.value).toBe('');
    // …but NOTHING was sent yet: the recall window owns the send now.
    expect(composeMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
    // The provider's countdown bar is the undo control, naming the person.
    const bar = m.container.querySelector('[data-testid="undo-send-bar"]');
    expect(bar).not.toBeNull();
    expect(bar?.textContent).toContain('Ada');
    expect(m.container.querySelector('[data-testid="undo-button"]')).not.toBeNull();
    expect(m.container.querySelector('[data-testid="send-now-button"]')).not.toBeNull();

    // Half-way through the window: still nothing sent.
    const { act } = await import('react');
    await act(async () => {
      vi.advanceTimersByTime((UNDO_SEND_COUNTDOWN_SEC * 1000) / 2);
    });
    expect(composeMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();

    await m.unmount();
  });

  it('Undo inside the window recalls the message: nothing sent, words handed back, bubble withdrawn via onSendUndo', async () => {
    composeMock.mockResolvedValue(okCompose());
    sendMock.mockResolvedValue(okSend());
    const onSendUndo = vi.fn();
    const onSendError = vi.fn();

    const m = await mountComposerAndSend('second thoughts', { onSendUndo, onSendError }, true);
    expect(composeMock).not.toHaveBeenCalled();

    const { act } = await import('react');
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    const undoButton = m.container.querySelector('[data-testid="undo-button"]') as HTMLButtonElement;
    expect(undoButton).not.toBeNull();
    await act(async () => {
      undoButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // The host withdraws the bubble through the new undo callback…
    expect(onSendUndo).toHaveBeenCalledTimes(1);
    expect(onSendUndo).toHaveBeenCalledWith('second thoughts', 'Re: Hi there');
    // …failure path is NOT the undo path…
    expect(onSendError).not.toHaveBeenCalled();
    // …the words are back in the box for editing…
    expect(m.textarea.value).toBe('second thoughts');
    // …the bar goes quiet…
    expect(m.container.querySelector('[data-testid="undo-send-bar"]')).toBeNull();

    // …and the send NEVER fires, even long past the window.
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    expect(composeMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();

    await m.unmount();
  });

  it('when the window expires the send runs exactly once and onSent carries (text, subject)', async () => {
    composeMock.mockResolvedValue(okCompose('draft-7'));
    sendMock.mockResolvedValue(okSend());
    const onSent = vi.fn();
    const onSendError = vi.fn();
    const onSendUndo = vi.fn();

    const m = await mountComposerAndSend('hello after window', { onSent, onSendError, onSendUndo }, true);

    const { act } = await import('react');
    await act(async () => {
      vi.advanceTimersByTime(UNDO_SEND_COUNTDOWN_SEC * 1000);
    });

    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock).toHaveBeenCalledWith({
      to: [{ email: 'ada@x.com' }],
      subject: 'Re: Hi there',
      bodyText: 'hello after window',
      messageKind: 'chat',
      inReplyTo: 'msg-9',
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith('draft-7');
    // Confirmed send: the host swaps this bubble for the real message.
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledWith('hello after window', 'Re: Hi there');
    expect(onSendError).not.toHaveBeenCalled();
    expect(onSendUndo).not.toHaveBeenCalled();
    // The bar celebrated the real send (its own "Message sent!" pattern),
    // so the box stays clear — no words to hand back.
    expect(m.textarea.value).toBe('');

    await m.unmount();
  });

  it('a failed send after the window takes the honest failure path: bubble withdrawn, words back, one error toast', async () => {
    composeMock.mockResolvedValue(okCompose('draft-f'));
    sendMock.mockResolvedValue({ success: false, data: undefined, error: { message: 'SMTP down' } });
    const onSent = vi.fn();
    const onSendError = vi.fn();
    const onSendUndo = vi.fn();

    const m = await mountComposerAndSend('doomed after window', { onSent, onSendError, onSendUndo }, true);

    const { act } = await import('react');
    await act(async () => {
      vi.advanceTimersByTime(UNDO_SEND_COUNTDOWN_SEC * 1000);
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    // Never celebrated: no success, no onSent.
    expect(onSent).not.toHaveBeenCalled();
    expect(onSendUndo).not.toHaveBeenCalled();
    // The P1-C failure contract: bubble withdrawn for this send…
    expect(onSendError).toHaveBeenCalledTimes(1);
    expect(onSendError).toHaveBeenCalledWith('doomed after window', 'Re: Hi there');
    // …exactly one honest error toast (from the send path itself)…
    const errorToasts = toastMock.mock.calls.filter(
      (call: unknown[]) => (call[0] as { type?: string }).type === 'error',
    );
    expect(errorToasts).toHaveLength(1);
    expect(toastMock).toHaveBeenCalledWith({ text: 'SMTP down', type: 'error' });
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
    // …and the words are back in the box for a retry.
    expect(m.textarea.value).toBe('doomed after window');

    await m.unmount();
  });

  it('Send Now flushes the queued send immediately', async () => {
    composeMock.mockResolvedValue(okCompose('draft-now'));
    sendMock.mockResolvedValue(okSend());
    const onSent = vi.fn();

    const m = await mountComposerAndSend('send it now', { onSent }, true);
    expect(sendMock).not.toHaveBeenCalled();

    const { act } = await import('react');
    const sendNowButton = m.container.querySelector('[data-testid="send-now-button"]') as HTMLButtonElement;
    expect(sendNowButton).not.toBeNull();
    await act(async () => {
      sendNowButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledTimes(1);

    await m.unmount();
  });
});

describe('ThreadComposer without a provider (graceful fallback)', () => {
  it('sends directly with the legacy behavior: immediate API call, success clears', async () => {
    composeMock.mockResolvedValue(okCompose());
    sendMock.mockResolvedValue(okSend());
    const onSent = vi.fn();
    const onSendUndo = vi.fn();

    const m = await mountComposerAndSend('direct send', { onSent, onSendUndo }, false);

    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledWith('direct send', 'Re: Hi there');
    expect(onSendUndo).not.toHaveBeenCalled();
    expect(m.textarea.value).toBe('');

    await m.unmount();
  });

  it('failure in the fallback path still withdraws the bubble and keeps the text', async () => {
    composeMock.mockResolvedValue(okCompose('draft-f2'));
    sendMock.mockResolvedValue({ success: false, data: undefined, error: { message: 'SMTP down' } });
    const onSendError = vi.fn();

    const m = await mountComposerAndSend('direct doomed', { onSendError }, false);

    expect(onSendError).toHaveBeenCalledTimes(1);
    expect(onSendError).toHaveBeenCalledWith('direct doomed', 'Re: Hi there');
    expect(m.textarea.value).toBe('direct doomed');

    await m.unmount();
  });
});

describe('wiring pins (fail on the pre-fix code)', () => {
  function handleSendBody(source: string): string {
    const start = source.indexOf('const handleSend = async');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n  };\n', start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it('ThreadComposer reads the shared undo queue from context', () => {
    expect(composerSource).toContain('useContext(UndoSendContext)');
  });

  it('handleSend queues through the undo manager instead of firing the API directly', () => {
    const body = handleSendBody(composerSource);
    expect(body).toContain('queueSend({');
    // The real send lives ONLY in the post-window callback…
    expect(body).toContain('onSendNow:');
    expect(body).toContain('onSendFailed:');
    // …and the recall path hands the words back via the new callback.
    expect(body).toContain('onSendUndo');
  });

  it('the person page wires the undo recall to the same bubble withdrawal as failures', () => {
    expect(personPageSource).toContain('onSendUndo={withdrawPendingSend}');
    expect(personPageSource).toContain('onSendError={withdrawPendingSend}');
    // Success withdraws only its own bubble (a second send may still be in
    // its recall window) — never a blanket clear on the send path.
    expect(personPageSource).toContain(
      'void refetch().finally(() => withdrawPendingSend(text, subject));',
    );
    expect(personPageSource).not.toContain('void refetch().finally(() => setPendingSends([]))');
  });
});
