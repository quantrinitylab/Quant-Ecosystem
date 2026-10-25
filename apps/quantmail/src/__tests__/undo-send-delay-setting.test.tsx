import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  UndoSendCountdownBar,
  UndoSendManager,
  type PendingSendItem,
} from '../components/UndoSendCountdownBar';

const item = (overrides: Partial<PendingSendItem> = {}): PendingSendItem => ({
  id: 'msg-delay',
  to: 'a@quantmail.in',
  subject: 'Delay',
  body: 'Body',
  queuedAt: Date.now(),
  ...overrides,
});

describe('undo-send delay setting drives the countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('a 30s manager counts 30, and the state names the window it is running', () => {
    const manager = new UndoSendManager({ countdownDurationSec: 30 });
    manager.queueSend({ ...item(), onSendNow: vi.fn(), onUndo: vi.fn() });
    expect(manager.getState().status).toBe('counting');
    expect(manager.getState().remainingSeconds).toBe(30);
    expect(manager.getState().countdownDurationSec).toBe(30);

    vi.advanceTimersByTime(10000);
    expect(manager.getState().remainingSeconds).toBe(20);
    manager.destroy();
  });

  it('a settings change while idle re-seeds the next send', () => {
    const manager = new UndoSendManager({ countdownDurationSec: 10 });
    manager.setCountdownDurationSec(5);
    expect(manager.getState().remainingSeconds).toBe(5);
    expect(manager.getState().countdownDurationSec).toBe(5);

    manager.queueSend({ ...item(), onSendNow: vi.fn(), onUndo: vi.fn() });
    expect(manager.getState().remainingSeconds).toBe(5);
    manager.destroy();
  });

  it('a settings change mid-countdown leaves the running window alone and moves only the next send', async () => {
    const manager = new UndoSendManager({ countdownDurationSec: 10 });
    const onSendNow = vi.fn().mockResolvedValue(undefined);
    manager.queueSend({ ...item(), onSendNow, onUndo: vi.fn() });

    vi.advanceTimersByTime(3000);
    expect(manager.getState().remainingSeconds).toBe(7);

    // The user picks 30s while 7s remain: the bar must not rewrite the
    // promise already on screen, and the active window stays 10.
    manager.setCountdownDurationSec(30);
    expect(manager.getState().remainingSeconds).toBe(7);
    expect(manager.getState().countdownDurationSec).toBe(10);

    // Let the window close and the send flush, then queue again: the new
    // send counts the new setting.
    vi.advanceTimersByTime(7000);
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.getState().status).toBe('sent');
    vi.advanceTimersByTime(2000);
    expect(manager.getState().status).toBe('idle');
    expect(manager.getState().countdownDurationSec).toBe(30);

    manager.queueSend({ ...item(), onSendNow, onUndo: vi.fn() });
    expect(manager.getState().remainingSeconds).toBe(30);
    expect(manager.getState().countdownDurationSec).toBe(30);
    manager.destroy();
  });

  it('the bar renders the window as the progressbar scale, not a hardcoded 10', () => {
    const html = renderToStaticMarkup(
      <UndoSendCountdownBar
        status="counting"
        pendingItem={item()}
        remainingSeconds={20}
        progressPercent={66}
        countdownDurationSec={30}
      />,
    );
    expect(html).toContain('aria-valuemax="30"');
    expect(html).toContain('aria-valuenow="20"');
    expect(html).toContain('(20s)');
  });

  it('the bar still defaults to the 10s scale with no window supplied', () => {
    const html = renderToStaticMarkup(
      <UndoSendCountdownBar
        status="counting"
        pendingItem={item()}
        remainingSeconds={10}
        progressPercent={100}
      />,
    );
    expect(html).toContain('aria-valuemax="10"');
  });
});
