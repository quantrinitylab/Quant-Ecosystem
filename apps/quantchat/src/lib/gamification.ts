// ============================================================================
// Task 11.14: Pure gamification / addiction-loop helpers
//
// This module centralizes the *pure* logic behind the micro-interaction
// engine so it can be unit/property tested without React. The provider and
// presentational components import these helpers instead of re-implementing
// the rules inline.
//
// Properties covered (see design.md):
//   - Property 25: streak calculation invariant
//   - Property 26: milestone triggers
//   - Property 28: FOMO ring on unviewed stories
//   - Property 29: streak urgency indicator (< 4h)
//   - Property 30: XP awards match action-point mapping
// ============================================================================

// ─── XP mapping (Property 30) ────────────────────────────────────────────────

export type XPAction = 'send_message' | 'post_story' | 'post_reel' | 'maintain_streak';

/** Canonical per-action XP point mapping. Single source of truth. */
export const XP_MAP: Record<XPAction, number> = {
  send_message: 10,
  post_story: 25,
  post_reel: 50,
  maintain_streak: 15,
};

/**
 * XP awarded for a given action. Returns exactly the mapped point value.
 * Unknown actions award 0.
 */
export function xpForAction(action: XPAction): number {
  return XP_MAP[action] ?? 0;
}

// ─── Milestones (Property 26) ────────────────────────────────────────────────

export const MILESTONE_DAYS = [7, 30, 100, 365] as const;
export type MilestoneDay = (typeof MILESTONE_DAYS)[number];

/**
 * Whether a streak count is exactly a celebration milestone (7/30/100/365).
 * Only an exact match triggers a celebration + badge.
 */
export function isMilestone(count: number): count is MilestoneDay {
  return (MILESTONE_DAYS as readonly number[]).includes(count);
}

// ─── Streak calculation (Property 25) ────────────────────────────────────────

/**
 * A single day's exchange record for a friend pair: did each user send at
 * least one message that day.
 */
export interface DayExchange {
  userASent: boolean;
  userBSent: boolean;
}

/** A day "counts" toward a streak only when BOTH users sent >= 1 message. */
export function dayCountsForStreak(day: DayExchange): boolean {
  return day.userASent && day.userBSent;
}

/**
 * Calculate the current streak count for a friend pair given an ordered list
 * of daily exchanges (oldest first, most recent last).
 *
 * The streak count equals the number of consecutive most-recent days for which
 * both users exchanged at least one message. Any missed day (where at least one
 * user did not send) resets the running streak to 0.
 */
export function calculateStreakCount(days: DayExchange[]): number {
  let count = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (dayCountsForStreak(days[i])) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ─── Streak urgency (Property 29) ────────────────────────────────────────────

/** Streak is "urgent" when fewer than 4 hours remain before it expires. */
export const STREAK_URGENCY_THRESHOLD_HOURS = 4;

/**
 * Predicate: should the urgency indicator (pulsing fire + urgency coloring)
 * be shown for a streak with the given hours remaining.
 */
export function isStreakUrgent(hoursRemaining: number): boolean {
  return hoursRemaining < STREAK_URGENCY_THRESHOLD_HOURS;
}

// ─── FOMO ring (Property 28) ─────────────────────────────────────────────────

/**
 * Predicate: should a story circle render the active FOMO ring gradient.
 * Only unviewed stories (viewed === false) get the ring.
 */
export function shouldShowFomoRing(viewed: boolean): boolean {
  return !viewed;
}
