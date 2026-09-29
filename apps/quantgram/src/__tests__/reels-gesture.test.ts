import { describe, expect, it } from 'vitest';
import { classifyVerticalSwipe, isDoubleTap, type GesturePoint } from '../features/reels/gesture';

describe('QuantGram reel gestures', () => {
  it('snaps to the next reel on a deliberate upward swipe', () => {
    expect(classifyVerticalSwipe({ x: 180, y: 520, at: 0 }, { x: 188, y: 410, at: 180 }, 900)).toBe(
      'next',
    );
  });

  it('snaps to the previous reel on a deliberate downward swipe', () => {
    expect(classifyVerticalSwipe({ x: 180, y: 410, at: 0 }, { x: 188, y: 520, at: 180 }, 900)).toBe(
      'previous',
    );
  });

  it('ignores a short vertical movement', () => {
    expect(
      classifyVerticalSwipe({ x: 180, y: 520, at: 0 }, { x: 180, y: 450, at: 180 }, 900),
    ).toBeNull();
  });

  it('ignores horizontal and diagonal-dominant movement', () => {
    expect(
      classifyVerticalSwipe({ x: 80, y: 420, at: 0 }, { x: 260, y: 600, at: 180 }, 900),
    ).toBeNull();
  });

  it('caps the distance threshold on very tall viewports', () => {
    expect(
      classifyVerticalSwipe({ x: 180, y: 520, at: 0 }, { x: 180, y: 410, at: 180 }, 2400),
    ).toBeNull();
    expect(
      classifyVerticalSwipe({ x: 180, y: 520, at: 0 }, { x: 180, y: 400, at: 180 }, 2400),
    ).toBe('next');
  });

  it('recognizes a nearby second tap inside the time window', () => {
    const first: GesturePoint = { x: 120, y: 240, at: 1_000 };
    expect(isDoubleTap(first, { x: 145, y: 250, at: 1_250 })).toBe(true);
  });

  it('rejects a late or spatially distant second tap', () => {
    const first: GesturePoint = { x: 120, y: 240, at: 1_000 };
    expect(isDoubleTap(first, { x: 120, y: 240, at: 1_281 })).toBe(false);
    expect(isDoubleTap(first, { x: 180, y: 240, at: 1_250 })).toBe(false);
  });
});
