// ============================================================================
// QuantChat - Reels Feed Pure Logic (Task 3.10 support)
//
// Pure, React-free helpers extracted from the Reels feed so the feed's
// behavioural invariants can be property-tested without rendering:
//   - shouldFetchNext()            infinite-scroll trigger predicate (Task 3.5)
//   - playbackStateForVisibility() viewport-visibility -> playback (Task 3.2/3.5)
//   - getReelOverlayFields()       required overlay field extraction (Task 3.4)
//   - hasAllRequiredOverlayFields()overlay field-presence contract  (Task 3.4)
//
// These mirror the logic used by `reels/page.tsx`, `ReelPlayer.tsx`, and
// `ReelOverlay.tsx` so the tests validate the real behaviour.
// ============================================================================

import type { Reel } from '../../hooks/useReelsFeed';

/** Fetch the next page when the current item is within this many of the end. */
export const INFINITE_SCROLL_BUFFER = 3;

/**
 * Infinite-scroll trigger predicate (Task 3.5).
 *
 * Returns true when more reels exist AND the user's current position is within
 * {@link INFINITE_SCROLL_BUFFER} items of the end of the loaded set. This is the
 * exact condition used by the Reels page effect:
 *   `reels.length - currentIndex <= INFINITE_SCROLL_BUFFER && hasMore`
 */
export function shouldFetchNext(
  currentIndex: number,
  loadedCount: number,
  hasMore: boolean,
): boolean {
  if (!hasMore) return false;
  return loadedCount - currentIndex <= INFINITE_SCROLL_BUFFER;
}

export type PlaybackState = 'playing' | 'paused';

/**
 * Map a reel's viewport visibility to its playback state (Task 3.2/3.5):
 * a reel that is visible plays; one that is not visible pauses.
 */
export function playbackStateForVisibility(isVisible: boolean): PlaybackState {
  return isVisible ? 'playing' : 'paused';
}

/** The fields the {@link ReelOverlay} is required to render for each reel. */
export interface ReelOverlayFields {
  creatorUsername: string;
  caption: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
}

/** Names of the required overlay fields (Task 3.4 / Requirement 3.6). */
export const REQUIRED_OVERLAY_FIELDS = [
  'creatorUsername',
  'caption',
  'likeCount',
  'commentCount',
  'shareCount',
] as const;

/** Extract the overlay-visible fields from a reel. */
export function getReelOverlayFields(reel: Reel): ReelOverlayFields {
  return {
    creatorUsername: reel.creatorUsername,
    caption: reel.caption,
    likeCount: reel.likeCount,
    commentCount: reel.commentCount,
    shareCount: reel.shareCount,
  };
}

/**
 * True when a reel carries every field the overlay must render (Task 3.4):
 * a non-empty creator username, a caption string, and finite, non-negative
 * like/comment/share counts.
 */
export function hasAllRequiredOverlayFields(reel: Reel): boolean {
  const fields = getReelOverlayFields(reel);
  const usernameOk =
    typeof fields.creatorUsername === 'string' && fields.creatorUsername.length > 0;
  const captionOk = typeof fields.caption === 'string';
  const countsOk = [fields.likeCount, fields.commentCount, fields.shareCount].every(
    (c) => typeof c === 'number' && Number.isFinite(c) && c >= 0,
  );
  return usernameOk && captionOk && countsOk;
}
