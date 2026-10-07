import { describe, it, expect, beforeEach } from 'vitest';
import { TransitionsService } from '../services/transitions.service';

describe('TransitionsService', () => {
  let service: TransitionsService;

  beforeEach(() => {
    service = new TransitionsService();
  });

  describe('getAvailable', () => {
    it('should return all available transition types', () => {
      const available = service.getAvailable();
      expect(available.length).toBe(7);
      const types = available.map((a) => a.type);
      expect(types).toContain('fade');
      expect(types).toContain('dissolve');
      expect(types).toContain('wipe');
      expect(types).toContain('zoom');
      expect(types).toContain('slide');
      expect(types).toContain('blur');
      expect(types).toContain('spin');
    });

    it('should include name and default duration', () => {
      const available = service.getAvailable();
      const fade = available.find((a) => a.type === 'fade');
      expect(fade?.name).toBe('Fade');
      expect(fade?.defaultDuration).toBe(500);
    });
  });

  describe('apply', () => {
    it('should apply a transition between two clips', () => {
      const transition = service.apply('clip-1', 'clip-2', 'fade');
      expect(transition.type).toBe('fade');
      expect(transition.clipAId).toBe('clip-1');
      expect(transition.clipBId).toBe('clip-2');
      expect(transition.duration).toBe(500); // Default for fade
    });

    it('should use custom duration', () => {
      const transition = service.apply('clip-1', 'clip-2', 'dissolve', 1000);
      expect(transition.duration).toBe(1000);
    });

    it('should use default duration from preset', () => {
      const transition = service.apply('clip-1', 'clip-2', 'spin');
      expect(transition.duration).toBe(800);
    });
  });

  describe('remove', () => {
    it('should remove a transition', () => {
      const transition = service.apply('clip-1', 'clip-2', 'fade');
      expect(service.remove(transition.id)).toBe(true);
    });

    it('should return false for non-existent transition', () => {
      expect(service.remove('non-existent')).toBe(false);
    });
  });

  describe('update', () => {
    it('should update transition duration', () => {
      const transition = service.apply('clip-1', 'clip-2', 'fade');
      const updated = service.update(transition.id, { duration: 750 });
      expect(updated?.duration).toBe(750);
    });

    it('should update transition params', () => {
      const transition = service.apply('clip-1', 'clip-2', 'wipe');
      const updated = service.update(transition.id, { params: { direction: 1, intensity: 0.8 } });
      expect(updated?.params.direction).toBe(1);
      expect(updated?.params.intensity).toBe(0.8);
    });

    it('should merge params with existing', () => {
      const transition = service.apply('clip-1', 'clip-2', 'wipe');
      service.update(transition.id, { params: { direction: 1 } });
      const updated = service.update(transition.id, { params: { intensity: 0.5 } });
      expect(updated?.params.direction).toBe(1);
      expect(updated?.params.intensity).toBe(0.5);
    });

    it('should return null for non-existent transition', () => {
      expect(service.update('non-existent', { duration: 100 })).toBeNull();
    });
  });

  describe('getForClip', () => {
    it('should return transitions for a specific clip', () => {
      service.apply('clip-1', 'clip-2', 'fade');
      service.apply('clip-2', 'clip-3', 'dissolve');
      service.apply('clip-4', 'clip-5', 'wipe');

      const transitions = service.getForClip('clip-2');
      expect(transitions).toHaveLength(2);
    });

    it('should return empty array for clip with no transitions', () => {
      service.apply('clip-1', 'clip-2', 'fade');
      expect(service.getForClip('clip-3')).toHaveLength(0);
    });
  });

  describe('validateDuration', () => {
    it('should return true for valid duration', () => {
      expect(service.validateDuration(500, 2000, 3000)).toBe(true);
    });

    it('should return false for duration exceeding half of clip A', () => {
      expect(service.validateDuration(600, 1000, 2000)).toBe(false);
    });

    it('should return false for duration exceeding half of clip B', () => {
      expect(service.validateDuration(600, 2000, 1000)).toBe(false);
    });

    it('should return false for zero duration', () => {
      expect(service.validateDuration(0, 1000, 1000)).toBe(false);
    });

    it('should return false for negative duration', () => {
      expect(service.validateDuration(-100, 1000, 1000)).toBe(false);
    });
  });
});
