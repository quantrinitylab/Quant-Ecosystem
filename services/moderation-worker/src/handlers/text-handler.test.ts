import { describe, it, expect, vi } from 'vitest';
import { TextModerationHandler } from './text-handler';
import type { ModerationResult, PolicyDecision } from '@quant/moderation';
import type { ModerationJob } from '@quant/queue';

function createMockClassifierResult(overrides: Partial<ModerationResult> = {}): ModerationResult {
  return {
    id: 'txtcls_test',
    contentId: 'content-1',
    contentType: 'text',
    categories: [
      { category: 'hate_speech', score: 0.1, confidence: 0.95, detected: false },
      { category: 'harassment', score: 0.05, confidence: 0.95, detected: false },
      { category: 'self_harm', score: 0.02, confidence: 0.95, detected: false },
      { category: 'nsfw', score: 0.01, confidence: 0.95, detected: false },
      { category: 'violence', score: 0.03, confidence: 0.95, detected: false },
    ],
    overallScore: 0.1,
    action: 'approve',
    confidence: 0.95,
    automated: true,
    flags: [],
    metadata: { textLength: 10, classifier: 'ml-api' },
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('TextModerationHandler', () => {
  it('classifies hate speech text and executes action', async () => {
    const hateSpeechResult = createMockClassifierResult({
      overallScore: 0.92,
      action: 'remove',
      categories: [
        { category: 'hate_speech', score: 0.92, confidence: 0.95, detected: true },
        { category: 'harassment', score: 0.05, confidence: 0.95, detected: false },
        { category: 'self_harm', score: 0.02, confidence: 0.95, detected: false },
        { category: 'nsfw', score: 0.01, confidence: 0.95, detected: false },
        { category: 'violence', score: 0.03, confidence: 0.95, detected: false },
      ],
      flags: ['hate_speech'],
    });

    const classifier = { classify: vi.fn().mockResolvedValue(hateSpeechResult) };
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

    const handler = new TextModerationHandler({
      classifier: classifier as unknown as ConstructorParameters<
        typeof TextModerationHandler
      >[0]['classifier'],
      policyEngine: policyEngine as unknown as ConstructorParameters<
        typeof TextModerationHandler
      >[0]['policyEngine'],
      actionExecutor: actionExecutor as unknown as ConstructorParameters<
        typeof TextModerationHandler
      >[0]['actionExecutor'],
    });

    const job: ModerationJob = {
      contentId: 'content-1',
      contentType: 'text',
      content: 'hate speech content here',
      userId: 'user-1',
      appId: 'app-1',
    };

    const result = await handler.handle(job);

    expect(classifier.classify).toHaveBeenCalledWith('hate speech content here', 'content-1');
    expect(policyEngine.evaluate).toHaveBeenCalledWith(hateSpeechResult, 'app-1');
    expect(actionExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'remove',
        contentId: 'content-1',
        userId: 'user-1',
        severity: 'high',
      }),
    );
    expect(result.action).toBe('remove');
  });

  it('approves safe text without executing action', async () => {
    const safeResult = createMockClassifierResult();
    const classifier = { classify: vi.fn().mockResolvedValue(safeResult) };
    const policyDecision: PolicyDecision = {
      action: 'approve',
      severity: 'none',
      matchedRules: [],
      confidence: 0.95,
    };
    const policyEngine = { evaluate: vi.fn().mockReturnValue(policyDecision) };
    const actionExecutor = { execute: vi.fn() };

    const handler = new TextModerationHandler({
      classifier: classifier as unknown as ConstructorParameters<
        typeof TextModerationHandler
      >[0]['classifier'],
      policyEngine: policyEngine as unknown as ConstructorParameters<
        typeof TextModerationHandler
      >[0]['policyEngine'],
      actionExecutor: actionExecutor as unknown as ConstructorParameters<
        typeof TextModerationHandler
      >[0]['actionExecutor'],
    });

    const job: ModerationJob = {
      contentId: 'content-2',
      contentType: 'text',
      content: 'Hello this is a friendly message',
      userId: 'user-2',
      appId: 'app-1',
    };

    const result = await handler.handle(job);

    expect(result.action).toBe('approve');
    expect(actionExecutor.execute).not.toHaveBeenCalled();
  });

  it('policy engine determines final action', async () => {
    const mildResult = createMockClassifierResult({
      overallScore: 0.55,
      action: 'restrict',
      categories: [
        { category: 'hate_speech', score: 0.55, confidence: 0.85, detected: true },
        { category: 'harassment', score: 0.05, confidence: 0.95, detected: false },
        { category: 'self_harm', score: 0.02, confidence: 0.95, detected: false },
        { category: 'nsfw', score: 0.01, confidence: 0.95, detected: false },
        { category: 'violence', score: 0.03, confidence: 0.95, detected: false },
      ],
    });

    const classifier = { classify: vi.fn().mockResolvedValue(mildResult) };
    const policyDecision: PolicyDecision = {
      action: 'warn',
      severity: 'medium',
      matchedRules: [
        { category: 'hate_speech', threshold: 0.5, action: 'warn', severity: 'medium' },
      ],
      confidence: 0.85,
    };
    const policyEngine = { evaluate: vi.fn().mockReturnValue(policyDecision) };
    const actionExecutor = {
      execute: vi.fn().mockResolvedValue({
        executed: true,
        action: 'warn',
        auditLogId: 'audit_2',
        timestamp: Date.now(),
      }),
    };

    const handler = new TextModerationHandler({
      classifier: classifier as unknown as ConstructorParameters<
        typeof TextModerationHandler
      >[0]['classifier'],
      policyEngine: policyEngine as unknown as ConstructorParameters<
        typeof TextModerationHandler
      >[0]['policyEngine'],
      actionExecutor: actionExecutor as unknown as ConstructorParameters<
        typeof TextModerationHandler
      >[0]['actionExecutor'],
    });

    const job: ModerationJob = {
      contentId: 'content-3',
      contentType: 'text',
      content: 'borderline content',
      userId: 'user-3',
      appId: 'app-1',
    };

    const result = await handler.handle(job);

    expect(result.action).toBe('warn');
    expect(actionExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'warn' }),
    );
  });
});
