// ============================================================================
// QuantChat - Reels Feed Property Tests (Task 3.10)
//
// Property-based tests for the Reels feed correctness properties:
//   - Property 4: visibility controls playback
//   - Property 5: overlay displays all required fields
//   - Property 7: feed ranking produces non-increasing score order
//   - Property 8: infinite scroll triggers fetch near the end
//
// Generators are seeded and deterministic (mulberry32). Each property runs
// over >= 100 generated cases.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  shouldFetchNext,
  playbackStateForVisibility,
  getReelOverlayFields,
  hasAllRequiredOverlayFields,
  REQUIRED_OVERLAY_FIELDS,
  INFINITE_SCROLL_BUFFER,
} from '../app/reels/feedLogic';
import type { Reel } from '../hooks/useReelsFeed';
import {
  computeEngagementScore,
  rankBySpotlight,
  type SpotlightSourceReel,
} from '../../backend/services/spotlight.service';

// ---------------------------------------------------------------------------
// Seeded deterministic PRNG + generators
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

/** Generate a fully-populated reel (creator info non-null). */
function genReel(rng: () => number, i: number): SpotlightSourceReel {
  return {
    id: `reel-${i}-${randInt(rng, 0, 1_000_000)}`,
    creatorId: `creator-${randInt(rng, 1, 50)}`,
    creatorUsername: `user_${randInt(rng, 1, 9_999)}`,
    creatorAvatar: `https://cdn.example/avatar-${randInt(rng, 1, 100)}.png`,
    videoUrl: `https://cdn.example/video-${i}.mp4`,
    thumbnailUrl: `https://cdn.example/thumb-${i}.jpg`,
    caption: rng() < 0.1 ? '' : `caption #${randInt(rng, 0, 1_000_000)}`,
    duration: randInt(rng, 5, 60),
    likeCount: randInt(rng, 0, 1_000_000),
    commentCount: randInt(rng, 0, 500_000),
    shareCount: randInt(rng, 0, 100_000),
    watchThroughRate: rng(),
    createdAt: new Date(1_700_000_000_000 + randInt(rng, 0, 1_000_000_000)).toISOString(),
    isLikedByUser: rng() < 0.5,
  };
}

function genReelList(rng: () => number, count: number): SpotlightSourceReel[] {
  return Array.from({ length: count }, (_, i) => genReel(rng, i));
}

// ---------------------------------------------------------------------------
// Property 4: visibility controls playback
// ---------------------------------------------------------------------------

