import { describe, it, expect } from 'vitest';
import {
  calculateGridLayout,
  MAX_GROUP_PARTICIPANTS,
  FOCUS_MODE_THRESHOLD,
  type GridMode,
} from '../app/call/gridLayout';

// Unit tests for the responsive group-call grid layout calculator (Task 7.1).

describe('calculateGridLayout', () => {
  it('uses single (full-screen) layout for 1 participant', () => {
    expect(calculateGridLayout(1)).toEqual({ columns: 1, rows: 1, mode: 'single' });
  });

  it('uses split layout for 2 participants', () => {
    expect(calculateGridLayout(2)).toEqual({ columns: 1, rows: 2, mode: 'split' });
  });

  it('uses a 2x2 grid for 3 and 4 participants', () => {
    expect(calculateGridLayout(3)).toEqual({ columns: 2, rows: 2, mode: 'grid' });
    expect(calculateGridLayout(4)).toEqual({ columns: 2, rows: 2, mode: 'grid' });
  });

  it('switches to focus mode for more than 4 participants', () => {
    for (let n = FOCUS_MODE_THRESHOLD + 1; n <= MAX_GROUP_PARTICIPANTS; n++) {
      const layout = calculateGridLayout(n);
      expect(layout.mode).toBe<GridMode>('focus');
      // In focus mode every participant except the focused speaker sits in the row.
      expect(layout.columns).toBe(n - 1);
      expect(layout.rows).toBe(1);
    }
  });

  it('clamps participant counts into the valid 1-8 range', () => {
    // Below range → treated as single.
    expect(calculateGridLayout(0)).toEqual({ columns: 1, rows: 1, mode: 'single' });
    expect(calculateGridLayout(-3)).toEqual({ columns: 1, rows: 1, mode: 'single' });

    // Above range → clamped to the 8-participant focus layout.
    expect(calculateGridLayout(20)).toEqual(calculateGridLayout(MAX_GROUP_PARTICIPANTS));
  });

  it('floors fractional participant counts', () => {
    expect(calculateGridLayout(3.9)).toEqual(calculateGridLayout(3));
  });

  it('always returns positive grid dimensions for the supported range', () => {
    for (let n = 1; n <= MAX_GROUP_PARTICIPANTS; n++) {
      const layout = calculateGridLayout(n);
      expect(layout.columns).toBeGreaterThanOrEqual(1);
      expect(layout.rows).toBeGreaterThanOrEqual(1);
    }
  });
});
