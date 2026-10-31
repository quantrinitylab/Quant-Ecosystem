// fix/qm-contacts-sender-hovercard — portal viewport clamp, pure function.
//
// No DOM needed: the clamp is what keeps the card on-screen on small
// phones, so it is tested directly at every edge.

import { describe, expect, it } from 'vitest';
import { clampHovercardPosition } from '../components/SenderHovercard';

describe('clampHovercardPosition', () => {
  it('places the card below the trigger when there is room', () => {
    expect(
      clampHovercardPosition({
        triggerLeft: 100,
        triggerTop: 100,
        triggerBottom: 120,
        viewportWidth: 1024,
        viewportHeight: 768,
      }),
    ).toEqual({ top: 128, left: 100 });
  });

  it('flips above the trigger when there is no room below', () => {
    const pos = clampHovercardPosition({
      triggerLeft: 100,
      triggerTop: 700,
      triggerBottom: 720,
      viewportWidth: 1024,
      viewportHeight: 768,
    });
    expect(pos.top).toBe(700 - 8 - 340);
    expect(pos.left).toBe(100);
  });

  it('clamps the left edge inside a narrow viewport', () => {
    const pos = clampHovercardPosition({
      triggerLeft: 300,
      triggerTop: 50,
      triggerBottom: 66,
      viewportWidth: 360,
      viewportHeight: 700,
    });
    expect(pos.left).toBe(360 - 320 - 8);
    expect(pos.left + 320).toBeLessThanOrEqual(360);
  });

  it('never goes left of the margin, even when the viewport is narrower than the card', () => {
    const pos = clampHovercardPosition({
      triggerLeft: 300,
      triggerTop: 50,
      triggerBottom: 66,
      viewportWidth: 320,
      viewportHeight: 700,
    });
    expect(pos.left).toBe(8);
  });

  it('pins to the top margin when the viewport is shorter than the card (the wrapper scrolls from there)', () => {
    const pos = clampHovercardPosition({
      triggerLeft: 10,
      triggerTop: 250,
      triggerBottom: 266,
      viewportWidth: 320,
      viewportHeight: 300,
    });
    expect(pos.top).toBe(8);
    expect(pos.left).toBe(8);
  });
});
