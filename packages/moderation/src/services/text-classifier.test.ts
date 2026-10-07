import { describe, it, expect, vi } from 'vitest';
import { TextClassifier } from './text-classifier';
import type { ModerationAPIClient, TextModerationResponse } from '../types';

function createMockClient(response: TextModerationResponse): ModerationAPIClient {
  return {
    moderateText: vi.fn().mockResolvedValue(response),
  };
}

describe('TextClassifier', () => {
  it('should flag hate speech text via mocked API response', async () => {
    const client = createMockClient({
      hate: { flagged: true, score: 0.95 },
      harassment: { flagged: false, score: 0.1 },
      selfHarm: { flagged: false, score: 0.0 },
      sexual: { flagged: false, score: 0.0 },
      violence: { flagged: false, score: 0.1 },
    });

    const classifier = new TextClassifier(client);
    const result = await classifier.classify('some hate speech text', 'content-1');

    expect(result.action).toBe('remove');
    expect(result.flags).toContain('hate_speech');
    expect(result.overallScore).toBeGreaterThanOrEqual(0.9);
    expect(result.contentType).toBe('text');
    expect(result.contentId).toBe('content-1');
    expect(client.moderateText).toHaveBeenCalledWith('some hate speech text');
  });

  it('should approve safe content', async () => {
    const client = createMockClient({
      hate: { flagged: false, score: 0.01 },
      harassment: { flagged: false, score: 0.02 },
      selfHarm: { flagged: false, score: 0.0 },
      sexual: { flagged: false, score: 0.0 },
      violence: { flagged: false, score: 0.01 },
    });

    const classifier = new TextClassifier(client);
    const result = await classifier.classify('Hello world');

    expect(result.action).toBe('approve');
    expect(result.flags).toHaveLength(0);
    expect(result.overallScore).toBeLessThan(0.1);
  });

  it('should flag harassment content with restrict action', async () => {
    const client = createMockClient({
      hate: { flagged: false, score: 0.1 },
      harassment: { flagged: true, score: 0.65 },
      selfHarm: { flagged: false, score: 0.0 },
      sexual: { flagged: false, score: 0.0 },
      violence: { flagged: false, score: 0.0 },
    });

    const classifier = new TextClassifier(client);
    const result = await classifier.classify('harassing content');

    expect(result.action).toBe('restrict');
    expect(result.flags).toContain('harassment');
  });

  it('should generate unique IDs', async () => {
    const client = createMockClient({
      hate: { flagged: false, score: 0 },
      harassment: { flagged: false, score: 0 },
      selfHarm: { flagged: false, score: 0 },
      sexual: { flagged: false, score: 0 },
      violence: { flagged: false, score: 0 },
    });

    const classifier = new TextClassifier(client);
    const r1 = await classifier.classify('text 1');
    const r2 = await classifier.classify('text 2');

    expect(r1.id).not.toBe(r2.id);
  });

  it('should use flag action for scores between 0.7 and 0.9', async () => {
    const client = createMockClient({
      hate: { flagged: true, score: 0.75 },
      harassment: { flagged: false, score: 0.0 },
      selfHarm: { flagged: false, score: 0.0 },
      sexual: { flagged: false, score: 0.0 },
      violence: { flagged: false, score: 0.0 },
    });

    const classifier = new TextClassifier(client);
    const result = await classifier.classify('borderline content');

    expect(result.action).toBe('flag');
  });

  it('should support custom thresholds via constructor', async () => {
    const client = createMockClient({
      hate: { flagged: true, score: 0.85 },
      harassment: { flagged: false, score: 0.0 },
      selfHarm: { flagged: false, score: 0.0 },
      sexual: { flagged: false, score: 0.0 },
      violence: { flagged: false, score: 0.0 },
    });

    // With default thresholds, 0.85 -> flag
    const defaultClassifier = new TextClassifier(client);
    const defaultResult = await defaultClassifier.classify('content');
    expect(defaultResult.action).toBe('flag');

    // With custom thresholds, 0.85 -> remove (removeThreshold=0.8)
    const customClassifier = new TextClassifier(client, { removeThreshold: 0.8 });
    const customResult = await customClassifier.classify('content');
    expect(customResult.action).toBe('remove');
  });
});
