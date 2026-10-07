import { describe, it, expect, vi } from 'vitest';
import { NotificationBatcher, type BatchableNotification } from '../lib/notification-batcher';

function makeNotification(overrides: Partial<BatchableNotification> = {}): BatchableNotification {
  return {
    userId: 'u1',
    category: 'REELS',
    title: 'New like',
    body: 'someone liked your reel',
    priority: 'normal',
    ...overrides,
  };
}

describe('NotificationBatcher (Task 10.7)', () => {
  it('sends high-priority notifications immediately, never batched', async () => {
    const send = vi.fn();
    const batcher = new NotificationBatcher(send);
    await batcher.enqueue(makeNotification({ priority: 'high', category: 'CALLS' }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(batcher.openWindowCount).toBe(0);
  });

  it('does not send a single non-urgent notification until the window flushes', async () => {
    const send = vi.fn();
    const noop = (() => 0) as unknown as typeof setTimeout;
    const batcher = new NotificationBatcher(send, {
      setTimeoutFn: noop,
      clearTimeoutFn: () => undefined,
    });
    await batcher.enqueue(makeNotification());
    expect(send).not.toHaveBeenCalled();
    expect(batcher.openWindowCount).toBe(1);
  });

  it('collapses >5 non-urgent notifications into a single summary', async () => {
    const send = vi.fn();
    const noop = (() => 0) as unknown as typeof setTimeout;
    const batcher = new NotificationBatcher(send, {
      setTimeoutFn: noop,
      clearTimeoutFn: () => undefined,
    });
    // 6 notifications => exceeds threshold of 5 => one summary send.
    for (let i = 0; i < 6; i += 1) {
      await batcher.enqueue(makeNotification({ body: `like ${i}` }));
    }
    expect(send).toHaveBeenCalledTimes(1);
    const summary = send.mock.calls[0]![0] as BatchableNotification;
    expect(summary.title).toContain('6 new');
    expect(batcher.openWindowCount).toBe(0);
  });

  it('flushes a single buffered notification as-is when the timer fires', async () => {
    const send = vi.fn();
    let captured: (() => void) | null = null;
    const batcher = new NotificationBatcher(send, {
      setTimeoutFn: ((fn: () => void) => {
        captured = fn;
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout,
      clearTimeoutFn: () => undefined,
    });
    await batcher.enqueue(makeNotification({ body: 'solo' }));
    expect(captured).toBeTypeOf('function');
    captured!();
    // allow the async flush microtask to settle
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0]![0] as BatchableNotification).body).toBe('solo');
  });

  it('keeps windows independent per user+category', async () => {
    const send = vi.fn();
    const noop = (() => 0) as unknown as typeof setTimeout;
    const batcher = new NotificationBatcher(send, {
      setTimeoutFn: noop,
      clearTimeoutFn: () => undefined,
    });
    await batcher.enqueue(makeNotification({ category: 'REELS' }));
    await batcher.enqueue(makeNotification({ category: 'STORIES' }));
    expect(batcher.openWindowCount).toBe(2);
  });
});
