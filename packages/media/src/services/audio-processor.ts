// ============================================================================
// Media - Audio Processor
// Audio processing pipeline with waveform generation and effects
// ============================================================================

import type {
  AudioCodec,
  AudioEffectConfig,
  WaveformData,
  MediaMetadata,
  ProcessingJob,
} from '../types';

/** Audio source information */
interface AudioSource {
  id: string;
  fileName: string;
  duration: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  codec: AudioCodec;
  bitrate: number;
  size: number;
  samples: number[];
}

/** Audio processing configuration */
interface AudioProcessorConfig {
  defaultSampleRate: number;
  defaultBitDepth: number;
  maxDuration: number;
  waveformSamples: number;
}

const DEFAULT_CONFIG: AudioProcessorConfig = {
  defaultSampleRate: 44100,
  defaultBitDepth: 16,
  maxDuration: 7200, // 2 hours max
  waveformSamples: 1000,
};

/**
 * AudioProcessor - Audio processing and analysis pipeline
 *
 * Provides normalization, trimming, effects application,
 * waveform generation, metadata extraction, format conversion,
 * and silence detection. Simulates real DSP operations.
 */
export class AudioProcessor {
  private config: AudioProcessorConfig;
  private sources: Map<string, AudioSource>;
  private jobs: Map<string, ProcessingJob>;
  private effectsChain: Map<string, AudioEffectConfig[]>;

  constructor(config: Partial<AudioProcessorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sources = new Map();
    this.jobs = new Map();
    this.effectsChain = new Map();
  }

  /**
   * Load an audio source for processing
   */
  public loadAudio(
    id: string,
    fileName: string,
    options: {
      duration: number;
      sampleRate?: number;
      channels?: number;
      bitDepth?: number;
      codec?: AudioCodec;
      bitrate?: number;
    },
  ): AudioSource {
    const sampleRate = options.sampleRate || this.config.defaultSampleRate;
    const channels = options.channels || 2;
    const bitDepth = options.bitDepth || this.config.defaultBitDepth;
    const duration = Math.min(options.duration, this.config.maxDuration);

    // Generate simulated sample data
    const numSamples = Math.min(
      this.config.waveformSamples,
      Math.round((duration * sampleRate) / 100),
    );
    const samples = this.generateSamples(numSamples, duration);

    const size = Math.round(duration * sampleRate * channels * (bitDepth / 8));

    const source: AudioSource = {
      id,
      fileName,
      duration,
      sampleRate,
      channels,
      bitDepth,
      codec: options.codec || 'aac',
      bitrate: options.bitrate || 256,
      size,
      samples,
    };

    this.sources.set(id, source);
    this.effectsChain.set(id, []);
    return source;
  }

  /**
   * Normalize audio levels to target peak/RMS
   */
  public normalize(
    audioId: string,
    options: { targetPeak?: number; targetRMS?: number; mode?: 'peak' | 'rms' | 'lufs' } = {},
  ): AudioSource {
    const source = this.getSource(audioId);
    const mode = options.mode || 'peak';
    const targetPeak = options.targetPeak || -1; // dB
    const targetRMS = options.targetRMS || -14; // dB LUFS

    // Calculate current peak
    const currentPeak = Math.max(...source.samples.map(Math.abs));
    const currentPeakDb = 20 * Math.log10(currentPeak || 0.001);

    // Calculate gain needed
    let gainDb: number;
    if (mode === 'peak') {
      gainDb = targetPeak - currentPeakDb;
    } else if (mode === 'rms') {
      const currentRMS = this.calculateRMS(source.samples);
      const currentRMSdb = 20 * Math.log10(currentRMS || 0.001);
      gainDb = targetRMS - currentRMSdb;
    } else {
      // LUFS normalization (simplified)
      const currentRMS = this.calculateRMS(source.samples);
      const currentLUFS = 20 * Math.log10(currentRMS || 0.001) - 0.691;
      gainDb = targetRMS - currentLUFS;
    }

    // Apply gain to samples
    const gainLinear = Math.pow(10, gainDb / 20);
    source.samples = source.samples.map((s) => Math.max(-1, Math.min(1, s * gainLinear)));

    this.addEffect(audioId, {
      type: 'normalize',
      params: { gainDb, mode: mode === 'peak' ? 0 : mode === 'rms' ? 1 : 2 },
    });
    return source;
  }

