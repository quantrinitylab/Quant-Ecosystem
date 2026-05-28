import type { AdaptiveVADConfig, AudioChunk, VADEvent } from '../types.js';
import { VoiceActivityDetector } from './vad.js';

const DEFAULT_ADAPTIVE_CONFIG: AdaptiveVADConfig = {
  threshold: 0.01,
  silenceDuration: 500,
  minSpeechDuration: 100,
  calibrationDurationMs: 500,
  adaptiveThreshold: 3,
  noiseFloorSmoothing: 0.1,
};

export class AdaptiveVAD {
  private config: AdaptiveVADConfig;
  private vad: VoiceActivityDetector;
  private noiseFloor = 0;
  private calibrationSamples: number[] = [];
  private calibrationStartTime: number | null = null;
  private calibrated = false;
  private eventCallbacks: ((event: VADEvent) => void)[] = [];

  constructor(config?: Partial<AdaptiveVADConfig>) {
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config };
    this.vad = new VoiceActivityDetector({
      threshold: this.config.threshold,
      silenceDuration: this.config.silenceDuration,
      minSpeechDuration: this.config.minSpeechDuration,
    });
    this.vad.onEvent((event) => {
      for (const cb of this.eventCallbacks) {
        cb(event);
      }
    });
  }

  start(): void {
    this.calibrated = false;
    this.calibrationSamples = [];
    this.calibrationStartTime = null;
    this.noiseFloor = 0;
    this.vad.start();
  }

  stop(): void {
    this.vad.stop();
  }

  feedAudio(chunk: AudioChunk): void {
    if (!this.calibrated) {
      this.calibrate(chunk);
      return;
    }
    this.vad.feedAudio(chunk);
  }

  onEvent(cb: (event: VADEvent) => void): void {
    this.eventCallbacks.push(cb);
  }

  getNoiseFloor(): number {
    return this.noiseFloor;
  }

  isCalibrating(): boolean {
    return !this.calibrated;
  }

  private calibrate(chunk: AudioChunk): void {
    if (this.calibrationStartTime === null) {
      this.calibrationStartTime = chunk.timestamp;
    }

    const rms = this.computeRMS(chunk.data);

    // Apply exponential moving average with noiseFloorSmoothing factor
    if (this.calibrationSamples.length === 0) {
      this.noiseFloor = rms;
    } else {
      const alpha = this.config.noiseFloorSmoothing;
      this.noiseFloor = alpha * rms + (1 - alpha) * this.noiseFloor;
    }
    this.calibrationSamples.push(rms);

    const elapsed = chunk.timestamp - this.calibrationStartTime;
    if (elapsed >= this.config.calibrationDurationMs) {
      // Update VAD threshold based on noise floor
      const adaptedThreshold = this.noiseFloor * this.config.adaptiveThreshold;
      this.vad.stop();
      this.vad = new VoiceActivityDetector({
        threshold: Math.max(adaptedThreshold, this.config.threshold),
        silenceDuration: this.config.silenceDuration,
        minSpeechDuration: this.config.minSpeechDuration,
      });
      this.vad.onEvent((event) => {
        for (const cb of this.eventCallbacks) {
          cb(event);
        }
      });
      this.vad.start();
      this.calibrated = true;
    }
  }

  private computeRMS(data: Float32Array): number {
    if (data.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const sample = data[i] ?? 0;
      sum += sample * sample;
    }
    return Math.sqrt(sum / data.length);
  }
}
