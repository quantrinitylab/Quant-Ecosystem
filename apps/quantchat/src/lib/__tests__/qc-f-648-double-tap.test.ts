// QC-F-648 — DoubleTapTracker unit tests (pure helper, no DOM).
import { describe, it, expect } from 'vitest';
import { DoubleTapTracker, DOUBLE_TAP_WINDOW_MS } from '../double-tap';

describe('QC-F-648 DoubleTapTracker', () => {
  it('T1: double pointerup within 300ms / 12px fires exactly once', () => {
    const t = new DoubleTapTracker();
    expect(t.pointerUp('m1', 1, 100, 200, 1000, false)).toBe(false);
    expect(t.pointerUp('m1', 1, 104, 203, 1000 + 150, false)).toBe(true);
    // The tracker is consumed: a third quick tap is a new first tap.
    expect(t.pointerUp('m1', 1, 104, 203, 1000 + 200, false)).toBe(false);
  });

  it('N1: a single pointerup never fires', () => {
    const t = new DoubleTapTracker();
    expect(t.pointerUp('m1', 1, 100, 200, 1000, false)).toBe(false);
  });

  it('N2a: second tap after the window never fires', () => {
    const t = new DoubleTapTracker();
    expect(t.pointerUp('m1', 1, 100, 200, 1000, false)).toBe(false);
    expect(t.pointerUp('m1', 1, 100, 200, 1000 + DOUBLE_TAP_WINDOW_MS + 1, false)).toBe(false);
  });

  it('N2b: second tap moved beyond the threshold never fires', () => {
    const t = new DoubleTapTracker();
    expect(t.pointerUp('m1', 1, 100, 200, 1000, false)).toBe(false);
    expect(t.pointerUp('m1', 1, 130, 200, 1100, false)).toBe(false);
  });

  it('N2c: second tap on a different message never fires', () => {
    const t = new DoubleTapTracker();
    expect(t.pointerUp('m1', 1, 100, 200, 1000, false)).toBe(false);
    expect(t.pointerUp('m2', 1, 100, 200, 1100, false)).toBe(false);
  });

  it('N2d: a different pointer id never completes a double-tap', () => {
    const t = new DoubleTapTracker();
    expect(t.pointerUp('m1', 1, 100, 200, 1000, false)).toBe(false);
    expect(t.pointerUp('m1', 2, 100, 200, 1100, false)).toBe(false);
  });

  it('N3: an interactive tap is ignored and voids a pending first tap', () => {
    const t = new DoubleTapTracker();
    expect(t.pointerUp('m1', 1, 100, 200, 1000, false)).toBe(false);
    // Tap on the Reply button: no fire, and the pending tap is gone.
    expect(t.pointerUp('m1', 1, 100, 200, 1100, true)).toBe(false);
    expect(t.pointerUp('m1', 1, 100, 200, 1200, false)).toBe(false);
  });

  it('N5: scroll/drag (pointermove beyond threshold) cancels the pending tap', () => {
    const t = new DoubleTapTracker();
    t.pointerDown('m1', 1, 100, 200);
    expect(t.pointerUp('m1', 1, 100, 200, 1000, false)).toBe(false);
    t.pointerDown('m1', 1, 100, 200);
    t.pointerMove('m1', 1, 160, 200);
    expect(t.pointerUp('m1', 1, 160, 200, 1100, false)).toBe(false);
  });

  it('cancel() forgets a pending first tap', () => {
    const t = new DoubleTapTracker();
    expect(t.pointerUp('m1', 1, 100, 200, 1000, false)).toBe(false);
    t.cancel('m1');
    expect(t.pointerUp('m1', 1, 100, 200, 1100, false)).toBe(false);
  });
});
