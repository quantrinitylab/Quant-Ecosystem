// ============================================================================
// QuantTube - Sound Sync & Audio Dubbing Engine Unit Tests
// Vitest Suite for Shortzz & Shortie Music Sync & Audio Dubbing Engine
// Task: Category filtering, volume mixing ratio calculation, trimming time offsets
// ============================================================================

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import {
  SoundSyncModal,
  filterTracksByCategory,
  calculateMixingRatio,
  clampTrimOffset,
  formatTimeOffset,
  generateWaveform,
  DEFAULT_SOUND_TRACKS,
  SOUND_CATEGORIES,
  SoundTrack,
  AppliedSound,
} from '../components/upload/SoundSyncModal';

describe('QuanTube Sound Sync & Audio Dubbing Engine (Shortzz & Shortie)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Sound Categories & Filtering', () => {
    it('provides all 6 required Shortzz & Shortie categories', () => {
      expect(SOUND_CATEGORIES).toEqual([
        'Trending',
        'Pop',
        'Cinematic',
        'Gaming',
        'Ambient',
        'Original Audio',
      ]);
    });

    it('contains default curated tracks across all categories', () => {
      SOUND_CATEGORIES.forEach((category) => {
        const filtered = filterTracksByCategory(DEFAULT_SOUND_TRACKS, category);
        expect(filtered.length).toBeGreaterThan(0);
        filtered.forEach((track) => {
          expect(track.category).toBe(category);
          expect(track.id).toBeDefined();
          expect(track.title).toBeTruthy();
          expect(track.artist).toBeTruthy();
          expect(track.durationSeconds).toBeGreaterThan(0);
        });
      });
    });

    it('returns all tracks when category is "All"', () => {
      const all = filterTracksByCategory(DEFAULT_SOUND_TRACKS, 'All');
      expect(all.length).toBe(DEFAULT_SOUND_TRACKS.length);
    });

    it('correctly filters specific categories with custom track sets', () => {
      const customTracks: SoundTrack[] = [
        {
          id: 't1',
          title: 'Beat 1',
          artist: 'A1',
          category: 'Trending',
          duration: '1:00',
          durationSeconds: 60,
          coverUrl: '',
          audioUrl: '',
        },
        {
          id: 't2',
          title: 'Beat 2',
          artist: 'A2',
          category: 'Pop',
          duration: '1:30',
          durationSeconds: 90,
          coverUrl: '',
          audioUrl: '',
        },
        {
          id: 't3',
          title: 'Beat 3',
          artist: 'A3',
          category: 'Gaming',
          duration: '2:00',
          durationSeconds: 120,
          coverUrl: '',
          audioUrl: '',
        },
      ];

      const trending = filterTracksByCategory(customTracks, 'Trending');
      expect(trending).toHaveLength(1);
      expect(trending[0].id).toBe('t1');

      const pop = filterTracksByCategory(customTracks, 'Pop');
      expect(pop).toHaveLength(1);
      expect(pop[0].id).toBe('t2');

      const ambient = filterTracksByCategory(customTracks, 'Ambient');
      expect(ambient).toHaveLength(0);
    });
  });

  describe('2. Audio Volume Mixing Ratio Calculations', () => {
    it('calculates balanced 50/50 volume mix ratio correctly', () => {
      const mix = calculateMixingRatio(50, 50);
      expect(mix.videoAudioPercent).toBe(50);
      expect(mix.backgroundTrackPercent).toBe(50);
      expect(mix.normalizedVideo).toBe(0.5);
      expect(mix.normalizedBg).toBe(0.5);
      expect(mix.ratio).toBe(1);
    });

    it('calculates voice focus (80% video / 20% music) mix ratio', () => {
      const mix = calculateMixingRatio(80, 20);
      expect(mix.videoAudioPercent).toBe(80);
      expect(mix.backgroundTrackPercent).toBe(20);
      expect(mix.normalizedVideo).toBe(0.8);
      expect(mix.normalizedBg).toBe(0.2);
      expect(mix.ratio).toBe(0.25);
    });

    it('calculates music video focus (20% video / 80% music) mix ratio', () => {
      const mix = calculateMixingRatio(20, 80);
      expect(mix.videoAudioPercent).toBe(20);
      expect(mix.backgroundTrackPercent).toBe(80);
      expect(mix.ratio).toBe(4);
    });

    it('handles zero video volume edge case without NaN or division by zero', () => {
      const mix = calculateMixingRatio(0, 100);
      expect(mix.videoAudioPercent).toBe(0);
      expect(mix.backgroundTrackPercent).toBe(100);
      expect(mix.normalizedVideo).toBe(0);
      expect(mix.normalizedBg).toBe(1);
      expect(mix.ratio).toBe(999);
      expect(Number.isFinite(mix.ratio)).toBe(true);
    });

    it('clamps boundary values between 0 and 100', () => {
      const clampedNegative = calculateMixingRatio(-15, -50);
      expect(clampedNegative.videoAudioPercent).toBe(0);
      expect(clampedNegative.backgroundTrackPercent).toBe(0);

      const clampedExcess = calculateMixingRatio(150, 200);
      expect(clampedExcess.videoAudioPercent).toBe(100);
      expect(clampedExcess.backgroundTrackPercent).toBe(100);
    });

    it('rounds floating volume percentages to whole integers', () => {
      const mix = calculateMixingRatio(73.6, 26.4);
      expect(mix.videoAudioPercent).toBe(74);
      expect(mix.backgroundTrackPercent).toBe(26);
    });
  });

  describe('3. Trimming Time Offsets and Boundary Checks', () => {
    it('formats time offsets accurately into M:SS strings', () => {
      expect(formatTimeOffset(0)).toBe('0:00');
      expect(formatTimeOffset(5)).toBe('0:05');
      expect(formatTimeOffset(30)).toBe('0:30');
      expect(formatTimeOffset(60)).toBe('1:00');
      expect(formatTimeOffset(95)).toBe('1:35');
    });

    it('handles negative or NaN time offset gracefully', () => {
      expect(formatTimeOffset(-10)).toBe('0:00');
      expect(formatTimeOffset(NaN)).toBe('0:00');
    });

    it('clamps trim offset to standard 0:00 to 1:00 (60s) window', () => {
      // Normal valid offset
      expect(clampTrimOffset(30, 120, 60)).toBe(30);

      // Lower boundary: negative offsets clamp to 0 (0:00)
      expect(clampTrimOffset(-5, 120, 60)).toBe(0);
      expect(clampTrimOffset(0, 120, 60)).toBe(0);

      // Upper boundary: values exceeding 60 clamp to 60 (1:00)
      expect(clampTrimOffset(60, 120, 60)).toBe(60);
      expect(clampTrimOffset(75, 120, 60)).toBe(60);
      expect(clampTrimOffset(999, 120, 60)).toBe(60);
    });

    it('clamps trim offset to track duration when track is shorter than 60s', () => {
      const shortTrackSeconds = 45;
      expect(clampTrimOffset(50, shortTrackSeconds, 60)).toBe(45);
      expect(clampTrimOffset(30, shortTrackSeconds, 60)).toBe(30);
    });

    it('handles NaN or non-number offsets safely', () => {
      expect(clampTrimOffset(NaN, 60, 60)).toBe(0);
    });
  });

  describe('4. Waveform Generator', () => {
    it('generates deterministic waveform bars based on seed', () => {
      const wave1 = generateWaveform('track-01', 40);
      const wave2 = generateWaveform('track-01', 40);
      expect(wave1).toEqual(wave2);
      expect(wave1).toHaveLength(40);
      wave1.forEach((bar) => {
        expect(bar).toBeGreaterThanOrEqual(15);
        expect(bar).toBeLessThanOrEqual(100);
      });
    });

    it('generates different waveforms for different track seeds', () => {
      const waveA = generateWaveform('track-A', 30);
      const waveB = generateWaveform('track-B', 30);
      expect(waveA).not.toEqual(waveB);
    });
  });

  describe('5. Component Integration & Apply Sound Callback', () => {
    it('defines SoundSyncModal component properly', () => {
      expect(SoundSyncModal).toBeDefined();
      expect(typeof SoundSyncModal).toBe('function');
    });

    it('simulates Apply Sound contract structure', () => {
      const onApplySound = vi.fn();
      const onClose = vi.fn();

      const sampleTrack = DEFAULT_SOUND_TRACKS[0];
      const selectedOffset = 15;
      const videoVol = 75;
      const musicVol = 35;

      const mix = calculateMixingRatio(videoVol, musicVol);
      const appliedPayload: AppliedSound = {
        soundId: sampleTrack.id,
        title: sampleTrack.title,
        artist: sampleTrack.artist,
        startOffset: selectedOffset,
        volumeRatio: {
          videoAudioPercent: mix.videoAudioPercent,
          backgroundTrackPercent: mix.backgroundTrackPercent,
        },
      };

      onApplySound(appliedPayload);

      expect(onApplySound).toHaveBeenCalledTimes(1);
      expect(onApplySound).toHaveBeenCalledWith({
        soundId: sampleTrack.id,
        title: sampleTrack.title,
        artist: sampleTrack.artist,
        startOffset: 15,
        volumeRatio: {
          videoAudioPercent: 75,
          backgroundTrackPercent: 35,
        },
      });
    });
  });
});
