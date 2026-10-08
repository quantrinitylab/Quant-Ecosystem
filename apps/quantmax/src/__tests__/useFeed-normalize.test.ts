// ============================================================================
// QuantMax - feed payload normalization tests (QM-UIUX-002)
// Locks the contract that the For You query normalizes BOTH backend payload
// shapes (raw array and the `{ videos, page, pageSize }` envelope returned by
// backend/routes/feed.ts) into a video list. Before the fix, the envelope
// object was treated as a single video: the page rendered a broken player
// (undefined id/src) instead of the honest empty state, and
// getNextPageParam's length check degenerated into an infinite fetch loop.
// DOM-free module, runs in the default node environment.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { normalizeFeedPayload } from '../hooks/useFeed';

const video = (id: string) => ({ id, title: `video ${id}` });

describe('normalizeFeedPayload', () => {
  it('passes a raw video array through unchanged', () => {
    const videos = [video('a'), video('b')];
    expect(normalizeFeedPayload(videos)).toEqual(videos);
  });

  it('unwraps the { videos, page, pageSize } backend envelope', () => {
    const videos = [video('a')];
    expect(normalizeFeedPayload({ videos, page: 1, pageSize: 20 })).toEqual(videos);
  });

  it('unwraps an empty envelope to [] so the honest empty state renders', () => {
    expect(normalizeFeedPayload({ videos: [], page: 1, pageSize: 20 })).toEqual([]);
  });

  it('returns [] for null, undefined, and non-object payloads', () => {
    expect(normalizeFeedPayload(null)).toEqual([]);
    expect(normalizeFeedPayload(undefined)).toEqual([]);
    expect(normalizeFeedPayload('oops')).toEqual([]);
    expect(normalizeFeedPayload(42)).toEqual([]);
  });

  it('returns [] when the envelope has no videos array', () => {
    expect(normalizeFeedPayload({ page: 1 })).toEqual([]);
    expect(normalizeFeedPayload({ videos: 'not-an-array' })).toEqual([]);
    expect(normalizeFeedPayload({})).toEqual([]);
  });

  it('never returns a non-array, so getNextPageParam length checks stay sound', () => {
    const shapes: unknown[] = [
      [],
      [video('a')],
      { videos: [], page: 1, pageSize: 20 },
      { videos: [video('a')], page: 2, pageSize: 20 },
      null,
      undefined,
      {},
    ];
    for (const shape of shapes) {
      const normalized = normalizeFeedPayload(shape);
      expect(Array.isArray(normalized)).toBe(true);
    }
  });
});
