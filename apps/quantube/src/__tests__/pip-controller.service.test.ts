import { describe, it, expect, beforeEach } from 'vitest';
import { PictureInPictureService } from '../services/pip-controller.service';

describe('PictureInPictureService', () => {
  let service: PictureInPictureService;

  beforeEach(() => {
    service = new PictureInPictureService();
  });

  describe('enter', () => {
    it('should enter PiP mode with default dimensions', () => {
      const state = service.enter('video-1');
      expect(state.isActive).toBe(true);
      expect(state.videoId).toBe('video-1');
      expect(state.width).toBe(320);
      expect(state.height).toBe(180);
    });

    it('should enter PiP mode with custom dimensions', () => {
      const state = service.enter('video-1', { width: 400, height: 225 });
      expect(state.width).toBe(400);
      expect(state.height).toBe(225);
    });

    it('should replace current PiP if switching videos', () => {
      service.enter('video-1');
      const state = service.enter('video-2');
      expect(state.videoId).toBe('video-2');
      expect(state.isActive).toBe(true);
    });
  });

  describe('exit', () => {
    it('should exit PiP mode', () => {
      service.enter('video-1');
      const state = service.exit();
      expect(state.isActive).toBe(false);
      expect(state.videoId).toBeNull();
    });

    it('should preserve dimensions after exit', () => {
      service.enter('video-1', { width: 400, height: 225 });
      const state = service.exit();
      expect(state.width).toBe(400);
      expect(state.height).toBe(225);
    });
  });

  describe('toggle', () => {
    it('should activate PiP when not active', () => {
      const state = service.toggle('video-1');
      expect(state.isActive).toBe(true);
      expect(state.videoId).toBe('video-1');
    });

    it('should deactivate PiP for same video', () => {
      service.enter('video-1');
      const state = service.toggle('video-1');
      expect(state.isActive).toBe(false);
      expect(state.videoId).toBeNull();
    });

    it('should switch video when toggling different video', () => {
      service.enter('video-1');
      const state = service.toggle('video-2');
      expect(state.isActive).toBe(true);
      expect(state.videoId).toBe('video-2');
    });
  });

  describe('isSupported', () => {
    it('should return true', () => {
      expect(service.isSupported()).toBe(true);
    });
  });

  describe('resize', () => {
    it('should resize the PiP window', () => {
      service.enter('video-1');
      const state = service.resize(500, 300);
      expect(state.width).toBe(500);
      expect(state.height).toBe(300);
    });

    it('should not resize with invalid dimensions', () => {
      service.enter('video-1');
      const state = service.resize(-1, 0);
      expect(state.width).toBe(320);
      expect(state.height).toBe(180);
    });
  });

  describe('reposition', () => {
    it('should reposition the PiP window', () => {
      service.enter('video-1');
      const state = service.reposition(100, 200);
      expect(state.position.x).toBe(100);
      expect(state.position.y).toBe(200);
    });
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const state = service.getState();
      expect(state.isActive).toBe(false);
      expect(state.videoId).toBeNull();
    });

    it('should return a copy, not reference', () => {
      const state1 = service.getState();
      state1.position.x = 999;
      const state2 = service.getState();
      expect(state2.position.x).toBe(0);
    });
  });
});
