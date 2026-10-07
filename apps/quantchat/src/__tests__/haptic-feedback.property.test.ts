// ============================================================================
// QuantChat - Haptic Feedback Property Tests (Task 15.6)
//
// Property-based tests for the haptic-like tap feedback applied to interactive
// elements. The feedback is a brief scale-down transform that completes in
// 50ms, mimicking a physical tap. The config lives in:
//   - lib/motion-tokens.ts        -> hapticTap = { scale: 0.95, transition: { duration: 0.05 } }
//   - components/ui/HapticButton  -> useHapticProps(tapScale) -> { whileTap, whileHover }
//
// Generators are seeded and deterministic (mulberry32) and run over >= 100
// generated cases.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { hapticTap } from '../lib/motion-tokens';
import { useHapticProps } from '../components/ui/HapticButton';

// ---------------------------------------------------------------------------
// Seeded deterministic PRNG (mulberry32) so failures are reproducible.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CASES = 200; // > 100 generated cases

/** The required tap feedback duration in seconds (50ms). */
const TAP_DURATION_S = 0.05;

type WhileTap = { scale: number; transition: { duration: number } };

describe('Haptic feedback property tests (Property 40)', () => {
  // Feature: quantchat-mega-upgrade, Property 40: interactive elements apply a 50ms scale transform on tap.
  it('useHapticProps(scale) always yields a whileTap shrink (0<scale<1) with a 50ms transition', () => {
    const rng = mulberry32(0x40_0000);
    for (let n = 0; n < CASES; n++) {
      // Any reasonable tap scale a developer might pass: a shrink in (0, 1).
      // 0.5 .. 0.999 covers a sensible "press-down" range.
      const tapScale = 0.5 + rng() * 0.499;

      const props = useHapticProps(tapScale);
      const whileTap = props.whileTap as WhileTap;

      // It is a numeric scale that shrinks the element (haptic-like press).
      expect(typeof whileTap.scale).toBe('number');
      expect(Number.isFinite(whileTap.scale)).toBe(true);
      expect(whileTap.scale).toBe(tapScale);
      expect(whileTap.scale).toBeGreaterThan(0);
      expect(whileTap.scale).toBeLessThan(1);

      // The animation completes in exactly 50ms.
      expect(whileTap.transition.duration).toBe(TAP_DURATION_S);
    }
  });

  // Feature: quantchat-mega-upgrade, Property 40: interactive elements apply a 50ms scale transform on tap.
  it('the shared hapticTap token is a sub-1 shrink completing in exactly 50ms', () => {
    expect(typeof hapticTap.scale).toBe('number');
    expect(hapticTap.scale).toBeGreaterThan(0);
    expect(hapticTap.scale).toBeLessThan(1);
    expect(hapticTap.transition.duration).toBe(TAP_DURATION_S);
  });

  // Feature: quantchat-mega-upgrade, Property 40: interactive elements apply a 50ms scale transform on tap.
  it('the default tapScale is 0.95 and still completes in 50ms', () => {
    const props = useHapticProps();
    const whileTap = props.whileTap as WhileTap;
    expect(whileTap.scale).toBe(0.95);
    expect(whileTap.transition.duration).toBe(TAP_DURATION_S);
    // The default matches the shared hapticTap token.
    expect(whileTap.scale).toBe(hapticTap.scale);
  });
});