  /**
   * Trim audio to specified start/end times
   */
  public trim(audioId: string, startMs: number, endMs: number): AudioSource {
    const source = this.getSource(audioId);
    const durationMs = source.duration * 1000;

    if (startMs < 0 || endMs > durationMs || startMs >= endMs) {
      throw new Error(`Invalid trim range: ${startMs}ms - ${endMs}ms (duration: ${durationMs}ms)`);
    }

    const newDuration = (endMs - startMs) / 1000;
    const startRatio = startMs / durationMs;
    const endRatio = endMs / durationMs;

    const startSample = Math.floor(startRatio * source.samples.length);
    const endSample = Math.ceil(endRatio * source.samples.length);
    source.samples = source.samples.slice(startSample, endSample);

    source.duration = newDuration;
    source.size = Math.round(
      newDuration * source.sampleRate * source.channels * (source.bitDepth / 8),
    );

    return source;
  }

  /**
   * Apply audio effects
   */
  public applyEffects(audioId: string, effects: AudioEffectConfig[]): AudioSource {
    const source = this.getSource(audioId);

    for (const effect of effects) {
      this.applyEffect(source, effect);
      this.addEffect(audioId, effect);
    }

    return source;
  }

  /**
   * Generate waveform visualization data
   */
  public generateWaveform(
    audioId: string,
    options: { samples?: number; channels?: number } = {},
  ): WaveformData {
    const source = this.getSource(audioId);
    const numSamples = options.samples || this.config.waveformSamples;

    // Resample to target number of visualization samples
    const samples: number[] = [];
    const peaks: number[] = [];
    const rms: number[] = [];

    const samplesPerBucket = source.samples.length / numSamples;

    for (let i = 0; i < numSamples; i++) {
      const start = Math.floor(i * samplesPerBucket);
      const end = Math.floor((i + 1) * samplesPerBucket);
      const bucket = source.samples.slice(start, Math.min(end, source.samples.length));

      if (bucket.length === 0) {
        samples.push(0);
        peaks.push(0);
        rms.push(0);
        continue;
      }

      // Average for waveform display
      const avg = bucket.reduce((sum, s) => sum + s, 0) / bucket.length;
      samples.push(avg);

      // Peak value
      peaks.push(Math.max(...bucket.map(Math.abs)));

      // RMS value
      const bucketRms = Math.sqrt(bucket.reduce((sum, s) => sum + s * s, 0) / bucket.length);
      rms.push(bucketRms);
    }

    return {
      samples,
      channels: source.channels,
      sampleRate: source.sampleRate,
      duration: source.duration,
      peaks,
      rms,
      bitDepth: source.bitDepth,
    };
  }

  /**
   * Extract metadata from audio
   */
  public extractMetadata(audioId: string): MediaMetadata {
    const source = this.getSource(audioId);

    return {
      id: audioId,
      type: 'audio',
      format: source.codec,
      size: source.size,
      duration: source.duration,
      bitrate: source.bitrate,
      codec: source.codec,
      sampleRate: source.sampleRate,
      channels: source.channels,
    };
  }

