// ============================================================================
// QM-UIUX-087 — regression tests: quick reply must get the undo safety net.
//
// Before this fix, `handleSendReply` in ConversationalThreadView called
// `apiClient.replyToEmail` the instant Send was pressed — the reply was gone
// before its success toast faded, while composer sends get the shared
// 10-second undo window (`UndoSendManager` / `queueSend`). The fix routes
// quick reply through that same queue: the API call lives in `onSendNow`
// and fires only when the countdown closes; `onUndo` restores the words to
// the reply bar with nothing sent.
//
// Two layers, following this repo's established test conventions:
//  1. Behavioural: the REAL UndoSendManager driven exactly as the fixed
//     handler drives it (same queueSend shape — deferred send spy, restore
//     spy) under fake timers, as in undo-send-bar.test.tsx.
//  2. Wiring pins: readFileSync source assertions on the real component,
//     as in the other QM-UIUX honesty suites — these are what fail on the
//     pre-fix code, where the handler fired the API directly.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  UndoSendManager,
  UNDO_SEND_COUNTDOWN_SEC,
} from '../components/UndoSendCountdownBar';

const componentSource = readFileSync(
  fileURLToPath(new URL('../components/ConversationalThreadView.tsx', import.meta.url)),
  'utf8',
);

/** The `handleSendReply` useCallback body, from its declaration to its dep array. */
function handleSendReplyBody(source: string): string {
  const start = source.indexOf('const handleSendReply = useCallback(');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n  ]);', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('QM-UIUX-087 — quick-reply send behaviour through the shared undo queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('(a) queueing a quick reply enters the undo window — the send is NOT finalized immediately', () => {
    const manager = new UndoSendManager();
    const performSend = vi.fn(async () => {});
    const restoreToReplyBar = vi.fn();

    // Exactly the call the fixed handleSendReply makes on Send.
    manager.queueSend({
      to: 'asha@quantmail.in',
      body: 'Pakka, kal 5 baje milte hain',
      onSendNow: performSend,
      onUndo: restoreToReplyBar,
    });

    const state = manager.getState();
    expect(state.status).toBe('counting');
    expect(state.remainingSeconds).toBe(UNDO_SEND_COUNTDOWN_SEC);
    expect(state.pendingItem?.to).toBe('asha@quantmail.in');
    expect(performSend).not.toHaveBeenCalled();
    expect(restoreToReplyBar).not.toHaveBeenCalled();

    // Half-way through the window the send still has not fired.
    vi.advanceTimersByTime(5000);
    expect(manager.getState().status).toBe('counting');
    expect(performSend).not.toHaveBeenCalled();

    manager.destroy();
  });

  it('(b) Undo inside the window prevents the send and restores the text', () => {
    const manager = new UndoSendManager();
    const performSend = vi.fn(async () => {});
    const restoreToReplyBar = vi.fn();

    manager.queueSend({
      to: 'asha@quantmail.in',
      body: 'Pakka, kal 5 baje milte hain',
      onSendNow: performSend,
      onUndo: restoreToReplyBar,
    });

    vi.advanceTimersByTime(3000);
    manager.undoSend();

    // Restore fires (the words go back to the reply bar)…
    expect(restoreToReplyBar).toHaveBeenCalledTimes(1);
    expect(manager.getState().status).toBe('idle');
    expect(manager.getState().pendingItem).toBeNull();

    // …and the send NEVER fires, even long past the window.
    vi.advanceTimersByTime(15000);
    expect(performSend).not.toHaveBeenCalled();

    manager.destroy();
  });

  it('(c) when the window expires the send completes exactly once', () => {
    const manager = new UndoSendManager();
    const performSend = vi.fn(async () => {});
    const restoreToReplyBar = vi.fn();

    manager.queueSend({
      to: 'asha@quantmail.in',
      body: 'Pakka, kal 5 baje milte hain',
      onSendNow: performSend,
      onUndo: restoreToReplyBar,
    });

    vi.advanceTimersByTime(UNDO_SEND_COUNTDOWN_SEC * 1000);
    expect(performSend).toHaveBeenCalledTimes(1);
    expect(restoreToReplyBar).not.toHaveBeenCalled();
    expect(manager.getState().status).toBe('sent');

    // No double-fire later.
    vi.advanceTimersByTime(10000);
    expect(performSend).toHaveBeenCalledTimes(1);

    manager.destroy();
  });
});

describe('QM-UIUX-087 — wiring pins on ConversationalThreadView', () => {
  it('the thread view takes the shared undo queue from UndoSendCountdownBar', () => {
    expect(componentSource).toContain(
      "import { useUndoSend } from './UndoSendCountdownBar';",
    );
    expect(componentSource).toContain('const { queueSend } = useUndoSend();');
  });

  it('handleSendReply queues through queueSend with a deferred send and an undo restore', () => {
    const body = handleSendReplyBody(componentSource);
    expect(body).toContain('queueSend({');
    expect(body).toContain('onSendNow: performSend');
    expect(body).toContain('onUndo: () => {');
    // Undo hands the words back to the bar.
    const onUndoStart = body.indexOf('onUndo: () => {');
    expect(body.slice(onUndoStart)).toContain('restoreToReplyBar()');
  });

  it('the reply API is called in exactly one place — inside the deferred performSend, never directly on Send', () => {
    const occurrences = componentSource.split('apiClient.replyToEmail(').length - 1;
    expect(occurrences).toBe(1);

    const performSendStart = componentSource.indexOf('const performSend = async () => {');
    const queueSendCall = componentSource.indexOf('queueSend({', performSendStart);
    const apiCall = componentSource.indexOf('apiClient.replyToEmail(');
    expect(performSendStart).toBeGreaterThan(-1);
    expect(apiCall).toBeGreaterThan(performSendStart);
    expect(apiCall).toBeLessThan(queueSendCall);
  });

  it('the box clears on Send and only Undo / failure restore it (no silent text loss)', () => {
    const body = handleSendReplyBody(componentSource);
    // Cleared at queue time, after the queueSend call.
    const queueSendCall = body.indexOf('queueSend({');
    const clearAt = body.indexOf("setQuickReplyText('');", queueSendCall);
    expect(clearAt).toBeGreaterThan(queueSendCall);
    // The deferred send's failure paths restore the words.
    const performSend = body.slice(body.indexOf('const performSend = async () => {'), queueSendCall);
    expect(performSend).toContain('restoreToReplyBar()');
  });
});
