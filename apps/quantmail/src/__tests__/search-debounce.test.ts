// ============================================================================
// QM-FIX-LOOP — search as-you-type debounce semantics.
//
// The /search page fires backend searches off the debounced input so typing
// does not hammer the API per keystroke. These tests pin the framework-free
// timing primitive (lib/debounce) with fake timers: trailing-edge settle,
// immediate flush on explicit submit, cancel on reset/unmount.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebouncedSetter } from '../lib/debounce';

describe('createDebouncedSetter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles the latest value once after the delay (trailing edge)', () => {
    const onSettle = vi.fn();
    const setter = createDebouncedSetter<string>(300, onSettle);

    setter.push('i');
    vi.advanceTimersByTime(100);
    setter.push('in');
    vi.advanceTimersByTime(100);
    setter.push('inv');
    expect(onSettle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith('inv');
    expect(setter.hasPending).toBe(false);
  });

  it('each push restarts the window — rapid typing fires one search', () => {
    const onSettle = vi.fn();
    const setter = createDebouncedSetter<string>(300, onSettle);

    for (let i = 0; i < 10; i += 1) {
      setter.push(`invoice${i}`);
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(300);

    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith('invoice9');
  });

  it('flush() settles the latest value immediately (explicit submit never waits)', () => {
    const onSettle = vi.fn();
    const setter = createDebouncedSetter<string>(300, onSettle);

    setter.push('invoice');
    expect(setter.hasPending).toBe(true);
    setter.flush();

    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith('invoice');

    // The flushed window must not fire again when the timer would have.
    vi.advanceTimersByTime(1000);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(setter.hasPending).toBe(false);
  });

  it('flush() with nothing pending is a no-op', () => {
    const onSettle = vi.fn();
    const setter = createDebouncedSetter<string>(300, onSettle);
    setter.flush();
    expect(onSettle).not.toHaveBeenCalled();
  });

  it('cancel() drops the pending settle (reset / unmount)', () => {
    const onSettle = vi.fn();
    const setter = createDebouncedSetter<string>(300, onSettle);

    setter.push('invoice');
    setter.cancel();
    expect(setter.hasPending).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(onSettle).not.toHaveBeenCalled();
  });

  it('works after a flush/cancel cycle — the setter is reusable', () => {
    const onSettle = vi.fn();
    const setter = createDebouncedSetter<string>(300, onSettle);

    setter.push('a');
    setter.flush();
    setter.push('b');
    vi.advanceTimersByTime(300);

    expect(onSettle).toHaveBeenCalledTimes(2);
    expect(onSettle).toHaveBeenNthCalledWith(1, 'a');
    expect(onSettle).toHaveBeenNthCalledWith(2, 'b');
  });
});