  /**
   * Convert audio to a different format
   */
  public convertFormat(
    audioId: string,
    targetCodec: AudioCodec,
    options: { bitrate?: number; sampleRate?: number; channels?: number } = {},
  ): AudioSource {
    const source = this.getSource(audioId);

    const codecBitrateRanges: Record<AudioCodec, { min: number; max: number; default: number }> = {
      aac: { min: 64, max: 320, default: 256 },
      mp3: { min: 64, max: 320, default: 256 },
      opus: { min: 32, max: 512, default: 128 },
      vorbis: { min: 64, max: 500, default: 192 },
      flac: { min: 600, max: 1400, default: 1000 },
      wav: { min: 1411, max: 1411, default: 1411 },
      pcm: { min: 1411, max: 1411, default: 1411 },
    };

    const range = codecBitrateRanges[targetCodec] || codecBitrateRanges.aac;
    const bitrate = Math.max(range.min, Math.min(range.max, options.bitrate || range.default));

    source.codec = targetCodec;
    source.bitrate = bitrate;
    if (options.sampleRate) source.sampleRate = options.sampleRate;
    if (options.channels) source.channels = options.channels;

    // Recalculate size based on new codec
    if (targetCodec === 'wav' || targetCodec === 'pcm' || targetCodec === 'flac') {
      source.size = Math.round(
        source.duration * source.sampleRate * source.channels * (source.bitDepth / 8),
      );
    } else {
      source.size = Math.round(source.duration * bitrate * 125); // kbps to bytes
    }

    return source;
  }

  /**
   * Detect silence in audio (returns silence regions)
   */
  public detectSilence(
    audioId: string,
    options: { threshold?: number; minDurationMs?: number } = {},
  ): Array<{ startMs: number; endMs: number; durationMs: number }> {
    const source = this.getSource(audioId);
    const threshold = options.threshold || 0.01; // Amplitude threshold
    const minDuration = options.minDurationMs || 500; // Minimum 500ms silence

    const silenceRegions: Array<{ startMs: number; endMs: number; durationMs: number }> = [];
    const msPerSample = (source.duration * 1000) / source.samples.length;

    let silenceStart: number | null = null;

    for (let i = 0; i < source.samples.length; i++) {
      const amplitude = Math.abs(source.samples[i]!);
      const timeMs = i * msPerSample;

      if (amplitude < threshold) {
        if (silenceStart === null) {
          silenceStart = timeMs;
        }
      } else {
        if (silenceStart !== null) {
          const duration = timeMs - silenceStart;
          if (duration >= minDuration) {
            silenceRegions.push({
              startMs: Math.round(silenceStart),
              endMs: Math.round(timeMs),
              durationMs: Math.round(duration),
            });
          }
          silenceStart = null;
        }
      }
    }

    // Check if silence extends to end
    if (silenceStart !== null) {
      const endMs = source.duration * 1000;
      const duration = endMs - silenceStart;
      if (duration >= minDuration) {
        silenceRegions.push({
          startMs: Math.round(silenceStart),
          endMs: Math.round(endMs),
          durationMs: Math.round(duration),
        });
      }
    }

    return silenceRegions;
  }

  /**
   * Get audio source
   */
  public getAudioSource(audioId: string): AudioSource | undefined {
    return this.sources.get(audioId);
  }

  /**
   * Get all processing jobs
   */
  public getJobs(): ProcessingJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Delete an audio source
   */
  public deleteAudio(audioId: string): boolean {
    this.effectsChain.delete(audioId);
    return this.sources.delete(audioId);
  }

  // ---- Private Methods ----

  private getSource(audioId: string): AudioSource {
    const source = this.sources.get(audioId);
    if (!source) throw new Error(`Audio source not found: ${audioId}`);
    return source;
  }

