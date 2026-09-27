// ============================================================================
// QuantTube - Public Feed & DTTube Resolution Badges Test Suite
// Tests DTTube resolution badges (1080p Full HD, 720p HD, 480p SD),
// guest unauthenticated feed with zero 401s, and AdaptiveVideoPlayer
// resolution selector & Shortzz audio waveform visualizer integration.
// ============================================================================

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../pages/index';
import {
  AdaptiveVideoPlayer,
  QUALITY_OPTIONS,
  SPEED_OPTIONS,
} from '../components/video/AdaptiveVideoPlayer';
import {
  AudioWaveformBeatsService,
  audioWaveformBeatsService,
} from '../services/AudioWaveformBeatsService';
import { PUBLIC_FEATURED_VIDEOS, getGuestFeaturedVideos } from '../data/public-videos';

// Mock dependencies for HomePage
vi.mock('../hooks/useVideos', () => ({
  useVideos: (category?: string) => ({
    data: {
      pages: [
        {
          isGuestFallback: true,
          videos: [
            {
              id: 'test-vid-1080',
              title: 'Sovereign Computing Keynote 2026',
              channelName: 'Quant Labs',
              resolution: '1080p Full HD',
              duration: 1800,
              views: 450000,
            },
            {
              id: 'test-vid-720',
              title: 'Lo-Fi Chill Coding Beats',
              channelName: 'Sovereign Audio',
              resolution: '720p HD',
              duration: 2400,
              views: 120000,
            },
            {
              id: 'test-vid-480',
              title: 'Distributed CRDT Architecture',
              channelName: 'Systems Academy',
              resolution: '480p SD',
              duration: 900,
              views: 65000,
            },
          ],
        },
      ],
    },
    isLoading: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
  }),
}));

