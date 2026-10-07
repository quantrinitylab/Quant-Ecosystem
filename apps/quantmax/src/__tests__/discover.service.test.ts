// ============================================================================
// QuantMax — discover.service contract tests (P0 trust fix, 2026-10-06)
// ============================================================================
// The discover page is PUBLIC. These tests lock the trust contract:
// the service returns ONLY real backend-provided values and NEVER fabricates
// metrics or media URLs. When no real data exists it returns EMPTY
// collections so the page renders honest "No data yet" states.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchDiscoverContent,
  fetchDiscoverCategoryVideos,
  mapTrendingSound,
  mapHashtagChallenge,
  mapCreatorSpotlight,
  mapDiscoverVideo,
} from '../services/discover.service';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
}

describe('fetchDiscoverContent', () => {
  it('returns empty collections on 401 (unauthenticated) — never fabricates', async () => {
    mockFetch(401, { success: false, error: { code: 'UNAUTHORIZED' } });
    const content = await fetchDiscoverContent();
    expect(content.sounds).toEqual([]);
    expect(content.challenges).toEqual([]);
    expect(content.spotlights).toEqual([]);
  });

  it('returns empty collections on 404 (no discover endpoint) — never fabricates', async () => {
    mockFetch(404, { message: 'not found' });
    const content = await fetchDiscoverContent();
    expect(content.sounds).toEqual([]);
    expect(content.challenges).toEqual([]);
    expect(content.spotlights).toEqual([]);
  });

  it('returns empty collections on network failure — never fabricates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const content = await fetchDiscoverContent();
    expect(content).toEqual({ sounds: [], challenges: [], spotlights: [] });
  });

  it('passes real server metrics through as-is (never generated client-side)', async () => {
    mockFetch(200, {
      success: true,
      data: {
        sounds: [
          {
            id: 's1',
            name: 'Real Track',
            artistName: 'Real Artist',
            coverUrl: 'https://real-cdn.example/covers/1.jpg',
            videoCount: 12345,
            previewUrl: 'https://real-cdn.example/preview/1.mp3',
            duration: 30,
          },
        ],
        challenges: [
          {
            id: 'c1',
            hashtag: '#RealChallenge',
            title: 'Real Title',
            videoCount: 999,
            participantCount: 42,
            sponsored: true,
          },
        ],
        spotlights: [
          {
            id: 'p1',
            username: 'real_creator',
            displayName: 'Real Creator',
            followerCount: 777,
            isVerified: true,
          },
        ],
      },
    });
    const content = await fetchDiscoverContent();
    expect(content.sounds[0].videoCount).toBe(12345);
    expect(content.sounds[0].coverUrl).toBe('https://real-cdn.example/covers/1.jpg');
    expect(content.challenges[0].videoCount).toBe(999);
    expect(content.challenges[0].participantCount).toBe(42);
    expect(content.challenges[0].sponsored).toBe(true);
    expect(content.spotlights[0].followerCount).toBe(777);
    expect(content.spotlights[0].isVerified).toBe(true);
  });
});

describe('fetchDiscoverCategoryVideos', () => {
  it('returns an empty list on 401 — never fabricates videos', async () => {
    mockFetch(401, { success: false });
    const videos = await fetchDiscoverCategoryVideos('Comedy');
    expect(videos).toEqual([]);
  });

  it('returns an empty list on network failure — never fabricates videos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const videos = await fetchDiscoverCategoryVideos('Dance');
    expect(videos).toEqual([]);
  });

  it('passes real server video metrics through as-is', async () => {
    mockFetch(200, {
      success: true,
      data: {
        videos: [
          {
            id: 'v1',
            thumbnailUrl: 'https://real-cdn.example/thumbs/1.jpg',
            viewCount: 555,
            likes: 55,
            creatorUsername: 'real_creator',
            caption: 'real caption',
            duration: 21,
          },
        ],
      },
    });
    const videos = await fetchDiscoverCategoryVideos('Comedy');
    expect(videos).toHaveLength(1);
    expect(videos[0].viewCount).toBe(555);
    expect(videos[0].likes).toBe(55);
  });
});

describe('payload mappers — missing metrics stay null, never backfilled', () => {
  it('mapTrendingSound: missing videoCount/coverUrl stay null', () => {
    const sound = mapTrendingSound({ id: 's1', name: 'Track' });
    expect(sound.videoCount).toBeNull();
    expect(sound.coverUrl).toBeNull();
    expect(sound.artistName).toBeNull();
    expect(sound.previewUrl).toBeNull();
  });

  it('mapHashtagChallenge: missing counts stay null', () => {
    const challenge = mapHashtagChallenge({ id: 'c1', hashtag: '#x', title: 'T' });
    expect(challenge.videoCount).toBeNull();
    expect(challenge.participantCount).toBeNull();
    expect(challenge.bannerUrl).toBeNull();
    expect(challenge.sponsored).toBe(false);
  });

  it('mapCreatorSpotlight: missing followerCount/avatarUrl stay null', () => {
    const creator = mapCreatorSpotlight({ id: 'p1', username: 'u', displayName: 'D' });
    expect(creator.followerCount).toBeNull();
    expect(creator.avatarUrl).toBeNull();
    expect(creator.isVerified).toBe(false);
  });

  it('mapDiscoverVideo: missing viewCount/thumbnailUrl stay null', () => {
    const video = mapDiscoverVideo({ id: 'v1' });
    expect(video.viewCount).toBeNull();
    expect(video.thumbnailUrl).toBeNull();
    expect(video.likes).toBeNull();
  });

  it('rejects invalid metric values (strings, negatives, NaN) as null', () => {
    const video = mapDiscoverVideo({
      id: 'v1',
      viewCount: '3.7M',
      likes: -5,
      duration: Number.NaN,
    });
    expect(video.viewCount).toBeNull();
    expect(video.likes).toBeNull();
    expect(video.duration).toBeNull();
  });

  it('rejects blank/whitespace media URLs as null', () => {
    const sound = mapTrendingSound({ id: 's1', name: 'T', coverUrl: '   ' });
    expect(sound.coverUrl).toBeNull();
  });
});
