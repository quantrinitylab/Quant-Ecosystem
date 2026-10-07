import { describe, it, expect, beforeEach } from 'vitest';
import { AIClipMakerService } from '../../services/creator-tools/ai-clip-maker.service';

describe('AIClipMakerService', () => {
  let service: AIClipMakerService;

  beforeEach(() => {
    service = new AIClipMakerService();
  });

  describe('analyzeVideo', () => {
    it('returns video analysis with segments', async () => {
      const result = await service.analyzeVideo({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        duration: 120,
      });

      expect(result.videoId).toBe('video-1');
      expect(result.duration).toBe(120);
      expect(result.segments.length).toBeGreaterThan(0);
      expect(result.analyzedAt).toBeInstanceOf(Date);
    });

    it('segments have required fields', async () => {
      const result = await service.analyzeVideo({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        duration: 90,
      });

      for (const seg of result.segments) {
        expect(typeof seg.startTime).toBe('number');
        expect(typeof seg.endTime).toBe('number');
        expect(seg.interestScore).toBeGreaterThanOrEqual(0);
        expect(seg.interestScore).toBeLessThanOrEqual(1);
        expect(seg.label.length).toBeGreaterThan(0);
        expect(seg.endTime).toBeGreaterThan(seg.startTime);
      }
    });

    it('rejects invalid videoId', async () => {
      await expect(
        service.analyzeVideo({
          videoId: '',
          videoUrl: 'https://cdn.example.com/video.mp4',
          duration: 60,
        }),
      ).rejects.toThrow();
    });

    it('rejects invalid videoUrl', async () => {
      await expect(
        service.analyzeVideo({
          videoId: 'video-1',
          videoUrl: 'not-a-url',
          duration: 60,
        }),
      ).rejects.toThrow();
    });

    it('rejects non-positive duration', async () => {
      await expect(
        service.analyzeVideo({
          videoId: 'video-1',
          videoUrl: 'https://cdn.example.com/video.mp4',
          duration: 0,
        }),
      ).rejects.toThrow();
    });
  });

  describe('generateClips', () => {
    it('generates clips within duration bounds', async () => {
      await service.analyzeVideo({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        duration: 300,
      });

      const clips = await service.generateClips({
        videoId: 'video-1',
        count: 3,
        minDuration: 10,
        maxDuration: 30,
      });

      expect(clips.length).toBeGreaterThan(0);
      expect(clips.length).toBeLessThanOrEqual(3);

      for (const clip of clips) {
        expect(clip.duration).toBeGreaterThanOrEqual(10);
        expect(clip.duration).toBeLessThanOrEqual(30);
        expect(clip.startTime).toBeGreaterThanOrEqual(0);
        expect(clip.endTime).toBeLessThanOrEqual(300);
      }
    });

    it('clips have required fields', async () => {
      await service.analyzeVideo({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        duration: 120,
      });

      const clips = await service.generateClips({ videoId: 'video-1', count: 2 });

      for (const clip of clips) {
        expect(clip.id).toBeDefined();
        expect(clip.videoId).toBe('video-1');
        expect(clip.score).toBeGreaterThanOrEqual(0);
        expect(clip.score).toBeLessThanOrEqual(1);
        expect(clip.reason.length).toBeGreaterThan(0);
        expect(clip.status).toBe('ready');
      }
    });

    it('throws if video has not been analyzed', async () => {
      await expect(
        service.generateClips({ videoId: 'unanalyzed-video', count: 2 }),
      ).rejects.toThrow('has not been analyzed');
    });

    it('throws when minDuration >= maxDuration', async () => {
      await service.analyzeVideo({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        duration: 120,
      });

      await expect(
        service.generateClips({
          videoId: 'video-1',
          minDuration: 30,
          maxDuration: 10,
        }),
      ).rejects.toThrow('minDuration must be less than maxDuration');
    });

    it('throws when minDuration equals maxDuration', async () => {
      await service.analyzeVideo({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        duration: 120,
      });

      await expect(
        service.generateClips({
          videoId: 'video-1',
          minDuration: 20,
          maxDuration: 20,
        }),
      ).rejects.toThrow('minDuration must be less than maxDuration');
    });

    it('rejects invalid videoId', async () => {
      await expect(service.generateClips({ videoId: '', count: 2 })).rejects.toThrow();
    });
  });

  describe('getClipStatus', () => {
    it('returns clip by id', async () => {
      await service.analyzeVideo({
        videoId: 'video-1',
        videoUrl: 'https://cdn.example.com/video.mp4',
        duration: 120,
      });

      const clips = await service.generateClips({ videoId: 'video-1', count: 1 });
      const clip = clips[0]!;

      const status = await service.getClipStatus(clip.id);
      expect(status.id).toBe(clip.id);
      expect(status.status).toBe('ready');
    });

    it('throws for non-existent clip', async () => {
      await expect(service.getClipStatus('nonexistent')).rejects.toThrow('Clip not found');
    });
  });
});
