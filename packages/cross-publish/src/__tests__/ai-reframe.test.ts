import { describe, it, expect } from 'vitest';
import { AIReframeService } from '../ai-reframe.service.js';

describe('AIReframeService', () => {
  const service = new AIReframeService();

  describe('detectScenes', () => {
    it('should return an array of scene detections', () => {
      const scenes = service.detectScenes('https://example.com/video.mp4');
      expect(scenes.length).toBeGreaterThan(0);
    });

    it('should return scenes with valid timestamps', () => {
      const scenes = service.detectScenes('https://example.com/video.mp4');
      for (const scene of scenes) {
        expect(scene.startTime).toBeGreaterThanOrEqual(0);
        expect(scene.endTime).toBeGreaterThan(scene.startTime);
      }
    });

    it('should return scenes with confidence between 0 and 1', () => {
      const scenes = service.detectScenes('https://example.com/video.mp4');
      for (const scene of scenes) {
        expect(scene.confidence).toBeGreaterThanOrEqual(0);
        expect(scene.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should have sequential non-overlapping scenes', () => {
      const scenes = service.detectScenes('https://example.com/video.mp4');
      for (let i = 1; i < scenes.length; i++) {
        const prev = scenes[i - 1]!;
        const curr = scenes[i]!;
        expect(curr.startTime).toBeCloseTo(prev.endTime, 5);
      }
    });
  });

  describe('suggestCrops', () => {
    it('should return vertical crops for vertical_9_16', () => {
      const crops = service.suggestCrops('https://example.com/video.mp4', 'vertical_9_16');
      expect(crops.length).toBeGreaterThan(0);
      for (const crop of crops) {
        expect(crop.width).toBeLessThan(crop.height);
      }
    });

    it('should return square crops for square_1_1', () => {
      const crops = service.suggestCrops('https://example.com/video.mp4', 'square_1_1');
      expect(crops.length).toBeGreaterThan(0);
      for (const crop of crops) {
        expect(crop.width).toBe(crop.height);
      }
    });

    it('should return full frame for horizontal_16_9', () => {
      const crops = service.suggestCrops('https://example.com/video.mp4', 'horizontal_16_9');
      expect(crops.length).toBeGreaterThan(0);
      expect(crops[0]!.x).toBe(0);
      expect(crops[0]!.y).toBe(0);
    });

    it('should have crops with non-negative coordinates', () => {
      const aspects = ['vertical_9_16', 'horizontal_16_9', 'square_1_1'] as const;
      for (const aspect of aspects) {
        const crops = service.suggestCrops('https://example.com/video.mp4', aspect);
        for (const crop of crops) {
          expect(crop.x).toBeGreaterThanOrEqual(0);
          expect(crop.y).toBeGreaterThanOrEqual(0);
          expect(crop.width).toBeGreaterThan(0);
          expect(crop.height).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('generateShortClips', () => {
    it('should return clips within the max duration', () => {
      const maxDuration = 15;
      const clips = service.generateShortClips('https://example.com/video.mp4', maxDuration);
      expect(clips.length).toBeGreaterThan(0);
      for (const clip of clips) {
        expect(clip.end - clip.start).toBeLessThanOrEqual(maxDuration);
      }
    });

    it('should return clips sorted by score descending', () => {
      const clips = service.generateShortClips('https://example.com/video.mp4', 30);
      for (let i = 1; i < clips.length; i++) {
        expect(clips[i]!.score).toBeLessThanOrEqual(clips[i - 1]!.score);
      }
    });

    it('should return at most 5 clips', () => {
      const clips = service.generateShortClips('https://example.com/video.mp4', 3);
      expect(clips.length).toBeLessThanOrEqual(5);
    });

    it('should have clips with valid timestamps', () => {
      const clips = service.generateShortClips('https://example.com/video.mp4', 10);
      for (const clip of clips) {
        expect(clip.start).toBeGreaterThanOrEqual(0);
        expect(clip.end).toBeGreaterThan(clip.start);
        expect(clip.score).toBeGreaterThan(0);
        expect(clip.reason).toBeTruthy();
      }
    });
  });
});
