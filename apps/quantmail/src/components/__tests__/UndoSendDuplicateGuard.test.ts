// @vitest-environment jsdom
// ============================================================================
// P0 double-send guard: UndoSendManager.queueSend must dedupe identical sends
// inside the recall window.
//
// Before this fix, a second Send press during the 10s recall window (double
// click, Cmd+Enter x2, or restore-badge -> Send) ran queueSend again, which
// flushed the first send immediately AND queued the duplicate -> the identical
// email was delivered twice, 10s apart.
//
// These tests pin the guard contract:
//   (1) two identical queueSends inside the window -> exactly one delivery;
//   (2) a genuinely different second email -> first flushed immediately,
//       second queued (flush+replace preserved for real replacements);
//   (3) Undo inside the window -> zero delivery;
//   (4) countdown expiry -> exactly one delivery (no re-fire on extra time);
//   (5) identical content AFTER an undo (idle) -> requeue is allowed again.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UndoSendManager } from '../UndoSendCountdownBar';

function makeOptions(to = 'a@x.com', subject = 's', body = 'b') {
  const onSendNow = vi.fn(async () => {});
  return {
    onSendNow,
    options: { to, subject, body, onSendNow },
  };
}

describe('UndoSendManager duplicate-send guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('two identical queueSends inside the window -> exactly one delivery', () => {
    const mgr = new UndoSendManager({ countdownDurationSec: 10, sentDisplayDurationMs: 2000 });
    const { onSendNow, options } = makeOptions();
    const duplicateSendNow = vi.fn(async () => {});

    mgr.queueSend(options);
    mgr.queueSend({ ...options, onSendNow: duplicateSendNow });

    vi.advanceTimersByTime(11_000);

    expect(onSendNow).toHaveBeenCalledTimes(1);
    expect(duplicateSendNow).not.toHaveBeenCalled();
  });

  it('a different second email -> first flushed immediately, second queued', () => {
    const mgr = new UndoSendManager({ countdownDurationSec: 10, sentDisplayDurationMs: 2000 });
    const first = makeOptions('a@x.com', 'first', 'body-one');
    const second = makeOptions('a@x.com', 'second', 'body-two');

    mgr.queueSend(first.options);
    mgr.queueSend(second.options);

    // flush+replace: the first send goes out immediately on replacement
    expect(first.onSendNow).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(11_000);

    expect(first.onSendNow).toHaveBeenCalledTimes(1);
    expect(second.onSendNow).toHaveBeenCalledTimes(1);
  });

  it('undo inside the window -> zero delivery', () => {
    const mgr = new UndoSendManager({ countdownDurationSec: 10, sentDisplayDurationMs: 2000 });
    const { onSendNow, options } = makeOptions();

    mgr.queueSend(options);
    mgr.undoSend();
    vi.advanceTimersByTime(11_000);

    expect(onSendNow).not.toHaveBeenCalled();
  });

  it('countdown expiry -> exactly one delivery, no re-fire on extra time', () => {
    const mgr = new UndoSendManager({ countdownDurationSec: 10, sentDisplayDurationMs: 2000 });
    const { onSendNow, options } = makeOptions();

    mgr.queueSend(options);
    vi.advanceTimersByTime(11_000);
    expect(onSendNow).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(120_000);
    expect(onSendNow).toHaveBeenCalledTimes(1);
  });

  it('identical content after an undo (idle) -> requeue is allowed again', () => {
    const mgr = new UndoSendManager({ countdownDurationSec: 10, sentDisplayDurationMs: 2000 });
    const first = makeOptions();
    const second = makeOptions();

    mgr.queueSend(first.options);
    mgr.undoSend();
    mgr.queueSend(second.options);

    vi.advanceTimersByTime(11_000);

    expect(first.onSendNow).not.toHaveBeenCalled();
    expect(second.onSendNow).toHaveBeenCalledTimes(1);
  });

  // Scheduled-send identity: scheduledAt joins the duplicate-guard.
  // (6) same content + SAME scheduledAt inside the window -> still a no-op
  //     (the scheduled send is never double-scheduled);
  // (7) same content + DIFFERENT scheduledAt -> a genuinely different send:
  //     first is flushed immediately (flush+replace), second runs after its
  //     own window — both delivered exactly once.
  it('identical content + same scheduledAt inside the window -> still no duplicate', () => {
    const mgr = new UndoSendManager({ countdownDurationSec: 10, sentDisplayDurationMs: 2000 });
    const at = new Date(Date.now() + 3_600_000).toISOString();
    const first = makeOptions();
    const second = makeOptions();
    const duplicateSendNow = vi.fn(async () => {});

    mgr.queueSend({ ...first.options, scheduledAt: at });
    mgr.queueSend({ ...second.options, scheduledAt: at, onSendNow: duplicateSendNow });

    vi.advanceTimersByTime(11_000);

    expect(first.onSendNow).toHaveBeenCalledTimes(1);
    expect(duplicateSendNow).not.toHaveBeenCalled();
  });

  it('identical content + different scheduledAt -> both delivered exactly once', () => {
    const mgr = new UndoSendManager({ countdownDurationSec: 10, sentDisplayDurationMs: 2000 });
    const first = makeOptions();
    const second = makeOptions();

    mgr.queueSend({
      ...first.options,
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    mgr.queueSend({
      ...second.options,
      scheduledAt: new Date(Date.now() + 7_200_000).toISOString(),
    });

    // flush+replace: the first send goes out immediately on replacement.
    expect(first.onSendNow).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(11_000);

    expect(first.onSendNow).toHaveBeenCalledTimes(1);
    expect(second.onSendNow).toHaveBeenCalledTimes(1);
  });

  it('a scheduled send carries successLabel + scheduledAt through queueSend', () => {
    const mgr = new UndoSendManager({ countdownDurationSec: 10, sentDisplayDurationMs: 2000 });
    const at = new Date(Date.now() + 3_600_000).toISOString();
    const { options } = makeOptions();

    mgr.queueSend({ ...options, scheduledAt: at, successLabel: 'Email scheduled!' });

    const state = mgr.getState();
    expect(state.pendingItem?.scheduledAt).toBe(at);
    expect(state.pendingItem?.successLabel).toBe('Email scheduled!');
  });
});
