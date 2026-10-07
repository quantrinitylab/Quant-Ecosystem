import { describe, it, expect } from 'vitest';
import { SurfaceAdapter } from '../surface-adapter.js';
import type { PublishIntent, Surface } from '../types.js';

describe('SurfaceAdapter', () => {
  const adapter = new SurfaceAdapter();

  const mockIntent: PublishIntent = {
    id: 'intent-1',
    userId: 'user-1',
    contentId: 'content-1',
    contentType: 'video',
    title:
      'A Very Long Title That Should Be Truncated For Some Platforms Because They Have Length Limits',
    description: 'This is a detailed description of the content. #coding #tutorial',
    surfaces: ['quantube', 'quantsync', 'quantneon', 'quantmail'],
    mediaUrl: 'https://storage.example.com/video.mp4',
    thumbnailUrl: 'https://storage.example.com/thumb.jpg',
    metadata: { category: 'tech' },
    createdAt: new Date(),
    status: 'pending',
  };

  describe('formatForSurface', () => {
    it('should format for quantube with horizontal_16_9 aspect ratio', () => {
      const result = adapter.formatForSurface(mockIntent, 'quantube');
      expect(result.surface).toBe('quantube');
      expect(result.aspectRatio).toBe('horizontal_16_9');
      expect(result.title.length).toBeLessThanOrEqual(100);
      expect(result.description.length).toBeLessThanOrEqual(5000);
      expect(result.mediaUrl).toBe(mockIntent.mediaUrl);
    });

    it('should format for quantsync with vertical_9_16 aspect ratio', () => {
      const result = adapter.formatForSurface(mockIntent, 'quantsync');
      expect(result.surface).toBe('quantsync');
      expect(result.aspectRatio).toBe('vertical_9_16');
      expect(result.title.length).toBeLessThanOrEqual(50);
      expect(result.description.length).toBeLessThanOrEqual(300);
    });

    it('should format for quantneon with square_1_1 aspect ratio', () => {
      const result = adapter.formatForSurface(mockIntent, 'quantneon');
      expect(result.surface).toBe('quantneon');
      expect(result.aspectRatio).toBe('square_1_1');
      expect(result.title.length).toBeLessThanOrEqual(60);
    });

    it('should format for quantmail with horizontal_16_9 aspect ratio', () => {
      const result = adapter.formatForSurface(mockIntent, 'quantmail');
      expect(result.surface).toBe('quantmail');
      expect(result.aspectRatio).toBe('horizontal_16_9');
      expect(result.title).toContain('Newsletter:');
    });

    it('should handle all content types', () => {
      const surfaces: Surface[] = ['quantube', 'quantsync', 'quantneon', 'quantmail'];
      for (const surface of surfaces) {
        const videoIntent = { ...mockIntent, contentType: 'video' as const };
        const imageIntent = { ...mockIntent, contentType: 'image' as const };
        const textIntent = { ...mockIntent, contentType: 'text' as const };
        const audioIntent = { ...mockIntent, contentType: 'audio' as const };

        expect(() => adapter.formatForSurface(videoIntent, surface)).not.toThrow();
        expect(() => adapter.formatForSurface(imageIntent, surface)).not.toThrow();
        expect(() => adapter.formatForSurface(textIntent, surface)).not.toThrow();
        expect(() => adapter.formatForSurface(audioIntent, surface)).not.toThrow();
      }
    });

    it('should include metadata with platform info', () => {
      const surfaces: Surface[] = ['quantube', 'quantsync', 'quantneon', 'quantmail'];
      for (const surface of surfaces) {
        const result = adapter.formatForSurface(mockIntent, surface);
        expect(result.metadata).toHaveProperty('platform', surface);
      }
    });

    it('should extract hashtags for quantneon', () => {
      const intentWithHashtags: PublishIntent = {
        ...mockIntent,
        description: 'Check this out #tech #innovation #coding',
      };
      const result = adapter.formatForSurface(intentWithHashtags, 'quantneon');
      expect(result.description).toContain('#tech');
    });
  });
});
