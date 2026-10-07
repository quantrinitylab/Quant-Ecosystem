import { describe, it, expect } from 'vitest';
import {
  SpotlightService,
  computeEngagementScore,
  rankBySpotlight,
  applyPersonalization,
  FEATURED_COUNT,
  SPOTLIGHT_REFRESH_INTERVAL_MS,
  type SpotlightSourceReel,
} from '../services/spotlight.service';

function makeReel(id: string, overrides: Partial<SpotlightSourceReel> = {}): SpotlightSourceReel {
  return {
    id,
    creatorId: `creator-${id}`,
    creatorUsername: `user_${id}`,
    creatorAvatar: `https://cdn/${id}.svg`,
    videoUrl: `https://cdn/${id}.mp4`,
    thumbnailUrl: `https://cdn/${id}.jpg`,
    caption: `caption ${id}`,
    duration: 30,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    watchThroughRate: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    isLikedByUser: false,
    ...overrides,
  };
}

describe('computeEngagementScore (Task 13.5)', () => {
  it('weights shares > comments > likes and scales watch-through', () => {
    const reel = makeReel('a', {
      likeCount: 10,
      commentCount: 5,
      shareCount: 2,
      watchThroughRate: 0.5,
    });
    // 10*1 + 5*2 + 2*3 + 0.5*1000 = 10 + 10 + 6 + 500 = 526
    expect(computeEngagementScore(reel)).toBe(526);
  });

  it('clamps watch-through rate into [0,1]', () => {
    expect(computeEngagementScore(makeReel('a', { watchThroughRate: 2 }))).toBe(1000);
    expect(computeEngagementScore(makeReel('b', { watchThroughRate: -1 }))).toBe(0);
  });
});

describe('rankBySpotlight (Tasks 13.5, 13.7)', () => {
  it('orders reels by descending engagement score', () => {
    const reels = [
      makeReel('low', { likeCount: 1 }),
      makeReel('high', { shareCount: 100 }),
      makeReel('mid', { commentCount: 20 }),
    ];
    const ranked = rankBySpotlight(reels);
    expect(ranked.map((r) => r.id)).toEqual(['high', 'mid', 'low']);
  });

  it('flags exactly the top FEATURED_COUNT reels as featured', () => {
    const reels = Array.from({ length: 6 }, (_, i) =>
      makeReel(`r${i}`, { likeCount: (6 - i) * 100 }),
    );
    const ranked = rankBySpotlight(reels);
    const featured = ranked.filter((r) => r.isFeatured);
    expect(featured).toHaveLength(FEATURED_COUNT);
    expect(featured.every((r) => ranked.indexOf(r) < FEATURED_COUNT)).toBe(true);
  });

  it('breaks ties deterministically by id', () => {
    const reels = [makeReel('b'), makeReel('a'), makeReel('c')];
    expect(rankBySpotlight(reels).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('SpotlightService caching (Task 13.6)', () => {
  it('caches the ranking and reports refreshed=false within the 15-minute window', () => {
    const service = new SpotlightService();
    const reels = [makeReel('a', { likeCount: 10 }), makeReel('b', { likeCount: 5 })];

    const first = service.getEngagementRanking(reels, { now: 0 });
    expect(first.refreshed).toBe(true);

    const second = service.getEngagementRanking(reels, { now: SPOTLIGHT_REFRESH_INTERVAL_MS - 1 });
    expect(second.refreshed).toBe(false);
    expect(second.rankedAt).toBe(first.rankedAt);
  });

  it('recomputes after the refresh interval elapses', () => {
    const service = new SpotlightService();
    const reels = [makeReel('a', { likeCount: 10 })];

    service.getEngagementRanking(reels, { now: 0 });
    const refreshed = service.getEngagementRanking(reels, { now: SPOTLIGHT_REFRESH_INTERVAL_MS });
    expect(refreshed.refreshed).toBe(true);
    expect(refreshed.rankedAt).toBe(SPOTLIGHT_REFRESH_INTERVAL_MS);
  });

  it('forceRefresh recomputes even within the window', () => {
    const service = new SpotlightService();
    const reels = [makeReel('a', { likeCount: 10 })];
    service.getEngagementRanking(reels, { now: 0 });
    const forced = service.getEngagementRanking(reels, { now: 1, forceRefresh: true });
    expect(forced.refreshed).toBe(true);
  });

  it('exposes the featured subset from the cache', () => {
    const service = new SpotlightService();
    const reels = Array.from({ length: 5 }, (_, i) =>
      makeReel(`r${i}`, { likeCount: (5 - i) * 10 }),
    );
    service.getEngagementRanking(reels, { now: 0 });
    expect(service.getFeatured()).toHaveLength(FEATURED_COUNT);
  });
});

describe('applyPersonalization fallback (Task 13.8)', () => {
  it('returns engagement order unchanged when @quant/recommendations is unavailable', async () => {
    const ranked = rankBySpotlight([
      makeReel('a', { likeCount: 30 }),
      makeReel('b', { likeCount: 20 }),
      makeReel('c', { likeCount: 10 }),
    ]);
    const personalized = await applyPersonalization('viewer-1', ranked);
    expect(personalized.map((r) => r.id)).toEqual(ranked.map((r) => r.id));
  });
});
