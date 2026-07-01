// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  nextSkipTarget,
  topicJumpTarget,
  isInSkipRange,
  type TimeRange,
  type TopicJump,
} from '../lib/segment-skip';

const ranges: TimeRange[] = [
  { startSec: 0, endSec: 15 }, // intro
  { startSec: 120, endSec: 150 }, // sponsor
];

describe('nextSkipTarget', () => {
  it('returns the end of the skip range the playhead is inside', () => {
    expect(nextSkipTarget(ranges, 5)).toBe(15);
    expect(nextSkipTarget(ranges, 130)).toBe(150);
  });

  it('returns null when the playhead is in playable content', () => {
    expect(nextSkipTarget(ranges, 60)).toBeNull();
    expect(nextSkipTarget(ranges, 200)).toBeNull();
  });

  it('does not re-trigger at the tail of a range (epsilon guard)', () => {
    // 14.9s is within the default 0.25s epsilon of the 15s end -> nothing to skip.
    expect(nextSkipTarget(ranges, 14.9)).toBeNull();
    // Well inside the range still skips.
    expect(nextSkipTarget(ranges, 14.5)).toBe(15);
  });

  it('is safe on bad input', () => {
    expect(nextSkipTarget(ranges, Number.NaN)).toBeNull();
    expect(nextSkipTarget([] as TimeRange[], 5)).toBeNull();
  });
});

describe('isInSkipRange', () => {
  it('detects membership inclusive of the exact start', () => {
    expect(isInSkipRange(ranges, 0)).toBe(true);
    expect(isInSkipRange(ranges, 149.9)).toBe(true);
    expect(isInSkipRange(ranges, 15)).toBe(false); // end is exclusive
    expect(isInSkipRange(ranges, 60)).toBe(false);
  });
});

describe('topicJumpTarget', () => {
  it('seeks to the start of the matched segment', () => {
    const jump: Pick<TopicJump, 'startSec'> = { startSec: 372 };
    expect(topicJumpTarget(jump)).toBe(372);
  });
});
