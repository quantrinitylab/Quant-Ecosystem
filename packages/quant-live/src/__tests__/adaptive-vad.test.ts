import { describe, it, expect } from 'vitest';
import { AdaptiveVAD } from '../asr/adaptive-vad.js';
import type { AudioChunk, VADEvent } from '../types.js';

function createChunk(samples: number[], timestamp: number): AudioChunk {
  return {
    data: new Float32Array(samples),
    sampleRate: 16000,
    channels: 1,
    timestamp,
    duration: 20,
  };
}

describe('AdaptiveVAD', () => {
  it('calibrates noise floor from first N ms of audio', () => {
    const vad = new AdaptiveVAD({
      calibrationDurationMs: 100,
      adaptiveThreshold: 3,
    });
    vad.start();

    expect(vad.isCalibrating()).toBe(true);

    // Feed quiet audio during calibration (100ms total)
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 0));
    vad.feedAudio(createChunk([0.002, 0.002, 0.002, 0.002], 20));
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 40));
    vad.feedAudio(createChunk([0.002, 0.002, 0.002, 0.002], 60));
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 80));

    // Still calibrating (only 80ms elapsed)
    expect(vad.isCalibrating()).toBe(true);

    // This pushes past 100ms
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 100));

    expect(vad.isCalibrating()).toBe(false);
    expect(vad.getNoiseFloor()).toBeGreaterThan(0);
    expect(vad.getNoiseFloor()).toBeLessThan(0.01);
  });

  it('adjusts threshold dynamically after calibration', () => {
    const vad = new AdaptiveVAD({
      calibrationDurationMs: 60,
      adaptiveThreshold: 3,
      minSpeechDuration: 0,
    });
    const events: VADEvent[] = [];
    vad.onEvent((e) => events.push(e));
    vad.start();

    // Calibrate with quiet audio
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 0));
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 20));
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 40));
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 60));

    expect(vad.isCalibrating()).toBe(false);

    // Noise floor ~0.001, adaptive threshold = 0.001 * 3 = 0.003
    // Feed loud audio - should trigger speech
    vad.feedAudio(createChunk([0.5, 0.5, 0.5, 0.5], 80));

    const speechStart = events.find((e) => e.type === 'speech-start');
    expect(speechStart).toBeDefined();
  });

  it('does not detect speech during calibration phase', () => {
    const vad = new AdaptiveVAD({
      calibrationDurationMs: 500,
      adaptiveThreshold: 3,
      minSpeechDuration: 0,
    });
    const events: VADEvent[] = [];
    vad.onEvent((e) => events.push(e));
    vad.start();

    // Feed loud audio during calibration - should not trigger speech
    vad.feedAudio(createChunk([0.9, 0.9, 0.9, 0.9], 0));
    vad.feedAudio(createChunk([0.9, 0.9, 0.9, 0.9], 20));

    expect(vad.isCalibrating()).toBe(true);
    const speechEvents = events.filter((e) => e.type === 'speech-start');
    expect(speechEvents.length).toBe(0);
  });

  it('detects speech end after silence following calibration', () => {
    const vad = new AdaptiveVAD({
      calibrationDurationMs: 60,
      adaptiveThreshold: 3,
      silenceDuration: 100,
      minSpeechDuration: 0,
    });
    const events: VADEvent[] = [];
    vad.onEvent((e) => events.push(e));
    vad.start();

    // Calibrate with quiet audio
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 0));
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 20));
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 40));
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 60));

    // Loud audio triggers speech start
    vad.feedAudio(createChunk([0.5, 0.5, 0.5, 0.5], 80));

    // Silence after 100ms should trigger speech end
    vad.feedAudio(createChunk([0.0001, 0.0001, 0.0001, 0.0001], 200));

    const speechEnd = events.find((e) => e.type === 'speech-end');
    expect(speechEnd).toBeDefined();
  });

  it('noise floor is zero before calibration', () => {
    const vad = new AdaptiveVAD({ calibrationDurationMs: 500 });
    vad.start();
    expect(vad.getNoiseFloor()).toBe(0);
  });

  it('stop emits speech-end if speaking', () => {
    const vad = new AdaptiveVAD({
      calibrationDurationMs: 60,
      adaptiveThreshold: 3,
      minSpeechDuration: 0,
    });
    const events: VADEvent[] = [];
    vad.onEvent((e) => events.push(e));
    vad.start();

    // Calibrate
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 0));
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 20));
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 40));
    vad.feedAudio(createChunk([0.001, 0.001, 0.001, 0.001], 60));

    // Start speaking
    vad.feedAudio(createChunk([0.5, 0.5, 0.5, 0.5], 80));

    // Stop while speaking
    vad.stop();

    const speechEnd = events.find((e) => e.type === 'speech-end');
    expect(speechEnd).toBeDefined();
  });
});