describe('Reels feed property tests', () => {
  // Feature: quantchat-mega-upgrade, Property 4: a reel visible in viewport is playing; not visible is paused.
  it('Property 4: playback state follows viewport visibility', () => {
    const rng = mulberry32(0x4_0000);
    for (let n = 0; n < CASES; n++) {
      const isVisible = rng() < 0.5;
      const state = playbackStateForVisibility(isVisible);
      if (isVisible) {
        expect(state).toBe('playing');
      } else {
        expect(state).toBe('paused');
      }
    }
    // Exhaustive boundary check over the entire (boolean) input space.
    expect(playbackStateForVisibility(true)).toBe('playing');
    expect(playbackStateForVisibility(false)).toBe('paused');
  });

  // ---------------------------------------------------------------------------
  // Property 5: overlay displays all required fields
  // ---------------------------------------------------------------------------

  // Feature: quantchat-mega-upgrade, Property 5: for any reel with non-null creator info, the overlay renders creator username, caption, like/comment/share counts.
  it('Property 5: overlay exposes username, caption, and like/comment/share counts for any reel', () => {
    const rng = mulberry32(0x5_0000);
    for (let n = 0; n < CASES; n++) {
      const reel = genReel(rng, n) as Reel;

      // The overlay contract is satisfied for every generated (non-null creator) reel.
      expect(hasAllRequiredOverlayFields(reel)).toBe(true);

      const fields = getReelOverlayFields(reel);
      // Every required overlay field is present and well-typed.
      for (const key of REQUIRED_OVERLAY_FIELDS) {
        expect(fields[key]).toBeDefined();
      }
      expect(typeof fields.creatorUsername).toBe('string');
      expect(fields.creatorUsername.length).toBeGreaterThan(0);
      expect(typeof fields.caption).toBe('string');
      for (const count of [fields.likeCount, fields.commentCount, fields.shareCount]) {
        expect(typeof count).toBe('number');
        expect(Number.isFinite(count)).toBe(true);
        expect(count).toBeGreaterThanOrEqual(0);
      }
      // Overlay fields faithfully mirror the source reel.
      expect(fields.creatorUsername).toBe(reel.creatorUsername);
      expect(fields.caption).toBe(reel.caption);
      expect(fields.likeCount).toBe(reel.likeCount);
      expect(fields.commentCount).toBe(reel.commentCount);
      expect(fields.shareCount).toBe(reel.shareCount);
    }
  });

  // ---------------------------------------------------------------------------
  // Property 7: feed ranking produces non-increasing score order
  // ---------------------------------------------------------------------------

  // Feature: quantchat-mega-upgrade, Property 7: for any set of candidate reels, the ranking output is sorted non-increasing by computed engagement/relevance score.
  it('Property 7: engagement ranking output is sorted non-increasing by score', () => {
    const rng = mulberry32(0x7_0000);
    for (let n = 0; n < CASES; n++) {
      const candidates = genReelList(rng, randInt(rng, 0, 40));
      const ranked = rankBySpotlight(candidates);

      // Output is a permutation of the input (no reels lost or duplicated).
      expect(ranked).toHaveLength(candidates.length);
      expect(new Set(ranked.map((r) => r.id))).toEqual(new Set(candidates.map((r) => r.id)));

      for (let i = 1; i < ranked.length; i++) {
        const prev = ranked[i - 1]!;
        const curr = ranked[i]!;
        // Non-increasing engagement score across the ordered feed.
        expect(prev.engagementScore).toBeGreaterThanOrEqual(curr.engagementScore);
        // The stored score matches the pure scoring function.
        expect(curr.engagementScore).toBe(computeEngagementScore(curr));
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Property 8: infinite scroll triggers fetch near end
  // ---------------------------------------------------------------------------

  // Feature: quantchat-mega-upgrade, Property 8: when the user's position is within 3 items of the loaded set's end and more exist, a fetch is triggered.
  it('Property 8: shouldFetchNext is true exactly when within 3 of end and more exist', () => {
    const rng = mulberry32(0x8_0000);
    for (let n = 0; n < CASES; n++) {
      const loadedCount = randInt(rng, 1, 200);
      const currentIndex = randInt(rng, 0, loadedCount - 1);
      const hasMore = rng() < 0.5;

      const result = shouldFetchNext(currentIndex, loadedCount, hasMore);
      const withinThreeOfEnd = loadedCount - currentIndex <= INFINITE_SCROLL_BUFFER;
      const expected = hasMore && withinThreeOfEnd;

      expect(result).toBe(expected);

      // When more exists and we're near the end, a fetch must be triggered.
      if (hasMore && withinThreeOfEnd) {
        expect(result).toBe(true);
      }
      // No fetch is ever triggered when there is nothing more to load.
      if (!hasMore) {
        expect(result).toBe(false);
      }
    }
  });

  // Feature: quantchat-mega-upgrade, Property 8: when the user's position is within 3 items of the loaded set's end and more exist, a fetch is triggered.
  it('Property 8: every position within 3 of the end triggers a fetch when more exist', () => {
    const rng = mulberry32(0x8_1111);
    for (let n = 0; n < CASES; n++) {
      const loadedCount = randInt(rng, INFINITE_SCROLL_BUFFER + 1, 200);

      // Positions within 3 of the end -> always fetch (hasMore = true).
      for (let idx = loadedCount - INFINITE_SCROLL_BUFFER; idx <= loadedCount - 1; idx++) {
        expect(shouldFetchNext(idx, loadedCount, true)).toBe(true);
      }
      // The position just outside the window -> no fetch.
      expect(shouldFetchNext(loadedCount - INFINITE_SCROLL_BUFFER - 1, loadedCount, true)).toBe(
        false,
      );
    }
  });
});
