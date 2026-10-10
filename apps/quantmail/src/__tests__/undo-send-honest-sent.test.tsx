// ============================================================================
// Silent-loss P1 fix — the undo-send bar must only claim "sent" on real success.
//
// Before this fix, `UndoSendManager` marked status='sent' UNCONDITIONALLY
// right after invoking `onSendNow()` — the async send promise was never
// awaited and synchronous errors were silently swallowed by try/catch. The
// toast celebrated while the message never reached anyone (repro 2026-10-10,
// kundan@quantmail.in: quick-reply "Send as: Message" → wait → reload → the
// message is gone, not in the thread, not in /sent).
//
// These tests pin the honest contract:
//   - 'sent' (and its "Message sent!" toast) appears only after the onSendNow
//     promise RESOLVES;
//   - on REJECT the bar goes quiet, the caller's failure hook runs (the words
//     are handed back), and "Message sent!" is never shown.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  UndoSendCountdownBar,
  UndoSendManager,
  UNDO_SEND_COUNTDOWN_SEC,
  type PendingSendItem,
} from '../components/UndoSendCountdownBar';

describe('silent-loss P1: the bar claims "sent" only on real success', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('(a) countdown expiry with a REJECTING send never shows "sent" — the failure hook restores the words', async () => {
    const manager = new UndoSendManager();
    const sendError = new Error('network down');
    const onSendNow = vi.fn(async () => {
      throw sendError;
    });
    const onSendFailed = vi.fn();
    const onUndo = vi.fn();

    manager.queueSend({
      to: 'kundan@quantmail.in',
      body: 'yeh message kabhi nahi gaya',
      onSendNow,
      onSendFailed,
      onUndo,
    });

    // Let the 10s window expire.
    vi.advanceTimersByTime(UNDO_SEND_COUNTDOWN_SEC * 1000);
    expect(onSendNow).toHaveBeenCalledTimes(1);
    // While the rejection settles the bar is in-flight — never 'sent'.
    expect(manager.getState().status).toBe('sending');

    await vi.advanceTimersByTimeAsync(0);

    // The honest outcome: no "sent" celebration, the failure hook ran with
    // the error, the bar went quiet. Undo was NOT involved — the send failed,
    // and onSendFailed owns the restore (not a recall).
    expect(manager.getState().status).toBe('idle');
    expect(manager.getState().status).not.toBe('sent');
    expect(manager.getState().pendingItem).toBeNull();
    expect(onSendFailed).toHaveBeenCalledTimes(1);
    expect(onSendFailed).toHaveBeenCalledWith(sendError);
    expect(onUndo).not.toHaveBeenCalled();

    manager.destroy();
  });

  it('(a2) "Send Now" with a rejecting send never shows "sent" — the undo/restore path hands the words back', async () => {
    const manager = new UndoSendManager();
    const onSendNow = vi.fn(() => Promise.reject(new Error('503 from backend')));
    const wordsRestored = vi.fn();

    manager.queueSend({
      to: 'kundan@quantmail.in',
      body: 'doosra message',
      onSendNow,
      onUndo: wordsRestored,
    });

    manager.sendNow();
    expect(manager.getState().status).toBe('sending');

    await vi.advanceTimersByTimeAsync(0);

    expect(manager.getState().status).toBe('idle');
    expect(manager.getState().status).not.toBe('sent');
    // No dedicated onSendFailed: the existing undo/restore path hands the
    // words back, exactly like a manual undo would.
    expect(wordsRestored).toHaveBeenCalledTimes(1);

    manager.destroy();
  });

  it('a SYNCHRONOUS throw in onSendNow is treated as a rejection, not a success', async () => {
    const manager = new UndoSendManager();
    const onSendNow = vi.fn((): Promise<void> => {
      throw new Error('sync boom');
    });
    const onSendFailed = vi.fn();

    manager.queueSend({ to: 'kundan@quantmail.in', onSendNow, onSendFailed });

    manager.sendNow();
    await vi.advanceTimersByTimeAsync(0);

    expect(onSendNow).toHaveBeenCalledTimes(1);
    expect(manager.getState().status).toBe('idle');
    expect(manager.getState().status).not.toBe('sent');
    expect(onSendFailed).toHaveBeenCalledTimes(1);

    manager.destroy();
  });

  it('undo during the in-flight "sending" phase is a no-op — the recall window is closed', async () => {
    const manager = new UndoSendManager();
    let resolveSend!: () => void;
    const onSendNow = vi.fn(() => new Promise<void>((r) => { resolveSend = r; }));
    const onUndo = vi.fn();

    manager.queueSend({ to: 'kundan@quantmail.in', onSendNow, onUndo });

    vi.advanceTimersByTime(UNDO_SEND_COUNTDOWN_SEC * 1000);
    expect(manager.getState().status).toBe('sending');

    // Mashing undo (or Z) after the window closed must not resurrect the
    // draft for a message that already went out (duplicate re-send risk).
    manager.undoSend();
    expect(onUndo).not.toHaveBeenCalled();
    expect(manager.getState().status).toBe('sending');

    resolveSend();
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.getState().status).toBe('sent');

    manager.destroy();
  });

  it('a stale in-flight promise resolving after a replacement never claims "sent" over the new item', async () => {
    const manager = new UndoSendManager();
    let resolveFirst!: () => void;
    const onSendNow1 = vi.fn(() => new Promise<void>((r) => { resolveFirst = r; }));
    const onSendNow2 = vi.fn(async () => {});

    manager.queueSend({ to: 'first@quantmail.in', onSendNow: onSendNow1 });
    vi.advanceTimersByTime(UNDO_SEND_COUNTDOWN_SEC * 1000);
    expect(manager.getState().status).toBe('sending');

    // A second message queued while the first is in flight takes over the bar.
    manager.queueSend({ to: 'second@quantmail.in', onSendNow: onSendNow2 });
    expect(manager.getState().status).toBe('counting');
    expect(manager.getState().pendingItem?.to).toBe('second@quantmail.in');

    // The stale first send resolving late must not celebrate over the new item.
    resolveFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.getState().status).toBe('counting');
    expect(manager.getState().pendingItem?.to).toBe('second@quantmail.in');

    manager.destroy();
  });

  it('renders the in-flight bar without action buttons for status="sending"', () => {
    const pendingItem: PendingSendItem = {
      id: 'msg-s1',
      to: 'kundan@quantmail.in',
      queuedAt: Date.now(),
    };
    const html = renderToStaticMarkup(
      <UndoSendCountdownBar
        status="sending"
        pendingItem={pendingItem}
        remainingSeconds={0}
        progressPercent={0}
      />,
    );
    expect(html).toContain('data-testid="undo-send-bar"');
    expect(html).toContain('Sending message to');
    expect(html).not.toContain('data-testid="undo-button"');
    expect(html).not.toContain('data-testid="send-now-button"');
    expect(html).not.toContain('Message sent!');
  });
});
