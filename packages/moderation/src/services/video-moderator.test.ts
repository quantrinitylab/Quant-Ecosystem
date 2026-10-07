import { describe, it, expect } from 'vitest';
import {
  VideoModerator,
  type VideoAnalysisBackend,
  type VideoFrameSample,
  type VideoAudioAnalysis,
} from './video-moderator';

const metadata = {
  id: 'vid-1',
  duration: 60,
  width: 1920,
  height: 1080,
  fps: 30,
  codec: 'h264',
  fileSize: 1024,
  hasAudio: true,
};

describe('VideoModerator', () => {
  it('runs with the built-in heuristic when no backend is configured', async () => {
    const mod = new VideoModerator();
    expect(mod.isBackendConfigured()).toBe(false);
    const result = await mod.moderate('vid-1', metadata);
    expect(result.contentType).toBe('video');
    expect(result.contentId).toBe('vid-1');
  });

  it('uses the configured backend for frame sampling and audio analysis', async () => {
    const violentFrames: VideoFrameSample[] = [
      { index: 0, timestamp: 0, hash: 'h0', brightness: 0.1, colorVariance: 0.5, motionScore: 0.9 },
      { index: 1, timestamp: 5, hash: 'h1', brightness: 0.1, colorVariance: 0.5, motionScore: 0.9 },
    ];
    const audio: VideoAudioAnalysis = {
      hasExplicitLyrics: true,
      hasSpeech: true,
      speechSegments: [{ start: 0, end: 5, confidence: 0.9 }],
      volumePeaks: [0.9],
      explicitScore: 0.95,
    };
    let frameCalls = 0;
    let audioCalls = 0;
    const backend: VideoAnalysisBackend = {
      async sampleFrames() {
        frameCalls++;
        return violentFrames;
      },
      async analyzeAudio() {
        audioCalls++;
        return audio;
      },
    };

    const mod = new VideoModerator({}, backend);
    expect(mod.isBackendConfigured()).toBe(true);
    const result = await mod.moderate('vid-1', metadata);

    expect(frameCalls).toBe(1);
    expect(audioCalls).toBe(1);
    // Real backend reported explicit audio -> profanity should be flagged.
    const profanity = result.categories.find((c) => c.category === 'profanity');
    expect(profanity!.score).toBeGreaterThanOrEqual(0.9);
  });

  it('fails closed when a configured backend throws (does not score against fabricated frames)', async () => {
    const backend: VideoAnalysisBackend = {
      async sampleFrames() {
        throw new Error('extractor offline');
      },
    };
    const mod = new VideoModerator({}, backend);
    // A configured backend that errors must propagate (fail closed) so the job
    // retries / goes to manual review, rather than approving un-analyzed video
    // against a random heuristic.
    await expect(mod.moderate('vid-1', metadata)).rejects.toThrow('extractor offline');
  });
});
