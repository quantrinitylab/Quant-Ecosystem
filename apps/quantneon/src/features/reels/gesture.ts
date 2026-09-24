export interface GesturePoint {
  x: number;
  y: number;
  at: number;
}

export type VerticalReelSwipe = 'next' | 'previous' | null;

const MIN_SWIPE_PX = 64;
const MAX_SWIPE_PX = 112;
const VIEWPORT_SWIPE_RATIO = 0.12;
const HORIZONTAL_DOMINANCE = 1.25;

/** Classify a deliberate vertical swipe; ignore taps, diagonal and horizontal gestures. */
export function classifyVerticalSwipe(
  start: GesturePoint,
  end: GesturePoint,
  viewportHeight: number,
): VerticalReelSwipe {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const verticalDistance = Math.abs(deltaY);
  const threshold = Math.max(
    MIN_SWIPE_PX,
    Math.min(MAX_SWIPE_PX, viewportHeight * VIEWPORT_SWIPE_RATIO),
  );

  if (verticalDistance < threshold || verticalDistance <= Math.abs(deltaX) * HORIZONTAL_DOMINANCE) {
    return null;
  }

  return deltaY < 0 ? 'next' : 'previous';
}

/** Recognize a second tap only when it is both near the first and inside the time window. */
export function isDoubleTap(
  first: GesturePoint | null,
  second: GesturePoint,
  maxDelayMs = 280,
  maxDistancePx = 48,
): boolean {
  if (!first) return false;

  const elapsed = second.at - first.at;
  if (elapsed < 0 || elapsed > maxDelayMs) return false;

  return Math.hypot(second.x - first.x, second.y - first.y) <= maxDistancePx;
}
