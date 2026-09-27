// ============================================================================
// QuanTube - Audio Waveform & Beats Service
// Shortzz audio waveform visualizer integration & beat marker detection
// ============================================================================

import {
  audioWaveformBeatsService,
  BeatMarker,
  WaveformAnalysisResult,
  AudioWaveformBeatsService as CoreAudioWaveformBeatsService,
} from './audio-waveform-beats.service';

export type { BeatMarker, WaveformAnalysisResult };

export class AudioWaveformBeatsService {
  /**
   * Generates deterministic waveform points for the given duration using Shortzz audio waveform analysis algorithms.
   */
  static getWaveformPoints(duration: number, pointsCount: number = 100): number[] {
    const count = Math.max(1, pointsCount);
    if (!duration || duration <= 0) {
      return Array(count).fill(0.1);
    }

    // Synthesize rhythmic waveform with 120BPM beat pulse and harmonics (Shortzz waveform pattern)
    const samples: number[] = [];
    const sampleCount = Math.max(count * 4, 200);
    for (let i = 0; i < sampleCount; i++) {
      const t = (i / sampleCount) * duration;
      const beatPulse = Math.sin(2 * Math.PI * 2.0 * t) ** 4;
      const subRhythm = Math.sin(2 * Math.PI * 0.5 * t);
      const highFreq = Math.cos(2 * Math.PI * 4.5 * t);
      const amp = 0.15 + 0.55 * beatPulse + 0.2 * Math.abs(subRhythm) + 0.1 * Math.abs(highFreq);
      samples.push(Math.min(1.0, Math.max(0.05, amp)));
    }

    return audioWaveformBeatsService.generateWaveformBars(samples, count);
  }

  /**
   * Performs full waveform analysis including BPM estimation and beat drop markers
   */
  static analyzeTrack(
    trackId: string,
    durationSeconds: number,
    rawSamples?: number[],
    targetBarCount: number = 64,
  ): WaveformAnalysisResult {
    const samples =
      rawSamples && rawSamples.length > 0
        ? rawSamples
        : this.getWaveformPoints(durationSeconds, targetBarCount * 4);
    return audioWaveformBeatsService.analyzeAudioTrack(
      trackId,
      durationSeconds,
      samples,
      targetBarCount,
    );
  }

  /**
   * Finds nearest beat drop marker for beat-synced video transitions
   */
  static getNearestBeat(currentTimeMs: number, markers: BeatMarker[]): BeatMarker | null {
    return audioWaveformBeatsService.getNearestBeatMarker(currentTimeMs, markers);
  }
}

export { audioWaveformBeatsService, CoreAudioWaveformBeatsService };
