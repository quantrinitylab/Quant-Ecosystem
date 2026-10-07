// ============================================================================
// QuantChat - Micro-Interaction / Addiction-Loop Engine Property Tests
// (Task 11.14)
//
// Property-based tests for the gamification correctness properties:
//   - Property 25: streak calculation invariant
//   - Property 26: milestone triggers (7/30/100/365)
//   - Property 27: variable-ratio reward rate bounds (1-in-15 .. 1-in-5)
//   - Property 28: FOMO ring on unviewed stories
//   - Property 29: streak urgency indicator (< 4h)
//   - Property 30: XP awards match action-point mapping
//
// Generators are seeded and deterministic (mulberry32). Each property runs
// over >= 100 generated cases.
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import {
  XP_MAP,
  xpForAction,
  isMilestone,
  MILESTONE_DAYS,
  calculateStreakCount,
  dayCountsForStreak,
  isStreakUrgent,
  shouldShowFomoRing,
  type DayExchange,
  type XPAction,
} from '../lib/gamification';
import {
  createRewardEngineState,
  processAction,
  type RewardEngineState,
} from '../lib/reward-engine';

// ---------------------------------------------------------------------------
// Seeded deterministic PRNG + helpers
// ---------------------------------------------------------------------------

/** mulberry32: small, fast, deterministic 32-bit PRNG seeded from an integer. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

const CASES = 200; // > 100 generated cases per property

const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});

describe('Addiction-loop engine property tests', () => {
  // -------------------------------------------------------------------------
  // Property 25: streak calculation invariant
  // -------------------------------------------------------------------------

  // Feature: quantchat-mega-upgrade, Property 25: streak count = consecutive days both users exchanged >=1 message, resetting to 0 on a missed day.
  it('Property 25: streak count equals the trailing run of mutual-exchange days', () => {
    const rng = mulberry32(0x25_0000);
    for (let n = 0; n < CASES; n++) {
      const numDays = randInt(rng, 0, 60);
      const days: DayExchange[] = Array.from({ length: numDays }, () => ({
        userASent: rng() < 0.7,
        userBSent: rng() < 0.7,
      }));

      const streak = calculateStreakCount(days);

      // Independently recompute the trailing run of days where BOTH sent.
      let expected = 0;
      for (let i = days.length - 1; i >= 0; i--) {
        if (days[i].userASent && days[i].userBSent) expected++;
        else break;
      }
      expect(streak).toBe(expected);

      // Invariants: never negative, never exceeds the number of days.
      expect(streak).toBeGreaterThanOrEqual(0);
      expect(streak).toBeLessThanOrEqual(numDays);

      // A missed most-recent day forces the streak to 0.
      if (numDays > 0 && !dayCountsForStreak(days[numDays - 1])) {
        expect(streak).toBe(0);
      }
    }
  });

  // Feature: quantchat-mega-upgrade, Property 25: a missed day resets the streak to 0.
  it('Property 25: inserting a missed day at the end always resets to 0', () => {
    const rng = mulberry32(0x25_1111);
    for (let n = 0; n < CASES; n++) {
      const numDays = randInt(rng, 0, 40);
      const days: DayExchange[] = Array.from({ length: numDays }, () => ({
        userASent: true,
        userBSent: true,
      }));
      // Append a missed day (at least one user did not send).
      const aSent = rng() < 0.5;
      days.push({ userASent: aSent, userBSent: !aSent });
      expect(calculateStreakCount(days)).toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // Property 26: milestone triggers
  // -------------------------------------------------------------------------

  // Feature: quantchat-mega-upgrade, Property 26: streak reaching exactly 7/30/100/365 triggers a celebration + badge.
  it('Property 26: isMilestone is true exactly for 7/30/100/365', () => {
    const milestoneSet = new Set<number>(MILESTONE_DAYS);
    const rng = mulberry32(0x26_0000);
    for (let n = 0; n < CASES; n++) {
      const count = randInt(rng, 0, 500);
      expect(isMilestone(count)).toBe(milestoneSet.has(count));
    }
    // Exhaustive check across the full 0..400 range.
    for (let c = 0; c <= 400; c++) {
      expect(isMilestone(c)).toBe(milestoneSet.has(c));
    }
    // Each defined milestone is recognized.
    for (const m of MILESTONE_DAYS) {
      expect(isMilestone(m)).toBe(true);
    }
    // Neighbors of milestones are never milestones.
    for (const m of MILESTONE_DAYS) {
      expect(isMilestone(m - 1)).toBe(false);
      expect(isMilestone(m + 1)).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // Property 27: variable-ratio reward rate bounds
  // -------------------------------------------------------------------------

  // Feature: quantchat-mega-upgrade, Property 27: over N interactions, surprise rewards fall between N/15 and N/5 (rate 1-in-15 .. 1-in-5), and every threshold is in [5,15].
  it('Property 27: reward rate stays within [1/15, 1/5] and thresholds in [5,15] over 10k+ actions', () => {
    // Seed the engine's internal randomness deterministically.
    const rng = mulberry32(0x27_0000);
    Math.random = rng;

    const N = 20000;
    let state: RewardEngineState = createRewardEngineState();
    let rewards = 0;

    // Initial threshold must already be within bounds.
    expect(state.threshold).toBeGreaterThanOrEqual(5);
    expect(state.threshold).toBeLessThanOrEqual(15);

    for (let i = 0; i < N; i++) {
      const [next, reward] = processAction(state);
      // Every (current and freshly-generated) threshold must be within [5,15].
      expect(next.threshold).toBeGreaterThanOrEqual(5);
      expect(next.threshold).toBeLessThanOrEqual(15);
      if (reward) rewards++;
      state = next;
    }

    const rate = rewards / N;
    // Reward rate must lie within the variable-ratio band [1/15, 1/5].
    expect(rate).toBeGreaterThanOrEqual(1 / 15);
    expect(rate).toBeLessThanOrEqual(1 / 5);

    // Absolute reward counts also bracketed by N/15 .. N/5.
    expect(rewards).toBeGreaterThanOrEqual(N / 15);
    expect(rewards).toBeLessThanOrEqual(N / 5);
  });

  // -------------------------------------------------------------------------
  // Property 28: FOMO ring on unviewed stories
  // -------------------------------------------------------------------------

  // Feature: quantchat-mega-upgrade, Property 28: a story with viewed=false renders the FOMO ring.
  it('Property 28: shouldShowFomoRing is the negation of viewed', () => {
    const rng = mulberry32(0x28_0000);
    for (let n = 0; n < CASES; n++) {
      const viewed = rng() < 0.5;
      expect(shouldShowFomoRing(viewed)).toBe(!viewed);
    }
    // Exhaustive over the entire boolean input space.
    expect(shouldShowFomoRing(false)).toBe(true);
    expect(shouldShowFomoRing(true)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Property 29: streak urgency indicator (< 4h)
  // -------------------------------------------------------------------------

  // Feature: quantchat-mega-upgrade, Property 29: a streak with <4h remaining shows the urgency indicator.
  it('Property 29: isStreakUrgent is true exactly when hoursRemaining < 4', () => {
    const rng = mulberry32(0x29_0000);
    for (let n = 0; n < CASES; n++) {
      const hoursRemaining = rng() * 48; // 0 .. 48h
      expect(isStreakUrgent(hoursRemaining)).toBe(hoursRemaining < 4);
    }
    // Boundary checks around the 4-hour threshold.
    expect(isStreakUrgent(0)).toBe(true);
    expect(isStreakUrgent(3.999)).toBe(true);
    expect(isStreakUrgent(4)).toBe(false);
    expect(isStreakUrgent(4.001)).toBe(false);
    expect(isStreakUrgent(24)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Property 30: XP awards match action-point mapping
  // -------------------------------------------------------------------------

  // Feature: quantchat-mega-upgrade, Property 30: XP awards match mapping send_message=10, post_story=25, post_reel=50, maintain_streak=15.
  it('Property 30: xpForAction returns exactly the mapped point value for every action', () => {
    const expected: Record<XPAction, number> = {
      send_message: 10,
      post_story: 25,
      post_reel: 50,
      maintain_streak: 15,
    };
    const actions = Object.keys(expected) as XPAction[];

    const rng = mulberry32(0x30_0000);
    for (let n = 0; n < CASES; n++) {
      const action = actions[randInt(rng, 0, actions.length - 1)];
      expect(xpForAction(action)).toBe(expected[action]);
      // The mapping table itself stays consistent with the helper.
      expect(XP_MAP[action]).toBe(expected[action]);
    }

    // Exhaustive check of the entire action space.
    for (const action of actions) {
      expect(xpForAction(action)).toBe(expected[action]);
    }
  });
});
