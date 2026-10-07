import { describe, it, expect } from 'vitest';
import { KeyframeExtractor, MockFrameExtractorBackend } from './keyframe-extractor';

describe('KeyframeExtractor', () => {
  it('should calculate correct timestamps for a 60s video (30 + 6 = 36 frames)', () => {
    const backend = new MockFrameExtractorBackend();
    const extractor = new KeyframeExtractor(backend);

    const timestamps = extractor.calculateTimestamps(60);

    // First 30s: 1 frame/s -> timestamps 0,1,2,...,29 = 30 frames
    // After 30s: 1 frame/5s -> timestamps 30,35,40,45,50,55 = 6 frames
    expect(timestamps).toHaveLength(36);
    // Verify early phase
    for (let i = 0; i < 30; i++) {
      expect(timestamps[i]).toBe(i);
    }
    // Verify late phase
    expect(timestamps[30]).toBe(30);
    expect(timestamps[31]).toBe(35);
    expect(timestamps[32]).toBe(40);
    expect(timestamps[33]).toBe(45);
    expect(timestamps[34]).toBe(50);
    expect(timestamps[35]).toBe(55);
  });

  it('should calculate correct timestamps for a 10s video (10 frames)', () => {
    const backend = new MockFrameExtractorBackend();
    const extractor = new KeyframeExtractor(backend);

    const timestamps = extractor.calculateTimestamps(10);

    // Only early phase: 0,1,2,...,9 = 10 frames
    expect(timestamps).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(timestamps[i]).toBe(i);
    }
  });

  it('should calculate correct timestamps for a 30s video (30 frames)', () => {
    const backend = new MockFrameExtractorBackend();
    const extractor = new KeyframeExtractor(backend);

    const timestamps = extractor.calculateTimestamps(30);

    // Exactly 30s: only early phase, 0..29 = 30 frames
    expect(timestamps).toHaveLength(30);
  });

  it('should calculate correct timestamps for a 120s video', () => {
    const backend = new MockFrameExtractorBackend();
    const extractor = new KeyframeExtractor(backend);

    const timestamps = extractor.calculateTimestamps(120);

    // Early: 30 frames (0-29)
    // Late: (120-30)/5 = 18 frames (30,35,40,...,115)
    expect(timestamps).toHaveLength(48);
  });

  it('should extract the correct number of frames for a given duration', async () => {
    const backend = new MockFrameExtractorBackend();
    const extractor = new KeyframeExtractor(backend);

    const results = await extractor.extract('/path/to/video.mp4', 60);

    expect(results).toHaveLength(36);
    expect(results[0]!.timestamp).toBe(0);
    expect(results[0]!.buffer).toBeDefined();
    expect(backend.extractedTimestamps).toHaveLength(36);
  });

  it('should pass timestamps to the backend', async () => {
    const backend = new MockFrameExtractorBackend();
    const extractor = new KeyframeExtractor(backend);

    await extractor.extract('test-video.mp4', 35);

    // 30 early + 1 late (at t=30) = 31
    expect(backend.extractedTimestamps).toHaveLength(31);
    expect(backend.extractedTimestamps[30]).toBe(30);
  });

  it('should support custom interval configuration', () => {
    const backend = new MockFrameExtractorBackend();
    const extractor = new KeyframeExtractor(backend, {
      earlyIntervalSeconds: 2,
      lateIntervalSeconds: 10,
      earlyPhaseDuration: 20,
    });

    const timestamps = extractor.calculateTimestamps(60);

    // Early: 0,2,4,...,18 = 10 frames
    // Late: 20,30,40,50 = 4 frames
    expect(timestamps).toHaveLength(14);
    expect(timestamps[0]).toBe(0);
    expect(timestamps[9]).toBe(18);
    expect(timestamps[10]).toBe(20);
    expect(timestamps[13]).toBe(50);
  });

  it('should handle zero-duration video', () => {
    const backend = new MockFrameExtractorBackend();
    const extractor = new KeyframeExtractor(backend);

    const timestamps = extractor.calculateTimestamps(0);
    expect(timestamps).toHaveLength(0);
  });
});
