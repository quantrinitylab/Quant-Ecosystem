import { describe, it, expect, vi } from 'vitest';
import { AudioModerationHandler } from './audio-handler';
import type { ModerationResult, PolicyDecision } from '@quant/moderation';
import type { ModerationJob } from '@quant/queue';

function createMockTextResult(overrides: Partial<ModerationResult> = {}): ModerationResult {
  return {
    id: 'txtcls_test',
    contentId: 'audio-1',
    contentType: 'text',
    categories: [
      { category: 'hate_speech', score: 0.05, confidence: 0.95, detected: false },
      { category: 'harassment', score: 0.03, confidence: 0.95, detected: false },
      { category: 'self_harm', score: 0.02, confidence: 0.95, detected: false },
      { category: 'nsfw', score: 0.01, confidence: 0.95, detected: false },
      { category: 'violence', score: 0.03, confidence: 0.95, detected: false },
    ],
    overallScore: 0.05,
    action: 'approve',
    confidence: 0.95,
    automated: true,
    flags: [],
    metadata: { textLength: 50, classifier: 'ml-api' },
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('AudioModerationHandler', () => {
  it('flags audio with hate speech transcript', async () => {
    const hateSpeechResult = createMockTextResult({
      overallScore: 0.91,
      action: 'remove',
      categories: [
        { category: 'hate_speech', score: 0.91, confidence: 0.95, detected: true },
        { category: 'harassment', score: 0.05, confidence: 0.95, detected: false },
        { category: 'self_harm', score: 0.02, confidence: 0.95, detected: false },
        { category: 'nsfw', score: 0.01, confidence: 0.95, detected: false },
        { category: 'violence', score: 0.03, confidence: 0.95, detected: false },
      ],
      flags: ['hate_speech'],
    });

    const transcriptionService = {
      transcribe: vi.fn().mockResolvedValue('this is hate speech text from audio'),
    };
    const textClassifier = { classify: vi.fn().mockResolvedValue(hateSpeechResult) };
    const policyDecision: PolicyDecision = {
      action: 'remove',
      severity: 'high',
      matchedRules: [
        { category: 'hate_speech', threshold: 0.7, action: 'remove', severity: 'high' },
      ],
      confidence: 0.95,
    };
    const policyEngine = { evaluate: vi.fn().mockReturnValue(policyDecision) };
    const actionExecutor = {
      execute: vi.fn().mockResolvedValue({
        executed: true,
        action: 'remove',
        auditLogId: 'audit_1',
        timestamp: Date.now(),
      }),
    };

    const handler = new AudioModerationHandler({
      transcriptionService: transcriptionService as unknown as ConstructorParameters<
        typeof AudioModerationHandler
      >[0]['transcriptionService'],
      textClassifier: textClassifier as unknown as ConstructorParameters<
        typeof AudioModerationHandler
      >[0]['textClassifier'],
      policyEngine: policyEngine as unknown as ConstructorParameters<
        typeof AudioModerationHandler
      >[0]['policyEngine'],
      actionExecutor: actionExecutor as unknown as ConstructorParameters<
        typeof AudioModerationHandler
      >[0]['actionExecutor'],
    });

    const job: ModerationJob = {
      contentId: 'audio-1',
      contentType: 'audio',
      content: 'https://example.com/hate-audio.mp3',
      userId: 'user-1',
      appId: 'app-1',
    };

    const result = await handler.handle(job);

    expect(transcriptionService.transcribe).toHaveBeenCalledWith(
      'https://example.com/hate-audio.mp3',
    );
    expect(textClassifier.classify).toHaveBeenCalledWith(
      'this is hate speech text from audio',
      'audio-1',
    );
    expect(actionExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'remove',
        contentId: 'audio-1',
        userId: 'user-1',
      }),
    );
    expect(result.action).toBe('remove');
    expect(result.contentType).toBe('audio');
  });

  it('approves clean audio without executing action', async () => {
    const cleanResult = createMockTextResult();
    const transcriptionService = {
      transcribe: vi.fn().mockResolvedValue('this is a normal conversation'),
    };
    const textClassifier = { classify: vi.fn().mockResolvedValue(cleanResult) };
    const policyDecision: PolicyDecision = {
      action: 'approve',
      severity: 'none',
      matchedRules: [],
      confidence: 0.95,
    };
    const policyEngine = { evaluate: vi.fn().mockReturnValue(policyDecision) };
    const actionExecutor = { execute: vi.fn() };

    const handler = new AudioModerationHandler({
      transcriptionService: transcriptionService as unknown as ConstructorParameters<
        typeof AudioModerationHandler
      >[0]['transcriptionService'],
      textClassifier: textClassifier as unknown as ConstructorParameters<
        typeof AudioModerationHandler
      >[0]['textClassifier'],
      policyEngine: policyEngine as unknown as ConstructorParameters<
        typeof AudioModerationHandler
      >[0]['policyEngine'],
      actionExecutor: actionExecutor as unknown as ConstructorParameters<
        typeof AudioModerationHandler
      >[0]['actionExecutor'],
    });

    const job: ModerationJob = {
      contentId: 'audio-2',
      contentType: 'audio',
      content: 'https://example.com/clean-audio.mp3',
      userId: 'user-2',
      appId: 'app-1',
    };

    const result = await handler.handle(job);

    expect(result.action).toBe('approve');
    expect(result.contentType).toBe('audio');
    expect(actionExecutor.execute).not.toHaveBeenCalled();
  });
});
