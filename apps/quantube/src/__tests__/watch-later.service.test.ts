import { describe, it, expect, beforeEach } from 'vitest';
import { WatchLaterService } from '../services/watch-later.service';

describe('WatchLaterService', () => {
  let service: WatchLaterService;

  beforeEach(() => {
    service = new WatchLaterService();
  });

  describe('add', () => {
    it('should add a video to the queue', () => {
      const item = service.add('video-1');
      expect(item.videoId).toBe('video-1');
      expect(item.watched).toBe(false);
      expect(item.position).toBe(0);
      expect(item.addedAt).toBeGreaterThan(0);
    });

    it('should not add duplicate videos', () => {
      const first = service.add('video-1');
      const second = service.add('video-1');
      expect(first).toBe(second);
      expect(service.getQueue()).toHaveLength(1);
    });

    it('should assign incremental positions', () => {
      service.add('video-1');
      const second = service.add('video-2');
      expect(second.position).toBe(1);
    });
  });

  describe('remove', () => {
    it('should remove a video from the queue', () => {
      service.add('video-1');
      const result = service.remove('video-1');
      expect(result).toBe(true);
      expect(service.getQueue()).toHaveLength(0);
    });

    it('should return false for non-existent video', () => {
      expect(service.remove('video-1')).toBe(false);
    });

    it('should reindex positions after removal', () => {
      service.add('video-1');
      service.add('video-2');
      service.add('video-3');
      service.remove('video-2');
      const queue = service.getQueue();
      expect(queue[0]?.position).toBe(0);
      expect(queue[1]?.position).toBe(1);
    });
  });

  describe('getQueue', () => {
    it('should return empty array initially', () => {
      expect(service.getQueue()).toHaveLength(0);
    });

    it('should return all items in order', () => {
      service.add('video-1');
      service.add('video-2');
      const queue = service.getQueue();
      expect(queue).toHaveLength(2);
      expect(queue[0]?.videoId).toBe('video-1');
      expect(queue[1]?.videoId).toBe('video-2');
    });
  });

  describe('reorder', () => {
    it('should move video to new position', () => {
      service.add('video-1');
      service.add('video-2');
      service.add('video-3');

      const queue = service.reorder('video-3', 0);
      expect(queue[0]?.videoId).toBe('video-3');
      expect(queue[1]?.videoId).toBe('video-1');
      expect(queue[2]?.videoId).toBe('video-2');
    });

    it('should clamp position to valid range', () => {
      service.add('video-1');
      service.add('video-2');

      const queue = service.reorder('video-1', 100);
      expect(queue[1]?.videoId).toBe('video-1');
    });

    it('should return unchanged queue for non-existent video', () => {
      service.add('video-1');
      const queue = service.reorder('non-existent', 0);
      expect(queue).toHaveLength(1);
    });
  });

  describe('markWatched', () => {
    it('should mark a video as watched', () => {
      service.add('video-1');
      service.markWatched('video-1');
      const queue = service.getQueue();
      expect(queue[0]?.watched).toBe(true);
      expect(queue[0]?.watchedAt).toBeGreaterThan(0);
    });

    it('should not throw for non-existent video', () => {
      expect(() => service.markWatched('non-existent')).not.toThrow();
    });
  });

  describe('getNext', () => {
    it('should return first unwatched item', () => {
      service.add('video-1');
      service.add('video-2');
      service.markWatched('video-1');

      const next = service.getNext();
      expect(next?.videoId).toBe('video-2');
    });

    it('should return null when all are watched', () => {
      service.add('video-1');
      service.markWatched('video-1');
      expect(service.getNext()).toBeNull();
    });

    it('should return null for empty queue', () => {
      expect(service.getNext()).toBeNull();
    });
  });

  describe('clearWatched', () => {
    it('should remove all watched items', () => {
      service.add('video-1');
      service.add('video-2');
      service.add('video-3');
      service.markWatched('video-1');
      service.markWatched('video-3');

      const count = service.clearWatched();
      expect(count).toBe(2);
      expect(service.getQueue()).toHaveLength(1);
      expect(service.getQueue()[0]?.videoId).toBe('video-2');
    });

    it('should return 0 when nothing is watched', () => {
      service.add('video-1');
      expect(service.clearWatched()).toBe(0);
    });
  });

  describe('isInQueue', () => {
    it('should return true for queued video', () => {
      service.add('video-1');
      expect(service.isInQueue('video-1')).toBe(true);
    });

    it('should return false for non-queued video', () => {
      expect(service.isInQueue('video-1')).toBe(false);
    });
  });
});
