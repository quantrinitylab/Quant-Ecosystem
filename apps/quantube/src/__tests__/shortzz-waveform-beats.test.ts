import { describe, it, expect } from 'vitest';
import { audioWaveformBeatsService } from '../services/audio-waveform-beats.service';

describe('AudioWaveformBeatsService', () => {
  describe('generateWaveformBars', () => {
    it('outputs requested bar count and normalizes amplitudes between 0.05 and 1.0', () => {
      // Simulate 1000 raw audio samples (mixed low and high amplitude)
      const samples = Array.from({ length: 1000 }, (_, i) => {
        return Math.sin(i * 0.1) * (i % 2 === 0 ? 0.9 : 0.1);
      });

      const bars = audioWaveformBeatsService.generateWaveformBars(samples, 64);

      expect(bars.length).toBe(64);
      for (const bar of bars) {
        expect(bar).toBeGreaterThanOrEqual(0.05);
        expect(bar).toBeLessThanOrEqual(1.0);
      }
    });

    it('returns empty fallback if no samples', () => {
      const bars = audioWaveformBeatsService.generateWaveformBars([], 64);
      expect(bars.length).toBe(64);
      expect(bars[0]).toBe(0.05);
    });
  });

  describe('detectTempoAndBeats', () => {
    it('generates rhythmic beat markers and clamps BPM between 60 and 200', () => {
      const energySamples = Array(128).fill(0.5);
      // Give a crazy high bpm hint
      const result = audioWaveformBeatsService.detectTempoAndBeats(10, energySamples, 300);

      expect(result.bpm).toBe(200); // Clamped
      expect(result.markers.length).toBeGreaterThan(0);

      // Should have periodic timestamps based on 200 BPM
      // 200 BPM = 3.33 beats per sec = 300ms per beat
      expect(result.markers[1].timestampMs - result.markers[0].timestampMs).toBe(300);
    });

    it('high-energy peaks identify beat drops', () => {
      const energySamples = [0.1, 0.2, 0.9, 0.1]; // Third sample is a peak > 0.8
      const result = audioWaveformBeatsService.detectTempoAndBeats(10, energySamples, 120);

      const dropMarkers = result.markers.filter((m) => m.isDrop);
      expect(dropMarkers.length).toBeGreaterThan(0);
      dropMarkers.forEach((m) => {
        expect(m.energy).toBeGreaterThanOrEqual(0.8);
      });
    });
  });

  describe('getNearestBeatMarker', () => {
    it('finds the closest temporal marker', () => {
      const markers = [
        { timestampMs: 0, energy: 0.1, isDrop: false },
        { timestampMs: 500, energy: 0.2, isDrop: false },
        { timestampMs: 1000, energy: 0.9, isDrop: true },
      ];

      const nearest = audioWaveformBeatsService.getNearestBeatMarker(450, markers);
      expect(nearest?.timestampMs).toBe(500);

      const nearest2 = audioWaveformBeatsService.getNearestBeatMarker(1100, markers);
      expect(nearest2?.timestampMs).toBe(1000);
    });

    it('returns null if empty array', () => {
      expect(audioWaveformBeatsService.getNearestBeatMarker(100, [])).toBeNull();
    });
  });

  describe('analyzeAudioTrack', () => {
    it('returns complete result object', () => {
      const samples = Array.from({ length: 500 }, () => Math.random());

      const result = audioWaveformBeatsService.analyzeAudioTrack('track-123', 30, samples, 64);

      expect(result.audioTrackId).toBe('track-123');
      expect(result.durationSeconds).toBe(30);
      expect(result.barCount).toBe(64);
      expect(result.amplitudeBars.length).toBe(64);
      expect(result.estimatedBpm).toBeGreaterThanOrEqual(60);
      expect(result.estimatedBpm).toBeLessThanOrEqual(200);
      expect(result.beatMarkers.length).toBeGreaterThan(0);
      expect(typeof result.dropCount).toBe('number');
      expect(result.id).toContain('waveform-track-123-');
    });
  });
});
