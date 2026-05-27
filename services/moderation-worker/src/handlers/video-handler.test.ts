import { describe, it, expect, vi } from 'vitest';
import { VideoModerationHandler } from './video-handler';
import type { ModerationResult, PolicyDecision } from '@quant/moderation';
import { KeyframeExtractor, MockFrameExtractorBackend } from '@quant/moderation';
import type { ModerationJob } from '@quant/queue';

function createMockFrameResult(overrides: Partial<ModerationResult> = {}): ModerationResult {
  return {
    id: 'imgcls_frame',
    contentId: 'video-1',
    contentType: 'image',
    categories: [
      { category: 'nsfw', score: 0.05, confidence: 0.95, detected: false },
      { category: 'violence', score: 0.03, confidence: 0.95, detected: false },
      { category: 'hate_speech', score: 0.01, confidence: 0.95, detected: false },
      { category: 'self_harm', score: 0.02, confidence: 0.95, detected: false },
    ],
    overallScore: 0.05,
    action: 'approve',
    confidence: 0.95,
    automated: true,
    flags: [],
    metadata: { inputType: 'url', classifier: 'ml-api' },
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('VideoModerationHandler', () => {
  it('flags video with a flagged frame and executes action', async () => {
    const cleanFrame = createMockFrameResult();
    const flaggedFrame = createMockFrameResult({
      overallScore: 0.88,
      action: 'flag',
      categories: [
        { category: 'nsfw', score: 0.88, confidence: 0.95, detected: true },
        { category: 'violence', score: 0.03, confidence: 0.95, detected: false },
        { category: 'hate_speech', score: 0.01, confidence: 0.95, detected: false },
        { category: 'self_harm', score: 0.02, confidence: 0.95, detected: false },
      ],
      flags: ['nsfw'],
    });

    // Return flagged result for frame #2, clean for others
    const imageClassifier = {
      classify: vi
        .fn()
        .mockResolvedValueOnce(cleanFrame)
        .mockResolvedValueOnce(cleanFrame)
        .mockResolvedValueOnce(flaggedFrame)
        .mockResolvedValueOnce(cleanFrame)
        .mockResolvedValueOnce(cleanFrame),
    };

    const policyDecision: PolicyDecision = {
      action: 'flag',
      severity: 'medium',
      matchedRules: [{ category: 'nsfw', threshold: 0.7, action: 'flag', severity: 'medium' }],
      confidence: 0.95,
    };
    const policyEngine = { evaluate: vi.fn().mockReturnValue(policyDecision) };
    const actionExecutor = {
      execute: vi.fn().mockResolvedValue({
        executed: true,
        action: 'flag',
        auditLogId: 'audit_1',
        timestamp: Date.now(),
      }),
    };

    const handler = new VideoModerationHandler({
      imageClassifier: imageClassifier as unknown as ConstructorParameters<
        typeof VideoModerationHandler
      >[0]['imageClassifier'],
      keyframeExtractor: new KeyframeExtractor(new MockFrameExtractorBackend(), {
        earlyIntervalSeconds: 12,
        lateIntervalSeconds: 60,
        earlyPhaseDuration: 60,
      }),
      policyEngine: policyEngine as unknown as ConstructorParameters<
        typeof VideoModerationHandler
      >[0]['policyEngine'],
      actionExecutor: actionExecutor as unknown as ConstructorParameters<
        typeof VideoModerationHandler
      >[0]['actionExecutor'],
    });

    const job: ModerationJob = {
      contentId: 'video-1',
      contentType: 'video',
      content: 'https://example.com/video.mp4',
      userId: 'user-1',
      appId: 'app-1',
    };

    const result = await handler.handle(job);

    expect(imageClassifier.classify).toHaveBeenCalledTimes(5);
    expect(actionExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'flag',
        contentId: 'video-1',
      }),
    );
    expect(result.action).toBe('flag');
  });

  it('approves clean video without executing action', async () => {
    const cleanFrame = createMockFrameResult();
    const imageClassifier = { classify: vi.fn().mockResolvedValue(cleanFrame) };
    const policyDecision: PolicyDecision = {
      action: 'approve',
      severity: 'none',
      matchedRules: [],
      confidence: 0.95,
    };
    const policyEngine = { evaluate: vi.fn().mockReturnValue(policyDecision) };
    const actionExecutor = { execute: vi.fn() };

    const handler = new VideoModerationHandler({
      imageClassifier: imageClassifier as unknown as ConstructorParameters<
        typeof VideoModerationHandler
      >[0]['imageClassifier'],
      keyframeExtractor: new KeyframeExtractor(new MockFrameExtractorBackend(), {
        earlyIntervalSeconds: 20,
        lateIntervalSeconds: 60,
        earlyPhaseDuration: 60,
      }),
      policyEngine: policyEngine as unknown as ConstructorParameters<
        typeof VideoModerationHandler
      >[0]['policyEngine'],
      actionExecutor: actionExecutor as unknown as ConstructorParameters<
        typeof VideoModerationHandler
      >[0]['actionExecutor'],
    });

    const job: ModerationJob = {
      contentId: 'video-2',
      contentType: 'video',
      content: 'https://example.com/clean-video.mp4',
      userId: 'user-2',
      appId: 'app-1',
    };

    const result = await handler.handle(job);

    expect(imageClassifier.classify).toHaveBeenCalledTimes(3);
    expect(result.action).toBe('approve');
    expect(actionExecutor.execute).not.toHaveBeenCalled();
  });
});
