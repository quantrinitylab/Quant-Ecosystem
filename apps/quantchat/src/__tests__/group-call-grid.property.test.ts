import { describe, it, expect } from 'vitest';
import {
  calculateGridLayout,
  MAX_GROUP_PARTICIPANTS,
  FOCUS_MODE_THRESHOLD,
} from '../app/call/gridLayout';

// Feature: quantchat-mega-upgrade, Property 15: Grid layout adapts to participant count, focus mode when N>4.
//
// Validates: Requirements 15.1 / 15.4 (responsive 1-8 participant grid, focus mode > 4).
//
// Property: For any participant count N (1-8), the grid layout calculator produces a
// valid layout (columns >= 1, rows >= 1), switching to focus mode when the effective N > 4.
// For N <= 1 the mode is 'single', N === 2 is 'split', N in 3..4 is 'grid'. Out-of-range
// inputs clamp into [1, MAX_GROUP_PARTICIPANTS].

/** Deterministic, seedable PRNG (mulberry32) so failures are reproducible. */
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

/** Compute the effective (clamped + floored) participant count the calculator uses. */
function effectiveCount(raw: number): number {
  return Math.max(1, Math.min(MAX_GROUP_PARTICIPANTS, Math.floor(raw)));
}

/** Assert every invariant for the layout produced from a raw participant count. */
function assertValidLayout(raw: number): void {
  const layout = calculateGridLayout(raw);
  const n = effectiveCount(raw);

  // Dimensions are always positive.
  expect(layout.columns, `columns for raw=${raw}`).toBeGreaterThanOrEqual(1);
  expect(layout.rows, `rows for raw=${raw}`).toBeGreaterThanOrEqual(1);

  // focus mode iff effective N > threshold (4).
  expect(layout.mode === 'focus', `focus iff N>${FOCUS_MODE_THRESHOLD} for n=${n}`).toBe(
    n > FOCUS_MODE_THRESHOLD,
  );

  // Mode mapping for the non-focus range.
  if (n <= 1) {
    expect(layout.mode, `single for n=${n}`).toBe('single');
  } else if (n === 2) {
    expect(layout.mode, `split for n=${n}`).toBe('split');
  } else if (n <= FOCUS_MODE_THRESHOLD) {
    expect(layout.mode, `grid for n=${n}`).toBe('grid');
  } else {
    expect(layout.mode, `focus for n=${n}`).toBe('focus');
    // In focus mode every participant except the focused speaker sits in the row.
    expect(layout.columns).toBe(n - 1);
    expect(layout.rows).toBe(1);
  }
}

describe('calculateGridLayout property (Property 15)', () => {
  it('produces valid layouts for N in 1..8 across >=100 seeded cases', () => {
    const rand = mulberry32(0x15911d);
    for (let i = 0; i < 200; i++) {
      // N in the supported 1..8 range.
      const n = 1 + Math.floor(rand() * MAX_GROUP_PARTICIPANTS);
      assertValidLayout(n);
    }
  });

  it('clamps out-of-range inputs (N<1 and N>8) into the valid range', () => {
    const rand = mulberry32(0xc1a3bd);
    for (let i = 0; i < 100; i++) {
      if (i % 2 === 0) {
        // Below range -> behaves like single.
        const low = -Math.floor(rand() * 50);
        expect(calculateGridLayout(low)).toEqual({ columns: 1, rows: 1, mode: 'single' });
      } else {
        // Above range -> clamped to the 8-participant focus layout.
        const high = MAX_GROUP_PARTICIPANTS + 1 + Math.floor(rand() * 50);
        expect(calculateGridLayout(high)).toEqual(calculateGridLayout(MAX_GROUP_PARTICIPANTS));
      }
    }
  });

  it('covers every supported count deterministically', () => {
    for (let n = 1; n <= MAX_GROUP_PARTICIPANTS; n++) {
      assertValidLayout(n);
    }
  });
});