describe('QuanTube Public Feed & DTTube Resolution Badges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. DTTube Resolution Badges Rendering', () => {
    it('renders all DTTube resolution badges (1080p Full HD, 720p HD, 480p SD) on video cards', () => {
      const html = renderToStaticMarkup(<HomePage />);

      // Verify badges text rendered in cards
      expect(html).toContain('1080p Full HD');
      expect(html).toContain('720p HD');
      expect(html).toContain('480p SD');

      // Verify data-testid on badges
      expect(html).toContain('data-testid="dttube-resolution-badge"');

      // Verify resolution badge color styling classes
      // 1080p -> emerald
      expect(html).toContain('text-emerald-400');
      expect(html).toContain('border-emerald-500/30');

      // 720p -> cyan
      expect(html).toContain('text-cyan-400');
      expect(html).toContain('border-cyan-500/30');

      // 480p -> amber
      expect(html).toContain('text-amber-400');
      expect(html).toContain('border-amber-500/30');
    });

    it('PUBLIC_FEATURED_VIDEOS contains curated DTTube resolution metadata across resolutions', () => {
      const resolutions = PUBLIC_FEATURED_VIDEOS.map((v) => v.resolution);
      expect(resolutions).toContain('1080p Full HD');
      expect(resolutions).toContain('720p HD');
      expect(resolutions).toContain('480p SD');

      // Verify getGuestFeaturedVideos helper preserves resolution attributes
      const featured = getGuestFeaturedVideos('all');
      expect(featured.length).toBeGreaterThan(0);
      expect(featured.some((v) => v.resolution === '1080p Full HD')).toBe(true);
      expect(featured.some((v) => v.resolution === '720p HD')).toBe(true);
      expect(featured.some((v) => v.resolution === '480p SD')).toBe(true);
    });
  });

  describe('2. Unauthenticated Guest Feed with Zero 401s', () => {
    it('renders guest welcome hero banner for unauthenticated visitors without crashing or 401', () => {
      const html = renderToStaticMarkup(<HomePage />);

      // Hero banner for guest visitors
      expect(html).toContain('Welcome to QuanTube');
      expect(html).toContain('data-testid="guest-hero-banner"');
      expect(html).toContain('Enjoy free, smooth video');

      // Featured videos rendered without requiring login
      expect(html).toContain('Sovereign Computing Keynote 2026');
      expect(html).toContain('Lo-Fi Chill Coding Beats');
      expect(html).toContain('Distributed CRDT Architecture');

      // Channel details and metrics rendered
      expect(html).toContain('Quant Labs');
      expect(html).toContain('Sovereign Audio');
      expect(html).toContain('Systems Academy');
    });

    it('renders category navigation tabs for filtering public videos', () => {
      const html = renderToStaticMarkup(<HomePage />);

      expect(html).toContain('All');
      expect(html).toContain('Music');
      expect(html).toContain('Gaming');
      expect(html).toContain('Technology');
    });
  });

  describe('3. AdaptiveVideoPlayer Resolution Options & Waveform Indicator Support', () => {
    it('supports full DTTube quality resolutions and speed options', () => {
      expect(QUALITY_OPTIONS).toEqual(['Auto', '1080p Full HD', '720p HD', '480p SD', '360p']);
      expect(SPEED_OPTIONS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
    });

    it('renders AdaptiveVideoPlayer with quality selector, speed selector, and waveform indicator', () => {
      const sampleVideo = {
        id: 'test-video-stream',
        title: 'Deep Space Quantum Telemetry',
        url: 'https://example.com/video.mp4',
        duration: 360,
      };

      const html = renderToStaticMarkup(
        <AdaptiveVideoPlayer video={sampleVideo} initialQuality="1080p Full HD" initialSpeed={1} />,
      );

      // Verify video player container
      expect(html).toContain('role="region"');
      expect(html).toContain('aria-label="Adaptive Video Player"');
      expect(html).toContain('Deep Space Quantum Telemetry');

      // Verify Quality resolution selector
      expect(html).toContain('aria-label="Quality resolution selector"');
      expect(html).toContain('1080p Full HD');

      // Verify Playback speed selector
      expect(html).toContain('aria-label="Playback speed selector"');
      expect(html).toContain('1x');

      // Verify Audio waveform indicator container
      expect(html).toContain('data-testid="audio-waveform-visualizer"');
      expect(html).toContain('aria-label="Audio waveform indicator"');
    });

    it('AudioWaveformBeatsService generates deterministic waveform points and beat markers', () => {
      // Shortzz audio waveform points generation
      const points = AudioWaveformBeatsService.getWaveformPoints(120, 64);
      expect(points.length).toBe(64);
      for (const pt of points) {
        expect(pt).toBeGreaterThanOrEqual(0.05);
        expect(pt).toBeLessThanOrEqual(1.0);
      }

      // Analyze track with Shortzz beats engine
      const analysis = AudioWaveformBeatsService.analyzeTrack('sample-track-1', 60, undefined, 32);
      expect(analysis.audioTrackId).toBe('sample-track-1');
      expect(analysis.durationSeconds).toBe(60);
      expect(analysis.barCount).toBe(32);
      expect(analysis.amplitudeBars.length).toBe(32);
      expect(analysis.estimatedBpm).toBeGreaterThanOrEqual(60);
      expect(analysis.estimatedBpm).toBeLessThanOrEqual(200);
      expect(analysis.beatMarkers.length).toBeGreaterThan(0);

      // Nearest beat drop lookup
      const nearest = AudioWaveformBeatsService.getNearestBeat(500, analysis.beatMarkers);
      expect(nearest).toBeDefined();
      expect(nearest?.timestampMs).toBeDefined();
    });

    it('handles zero or negative duration gracefully in AudioWaveformBeatsService', () => {
      const fallbackPoints = AudioWaveformBeatsService.getWaveformPoints(0, 32);
      expect(fallbackPoints.length).toBe(32);
      expect(fallbackPoints[0]).toBe(0.1);
    });
  });
});
