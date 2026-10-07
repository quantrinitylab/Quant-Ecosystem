import { describe, it, expect, beforeEach } from 'vitest';
import { AIThumbnailService } from '../../services/creator-tools/ai-thumbnail.service';

describe('AIThumbnailService', () => {
  let service: AIThumbnailService;

  beforeEach(() => {
    service = new AIThumbnailService();
  });

  describe('generateThumbnails', () => {
    it('generates at least 4 thumbnail options by default', async () => {
      const result = await service.generateThumbnails({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
      });

      expect(result.length).toBeGreaterThanOrEqual(4);
    });

    it('generates the specified number of thumbnails', async () => {
      const result = await service.generateThumbnails({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        frameCount: 8,
      });

      expect(result).toHaveLength(8);
    });

    it('each thumbnail has required fields', async () => {
      const result = await service.generateThumbnails({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
      });

      for (const thumb of result) {
        expect(thumb.id).toBeDefined();
        expect(thumb.url).toBeDefined();
        expect(thumb.description).toBeDefined();
        expect(typeof thumb.score).toBe('number');
        expect(typeof thumb.timestamp).toBe('number');
      }
    });

    it('scores are between 0 and 1', async () => {
      const result = await service.generateThumbnails({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        frameCount: 10,
      });

      for (const thumb of result) {
        expect(thumb.score).toBeGreaterThanOrEqual(0);
        expect(thumb.score).toBeLessThanOrEqual(1);
      }
    });

    it('returns thumbnails sorted by score descending', async () => {
      const result = await service.generateThumbnails({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        frameCount: 6,
      });

      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
      }
    });

    it('includes title in description when provided', async () => {
      const result = await service.generateThumbnails({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        title: 'Amazing Tutorial',
      });

      const hasTitle = result.some((t) => t.description.includes('Amazing Tutorial'));
      expect(hasTitle).toBe(true);
    });

    it('rejects invalid videoId', async () => {
      await expect(
        service.generateThumbnails({
          videoId: '',
          videoUrl: 'https://cdn.example.com/video.mp4',
        }),
      ).rejects.toThrow();
    });

    it('rejects invalid videoUrl', async () => {
      await expect(
        service.generateThumbnails({
          videoId: 'video-1',
          videoUrl: 'not-a-url',
        }),
      ).rejects.toThrow();
    });
  });

  describe('selectBestThumbnail', () => {
    it('returns the thumbnail with the highest score', async () => {
      const thumbnails = await service.generateThumbnails({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        frameCount: 6,
      });

      const best = service.selectBestThumbnail(thumbnails);
      const maxScore = Math.max(...thumbnails.map((t) => t.score));

      expect(best.score).toBe(maxScore);
    });

    it('throws when given empty array', () => {
      expect(() => service.selectBestThumbnail([])).toThrow('No thumbnails provided');
    });

    it('returns single thumbnail when array has one element', async () => {
      const thumbnails = await service.generateThumbnails({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        frameCount: 1,
      });

      const best = service.selectBestThumbnail(thumbnails);
      expect(best).toEqual(thumbnails[0]);
    });
  });
});
