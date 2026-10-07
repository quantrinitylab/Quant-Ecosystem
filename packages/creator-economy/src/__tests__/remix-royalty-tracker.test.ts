import { describe, it, expect, beforeEach } from 'vitest';
import { RemixRoyaltyTracker } from '../monetization/remix-royalty-tracker.js';

describe('RemixRoyaltyTracker.getChain', () => {
  let tracker: RemixRoyaltyTracker;

  beforeEach(() => {
    tracker = new RemixRoyaltyTracker();
  });

  it('builds a linear remix chain', () => {
    tracker.recordRemix('b', 'a', 'remixer-1');
    tracker.recordRemix('c', 'b', 'remixer-2');
    expect(tracker.getChain('a')).toEqual(['a', 'b', 'c']);
  });

  it('terminates on a cyclic remix graph without infinite recursion', () => {
    tracker.recordRemix('b', 'a', 'remixer-1');
    tracker.recordRemix('a', 'b', 'remixer-2'); // cycle: a -> b -> a
    const chain = tracker.getChain('a');
    expect(chain).toContain('a');
    expect(chain).toContain('b');
    // Each node appears once; no runaway growth.
    expect(new Set(chain).size).toBe(chain.length);
  });

  it('terminates on a self-loop', () => {
    tracker.recordRemix('a', 'a', 'remixer-1'); // self loop
    const chain = tracker.getChain('a');
    expect(chain).toEqual(['a']);
  });
});
