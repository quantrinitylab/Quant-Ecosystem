import { describe, it, expect, vi } from 'vitest';
import { ImageModerationHandler } from './image-handler';
import type { ModerationResult, PolicyDecision } from '@quant/moderation';
import type { ModerationJob } from '@quant/queue';

function createMockImageResult(overrides: Partial<ModerationResult> = {}): ModerationResult {
  return {
    id: 'imgcls_test',
    contentId: 'content-1',
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

describe('ImageModerationHandler', () => {
  it('flags NSFW image detected by classifier and executes action', async () => {
    const nsfwResult = createMockImageResult({
      overallScore: 0.91,
      action: 'remove',
      categories: [
        { category: 'nsfw', score: 0.91, confidence: 0.95, detected: true },
        { category: 'violence', score: 0.03, confidence: 0.95, detected: false },
        { category: 'hate_speech', score: 0.01, confidence: 0.95, detected: false },
        { category: 'self_harm', score: 0.02, confidence: 0.95, detected: false },
      ],
      flags: ['nsfw'],
    });

    const classifier = { classify: vi.fn().mockResolvedValue(nsfwResult) };
    const hasher = { computeImageHash: vi.fn().mockReturnValue('abc123') };
    const policyDecision: PolicyDecision = {
      action: 'remove',
      severity: 'high',
      matchedRules: [{ category: 'nsfw', threshold: 0.7, action: 'remove', severity: 'high' }],
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

    const handler = new ImageModerationHandler({
      classifier: classifier as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['classifier'],
      hasher: hasher as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['hasher'],
      policyEngine: policyEngine as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['policyEngine'],
      actionExecutor: actionExecutor as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['actionExecutor'],
    });

    const job: ModerationJob = {
      contentId: 'img-1',
      contentType: 'image',
      content: 'https://example.com/nsfw.jpg',
      userId: 'user-1',
      appId: 'app-1',
    };

    const result = await handler.handle(job);

    expect(classifier.classify).toHaveBeenCalledWith(
      { url: 'https://example.com/nsfw.jpg' },
      'img-1',
    );
    expect(actionExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'remove',
        contentId: 'img-1',
        userId: 'user-1',
      }),
    );
    expect(result.action).toBe('remove');
  });

  it('triggers immediate removal for known-bad hash', async () => {
    const classifier = { classify: vi.fn() };
    const knownBadHash = 'deadbeef12345678';
    const hasher = { computeImageHash: vi.fn().mockReturnValue(knownBadHash) };
    const policyEngine = { evaluate: vi.fn() };
    const actionExecutor = {
      execute: vi.fn().mockResolvedValue({
        executed: true,
        action: 'remove',
        auditLogId: 'audit_2',
        timestamp: Date.now(),
      }),
    };

    const handler = new ImageModerationHandler({
      classifier: classifier as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['classifier'],
      hasher: hasher as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['hasher'],
      policyEngine: policyEngine as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['policyEngine'],
      actionExecutor: actionExecutor as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['actionExecutor'],
      knownBadHashes: new Set([knownBadHash]),
    });

    const job: ModerationJob = {
      contentId: 'img-2',
      contentType: 'image',
      content: 'https://example.com/bad-image.jpg',
      userId: 'user-2',
      appId: 'app-1',
    };

    const result = await handler.handle(job);

    expect(result.action).toBe('remove');
    expect(result.flags).toContain('known_bad_hash');
    expect(actionExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'remove',
        severity: 'critical',
        reason: 'Known-bad perceptual hash match',
      }),
    );
    // Classifier should NOT be called since hash match triggered immediate removal
    expect(classifier.classify).not.toHaveBeenCalled();
  });

  it('approves safe image without executing action', async () => {
    const safeResult = createMockImageResult();
    const classifier = { classify: vi.fn().mockResolvedValue(safeResult) };
    const hasher = { computeImageHash: vi.fn().mockReturnValue('safe_hash') };
    const policyDecision: PolicyDecision = {
      action: 'approve',
      severity: 'none',
      matchedRules: [],
      confidence: 0.95,
    };
    const policyEngine = { evaluate: vi.fn().mockReturnValue(policyDecision) };
    const actionExecutor = { execute: vi.fn() };

    const handler = new ImageModerationHandler({
      classifier: classifier as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['classifier'],
      hasher: hasher as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['hasher'],
      policyEngine: policyEngine as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['policyEngine'],
      actionExecutor: actionExecutor as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['actionExecutor'],
    });

    const job: ModerationJob = {
      contentId: 'img-3',
      contentType: 'image',
      content: 'https://example.com/safe.jpg',
      userId: 'user-3',
      appId: 'app-1',
    };

    const result = await handler.handle(job);

    expect(result.action).toBe('approve');
    expect(actionExecutor.execute).not.toHaveBeenCalled();
  });

  it('uses ContentFetcher to fetch image bytes before hashing', async () => {
    const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const contentFetcher = { fetch: vi.fn().mockResolvedValue(imageBytes) };
    const safeResult = createMockImageResult();
    const classifier = { classify: vi.fn().mockResolvedValue(safeResult) };
    const hasher = { computeImageHash: vi.fn().mockReturnValue('fetched_hash') };
    const policyDecision: PolicyDecision = {
      action: 'approve',
      severity: 'none',
      matchedRules: [],
      confidence: 0.95,
    };
    const policyEngine = { evaluate: vi.fn().mockReturnValue(policyDecision) };
    const actionExecutor = { execute: vi.fn() };

    const handler = new ImageModerationHandler({
      classifier: classifier as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['classifier'],
      hasher: hasher as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['hasher'],
      policyEngine: policyEngine as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['policyEngine'],
      actionExecutor: actionExecutor as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['actionExecutor'],
      contentFetcher,
    });

    const job: ModerationJob = {
      contentId: 'img-4',
      contentType: 'image',
      content: 'https://example.com/photo.jpg',
      userId: 'user-4',
      appId: 'app-1',
    };

    await handler.handle(job);

    expect(contentFetcher.fetch).toHaveBeenCalledWith('https://example.com/photo.jpg');
    expect(hasher.computeImageHash).toHaveBeenCalledWith(imageBytes);
  });

  it('falls back to raw content bytes when ContentFetcher fails', async () => {
    const contentFetcher = { fetch: vi.fn().mockRejectedValue(new Error('Network error')) };
    const safeResult = createMockImageResult();
    const classifier = { classify: vi.fn().mockResolvedValue(safeResult) };
    const hasher = { computeImageHash: vi.fn().mockReturnValue('fallback_hash') };
    const policyDecision: PolicyDecision = {
      action: 'approve',
      severity: 'none',
      matchedRules: [],
      confidence: 0.95,
    };
    const policyEngine = { evaluate: vi.fn().mockReturnValue(policyDecision) };
    const actionExecutor = { execute: vi.fn() };

    const handler = new ImageModerationHandler({
      classifier: classifier as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['classifier'],
      hasher: hasher as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['hasher'],
      policyEngine: policyEngine as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['policyEngine'],
      actionExecutor: actionExecutor as unknown as ConstructorParameters<
        typeof ImageModerationHandler
      >[0]['actionExecutor'],
      contentFetcher,
    });

    const job: ModerationJob = {
      contentId: 'img-5',
      contentType: 'image',
      content: 'https://example.com/broken.jpg',
      userId: 'user-5',
      appId: 'app-1',
    };

    const result = await handler.handle(job);

    expect(contentFetcher.fetch).toHaveBeenCalled();
    // Should still complete successfully using fallback
    expect(hasher.computeImageHash).toHaveBeenCalledWith(Buffer.from(job.content));
    expect(result.action).toBe('approve');
  });
});
