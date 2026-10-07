import { describe, it, expect, vi } from 'vitest';
import { ImageClassifier } from './image-classifier';
import type { ImageModerationAPIClient, ImageModerationResponse } from '../types';

function createMockClient(response: ImageModerationResponse): ImageModerationAPIClient {
  return {
    moderateImage: vi.fn().mockResolvedValue(response),
  };
}

describe('ImageClassifier', () => {
  it('should flag NSFW image via mocked API response', async () => {
    const client = createMockClient({
      nsfw: { flagged: true, score: 0.92 },
      violence: { flagged: false, score: 0.05 },
      hateSymbols: { flagged: false, score: 0.0 },
      selfHarm: { flagged: false, score: 0.0 },
    });

    const classifier = new ImageClassifier(client);
    const result = await classifier.classify({ url: 'https://example.com/image.jpg' }, 'img-1');

    expect(result.action).toBe('remove');
    expect(result.flags).toContain('nsfw');
    expect(result.overallScore).toBeGreaterThanOrEqual(0.9);
    expect(result.contentType).toBe('image');
    expect(result.contentId).toBe('img-1');
    expect(client.moderateImage).toHaveBeenCalledWith({ url: 'https://example.com/image.jpg' });
  });

  it('should approve safe image', async () => {
    const client = createMockClient({
      nsfw: { flagged: false, score: 0.01 },
      violence: { flagged: false, score: 0.02 },
      hateSymbols: { flagged: false, score: 0.0 },
      selfHarm: { flagged: false, score: 0.0 },
    });

    const classifier = new ImageClassifier(client);
    const result = await classifier.classify({ url: 'https://example.com/safe.jpg' });

    expect(result.action).toBe('approve');
    expect(result.flags).toHaveLength(0);
  });

  it('should flag violent image', async () => {
    const client = createMockClient({
      nsfw: { flagged: false, score: 0.0 },
      violence: { flagged: true, score: 0.85 },
      hateSymbols: { flagged: false, score: 0.0 },
      selfHarm: { flagged: false, score: 0.0 },
    });

    const classifier = new ImageClassifier(client);
    const result = await classifier.classify({ base64: 'aGVsbG8=' }, 'img-2');

    expect(result.action).toBe('flag');
    expect(result.flags).toContain('violence');
  });

  it('should throw if neither url nor base64 provided', async () => {
    const client = createMockClient({
      nsfw: { flagged: false, score: 0 },
      violence: { flagged: false, score: 0 },
      hateSymbols: { flagged: false, score: 0 },
      selfHarm: { flagged: false, score: 0 },
    });

    const classifier = new ImageClassifier(client);
    await expect(classifier.classify({})).rejects.toThrow('Either url or base64 must be provided');
  });

  it('should detect hate symbols', async () => {
    const client = createMockClient({
      nsfw: { flagged: false, score: 0.0 },
      violence: { flagged: false, score: 0.0 },
      hateSymbols: { flagged: true, score: 0.88 },
      selfHarm: { flagged: false, score: 0.0 },
    });

    const classifier = new ImageClassifier(client);
    const result = await classifier.classify({ url: 'https://example.com/hate.jpg' });

    expect(result.flags).toContain('hate_speech');
    expect(result.action).toBe('flag');
  });
});
