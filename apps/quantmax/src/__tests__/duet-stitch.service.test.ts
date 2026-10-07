import { describe, it, expect, beforeEach } from 'vitest';
import { DuetStitchService } from '../services/duet-stitch.service';

describe('DuetStitchService', () => {
  let service: DuetStitchService;

  beforeEach(() => {
    service = new DuetStitchService();
  });

  describe('createDuet', () => {
    it('should create a duet with the specified layout', () => {
      const duet = service.createDuet('video-1', 'user-video-1', 'side_by_side');
      expect(duet.id).toBeDefined();
      expect(duet.originalVideoId).toBe('video-1');
      expect(duet.userVideoId).toBe('user-video-1');
      expect(duet.layout).toBe('side_by_side');
      expect(duet.createdAt).toBeGreaterThan(0);
    });

    it('should support all layout types', () => {
      const layouts = ['side_by_side', 'top_bottom', 'green_screen', 'react'] as const;
      for (const layout of layouts) {
        const duet = service.createDuet('v1', 'v2', layout);
        expect(duet.layout).toBe(layout);
      }
    });
  });

  describe('createStitch', () => {
    it('should create a stitch with a stitch point', () => {
      const stitch = service.createStitch('video-1', 'user-video-1', 15.5);
      expect(stitch.id).toBeDefined();
      expect(stitch.originalVideoId).toBe('video-1');
      expect(stitch.userVideoId).toBe('user-video-1');
      expect(stitch.stitchPoint).toBe(15.5);
    });

    it('should handle zero stitch point', () => {
      const stitch = service.createStitch('v1', 'v2', 0);
      expect(stitch.stitchPoint).toBe(0);
    });
  });

  describe('getLayouts', () => {
    it('should return all available layouts', () => {
      const layouts = service.getLayouts();
      expect(layouts).toHaveLength(4);
      expect(layouts.map((l) => l.layout)).toContain('side_by_side');
      expect(layouts.map((l) => l.layout)).toContain('green_screen');
    });

    it('should include labels and descriptions', () => {
      const layouts = service.getLayouts();
      for (const layout of layouts) {
        expect(layout.label).toBeDefined();
        expect(layout.description).toBeDefined();
      }
    });
  });

  describe('getDuetsForVideo', () => {
    it('should return all duets for a given video', () => {
      service.createDuet('video-1', 'u1', 'side_by_side');
      service.createDuet('video-1', 'u2', 'top_bottom');
      service.createDuet('video-2', 'u3', 'react');

      const duets = service.getDuetsForVideo('video-1');
      expect(duets).toHaveLength(2);
    });

    it('should return empty array for video with no duets', () => {
      expect(service.getDuetsForVideo('no-video')).toHaveLength(0);
    });
  });

  describe('getStitchesForVideo', () => {
    it('should return all stitches for a given video', () => {
      service.createStitch('video-1', 'u1', 5);
      service.createStitch('video-1', 'u2', 10);
      expect(service.getStitchesForVideo('video-1')).toHaveLength(2);
    });
  });

  describe('canDuet / canStitch', () => {
    it('should allow duets by default', () => {
      expect(service.canDuet('video-1')).toBe(true);
    });

    it('should disable duets when creator disallows', () => {
      service.disableDuet('video-1');
      expect(service.canDuet('video-1')).toBe(false);
    });

    it('should allow stitches by default', () => {
      expect(service.canStitch('video-1')).toBe(true);
    });

    it('should disable stitches when creator disallows', () => {
      service.disableStitch('video-1');
      expect(service.canStitch('video-1')).toBe(false);
    });
  });
});
