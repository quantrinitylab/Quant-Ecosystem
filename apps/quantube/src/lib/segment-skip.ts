// ============================================================================
// QuantTube — segment-skip client logic (pure, player-agnostic)
// ============================================================================
//
// The client-side counterpart to the backend SegmentService: it maps a video's
// server-computed SKIP-PLAN and "teach me X" TOPIC JUMPS onto concrete seek
// targets for the player. Pure functions (no React, no DOM) so they are fully
// unit-testable; the hook + watch page apply the results to the real
// <video>.currentTime seek handle.

/** A closed time range, in seconds. Mirrors the backend `TimeRange`. */
export interface TimeRange {
  startSec: number;
  endSec: number;
}

export type SegmentKind = 'intro' | 'content' | 'sponsor' | 'recap' | 'outro' | 'filler';

/** The server-computed skip-plan (subset consumed by the client). */
export interface SkipPlan {
  videoId: string;
  durationSec: number;
  skipKinds: SegmentKind[];
  skipRanges: TimeRange[];
  playRanges: TimeRange[];
  skippedSec: number;
  playableSec: number;
}

/** A "teach me X" jump target from the backend. */
export interface TopicJump {
  segmentId: string;
  kind: SegmentKind;
  label: string | null;
  startSec: number;
  endSec: number;
  score: number;
}

/**
 * Given the skip ranges and the player's current time, return the second to
 * SEEK TO in order to skip the segment the playhead is currently inside — i.e.
 * the end of the skip range containing `currentTime`. Returns `null` when the
 * playhead is not inside any skip range (nothing to skip).
 *
 * `epsilon` guards against a re-trigger loop at the very end of a range: if the
 * playhead is already within `epsilon` seconds of a range's end, there is
 * effectively nothing left to skip.
 */
export function nextSkipTarget(
  skipRanges: TimeRange[],
  currentTime: number,
  epsilon = 0.25,
): number | null {
  if (!Array.isArray(skipRanges) || !Number.isFinite(currentTime)) {
    return null;
  }
  for (const range of skipRanges) {
    if (currentTime >= range.startSec && currentTime < range.endSec - epsilon) {
      return range.endSec;
    }
  }
  return null;
}

/** The second to seek to for a "teach me X" jump — the start of the segment. */
export function topicJumpTarget(jump: Pick<TopicJump, 'startSec'>): number {
  return jump.startSec;
}

/**
 * Whether `currentTime` falls inside any skip range (used to show a manual
 * "Skip" affordance even when auto-skip is off).
 */
export function isInSkipRange(skipRanges: TimeRange[], currentTime: number): boolean {
  return nextSkipTarget(skipRanges, currentTime, 0) !== null;
}
