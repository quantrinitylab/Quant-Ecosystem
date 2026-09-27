import { describe, it, expect } from 'vitest';
import { calculatePreloadWindow } from '../hooks/useVideoPreloader';
import {
  DEFAULT_TRACKS,
  filterTracksByCategory,
  calculateTrimmedDuration,
} from '../components/music/MusicSyncSelector';

describe('Shortie Video Preloader & Music Sync Library (Task Porting)', () => {
  it('calculates the correct 4-page sliding preload window and evicts old indices', () => {
    const totalVideos = 10;

    // Active index 1 with preloadWindow = 4 -> [0, 1, 2, 3, 4]
    const windowAt1 = calculatePreloadWindow(totalVideos, 1, 4);
    expect(windowAt1).toEqual([0, 1, 2, 3, 4]);

    // Active index moved to 3 -> [2, 3, 4, 5, 6]
    const windowAt3 = calculatePreloadWindow(totalVideos, 3, 4);
    expect(windowAt3).toEqual([2, 3, 4, 5, 6]);

    // Active index at end (index 8) -> clamps to max totalVideos - 1 = 9
    const windowAt8 = calculatePreloadWindow(totalVideos, 8, 4);
    expect(windowAt8).toEqual([7, 8, 9]);
  });

  it('filters sound tracks by category correctly', () => {
    const trendingTracks = filterTracksByCategory(DEFAULT_TRACKS, 'Trending');
    expect(trendingTracks.length).toBe(1);
    expect(trendingTracks[0].title).toBe('Neon Nights');

    const electronicTracks = filterTracksByCategory(DEFAULT_TRACKS, 'Electronic');
    expect(electronicTracks.length).toBe(1);
    expect(electronicTracks[0].title).toBe('Synthwave Skyline');

    const popTracks = filterTracksByCategory(DEFAULT_TRACKS, 'Pop');
    expect(popTracks.length).toBe(1);
    expect(popTracks[0].title).toBe('Bubblegum Pop Hit');
  });

  it('calculates trimmed audio duration with start offset accurately', () => {
    // 30s track with 5s start offset -> trimmed duration is 15s (capped at 15s)
    expect(calculateTrimmedDuration(30, 5)).toBe(15);

    // 15s track with 0s start offset -> 15s
    expect(calculateTrimmedDuration(15, 0)).toBe(15);

    // 20s track with 10s start offset -> 10s (20 - 10 = 10)
    expect(calculateTrimmedDuration(20, 10)).toBe(10);
  });
});