  private applyEffect(source: AudioSource, effect: AudioEffectConfig): void {
    switch (effect.type) {
      case 'fade_in': {
        const fadeSamples = Math.floor(
          (((effect.params.durationMs || 1000) / 1000) * source.samples.length) / source.duration,
        );
        for (let i = 0; i < Math.min(fadeSamples, source.samples.length); i++) {
          source.samples[i] = source.samples[i]! * (i / fadeSamples);
        }
        break;
      }
      case 'fade_out': {
        const fadeSamples = Math.floor(
          (((effect.params.durationMs || 1000) / 1000) * source.samples.length) / source.duration,
        );
        const startIdx = source.samples.length - fadeSamples;
        for (let i = Math.max(0, startIdx); i < source.samples.length; i++) {
          source.samples[i] = source.samples[i]! * ((source.samples.length - i) / fadeSamples);
        }
        break;
      }
      case 'echo': {
        const delay = Math.floor(
          (((effect.params.delayMs || 300) / 1000) * source.samples.length) / source.duration,
        );
        const decay = effect.params.decay || 0.5;
        for (let i = delay; i < source.samples.length; i++) {
          source.samples[i] = source.samples[i]! + source.samples[i - delay]! * decay;
          source.samples[i] = Math.max(-1, Math.min(1, source.samples[i]!));
        }
        break;
      }
      case 'reverb': {
        const reverbTime = effect.params.reverbTime || 0.3;
        const mix = effect.params.mix || 0.3;
        const delaySamples = Math.floor((reverbTime * source.samples.length) / source.duration);
        for (let i = delaySamples; i < source.samples.length; i++) {
          const reverbed =
            source.samples[i - delaySamples]! * 0.6 +
            (i > delaySamples * 2 ? source.samples[i - delaySamples * 2]! * 0.3 : 0);
          source.samples[i] = source.samples[i]! * (1 - mix) + reverbed * mix;
          source.samples[i] = Math.max(-1, Math.min(1, source.samples[i]!));
        }
        break;
      }
      case 'pitch_shift': {
        const factor = effect.params.semitones ? Math.pow(2, effect.params.semitones / 12) : 1;
        const newSamples: number[] = [];
        for (let i = 0; i < source.samples.length; i++) {
          const srcIdx = i * factor;
          const idx = Math.floor(srcIdx);
          if (idx < source.samples.length - 1) {
            const frac = srcIdx - idx;
            newSamples.push(source.samples[idx]! * (1 - frac) + source.samples[idx + 1]! * frac);
          }
        }
        source.samples = newSamples;
        break;
      }
      case 'speed': {
        const speedFactor = effect.params.factor || 1.0;
        const newSamples: number[] = [];
        for (let i = 0; i < source.samples.length * (1 / speedFactor); i++) {
          const srcIdx = Math.floor(i * speedFactor);
          if (srcIdx < source.samples.length) {
            newSamples.push(source.samples[srcIdx]!);
          }
        }
        source.samples = newSamples;
        source.duration /= speedFactor;
        break;
      }
      case 'compressor': {
        const threshold = effect.params.threshold || 0.5;
        const ratio = effect.params.ratio || 4;
        for (let i = 0; i < source.samples.length; i++) {
          const abs = Math.abs(source.samples[i]!);
          if (abs > threshold) {
            const excess = abs - threshold;
            const compressed = threshold + excess / ratio;
            source.samples[i] = source.samples[i]! > 0 ? compressed : -compressed;
          }
        }
        break;
      }
      case 'noise_reduction': {
        // Simple noise gate
        const gate = effect.params.threshold || 0.02;
        for (let i = 0; i < source.samples.length; i++) {
          if (Math.abs(source.samples[i]!) < gate) {
            source.samples[i] = 0;
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private addEffect(audioId: string, effect: AudioEffectConfig): void {
    const chain = this.effectsChain.get(audioId) || [];
    chain.push(effect);
    this.effectsChain.set(audioId, chain);
  }

  private calculateRMS(samples: number[]): number {
    if (samples.length === 0) return 0;
    const sum = samples.reduce((acc, s) => acc + s * s, 0);
    return Math.sqrt(sum / samples.length);
  }

  private generateSamples(numSamples: number, duration: number): number[] {
    const samples: number[] = [];
    const frequency = 440; // Base frequency for simulation

    for (let i = 0; i < numSamples; i++) {
      const t = (i / numSamples) * duration;
      // Generate a mix of frequencies to simulate music
      const sample =
        Math.sin(2 * Math.PI * frequency * t) * 0.3 +
        Math.sin(2 * Math.PI * frequency * 2 * t) * 0.15 +
        Math.sin(2 * Math.PI * frequency * 0.5 * t) * 0.2 +
        (Math.random() - 0.5) * 0.1; // Add some noise
      samples.push(Math.max(-1, Math.min(1, sample)));
    }

    return samples;
  }
}
