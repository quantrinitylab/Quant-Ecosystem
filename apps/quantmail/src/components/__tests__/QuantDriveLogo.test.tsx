// @vitest-environment node
// QuantDrive mascot — blink scheduler, accessibility, event wiring.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';

import {
  QuantDriveLogo,
  blinkPhase,
  DRIVE_UPLOAD_COMPLETE_EVENT,
  type BlinkState,
} from '../QuantDriveLogo';

function freshBlink(nextAt = 10): BlinkState {
  return { nextBlinkAt: nextAt, blinkStart: -1, successAt: 0 };
}

describe('blinkPhase (genuine eye-geometry scheduler)', () => {
  it('returns 0 (open) under reduced motion, always', () => {
    const b = freshBlink(0);
    expect(blinkPhase(b, 999, true)).toBe(0);
    expect(b.blinkStart).toBe(-1);
  });

  it('stays open before the scheduled blink', () => {
    const b = freshBlink(10);
    expect(blinkPhase(b, 5, false)).toBe(0);
    expect(b.blinkStart).toBe(-1);
  });

  it('progresses close → hold → open and resets', () => {
    const b = freshBlink(10);
    // Trigger at t=10
    expect(blinkPhase(b, 10, false)).toBe(0);
    expect(b.blinkStart).toBe(10);
    // Closing (0.11s)
    const mid = blinkPhase(b, 10.05, false);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    // Hold (0.07s)
    expect(blinkPhase(b, 10.15, false)).toBe(1);
    // Opening (0.14s)
    const opening = blinkPhase(b, 10.25, false);
    expect(opening).toBeGreaterThan(0);
    expect(opening).toBeLessThan(1);
    // Done → back to open, blinkStart cleared
    expect(blinkPhase(b, 10.5, false)).toBe(0);
    expect(b.blinkStart).toBe(-1);
  });

  it('schedules the next blink with a randomised idle interval', () => {
    const b = freshBlink(10);
    blinkPhase(b, 10, false);
    // Complete the blink
    blinkPhase(b, 11, false);
    // Next blink is blink duration + 2.5–6.5s in the future
    expect(b.nextBlinkAt).toBeGreaterThan(10 + 0.32 + 2.5);
    expect(b.nextBlinkAt).toBeLessThanOrEqual(10 + 0.32 + 6.5 + 0.01);
  });

  it('never reports a phase outside [0, 1]', () => {
    const b = freshBlink(0);
    for (let t = 0; t < 20; t += 0.01) {
      const p = blinkPhase(b, t, false);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe('QuantDriveLogo component', () => {
  it('renders an accessible image with the Drive title', () => {
    const html = renderToStaticMarkup(createElement(QuantDriveLogo, { size: 32 }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="QuantDrive"');
    expect(html).toContain('<canvas');
  });

  it('exposes the honest upload-complete event name', () => {
    expect(DRIVE_UPLOAD_COMPLETE_EVENT).toBe('quant:drive:upload-complete');
  });
});
