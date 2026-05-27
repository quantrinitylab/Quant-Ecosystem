import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostSchedulerService } from '../services/post-scheduler.service';

describe('PostSchedulerService', () => {
  let service: PostSchedulerService;

  beforeEach(() => {
    service = new PostSchedulerService();
  });

  describe('schedule', () => {
    it('should schedule a post for future publication', () => {
      const future = Date.now() + 3600000;
      const post = service.schedule({
        content: 'Hello world!',
        scheduledAt: future,
        timezone: 'America/New_York',
        platforms: ['twitter', 'linkedin'],
      });

      expect(post.id).toBeDefined();
      expect(post.content).toBe('Hello world!');
      expect(post.status).toBe('scheduled');
      expect(post.scheduledAt).toBe(future);
      expect(post.platforms).toEqual(['twitter', 'linkedin']);
    });

    it('should throw if scheduledAt is in the past', () => {
      const past = Date.now() - 1000;
      expect(() =>
        service.schedule({
          content: 'Test',
          scheduledAt: past,
          timezone: 'UTC',
          platforms: ['twitter'],
        }),
      ).toThrow('Scheduled time must be in the future');
    });

    it('should throw if no platforms specified', () => {
      const future = Date.now() + 3600000;
      expect(() =>
        service.schedule({
          content: 'Test',
          scheduledAt: future,
          timezone: 'UTC',
          platforms: [],
        }),
      ).toThrow('At least one platform must be specified');
    });

    it('should support media attachments', () => {
      const future = Date.now() + 3600000;
      const post = service.schedule({
        content: 'With media',
        media: ['image1.jpg', 'image2.jpg'],
        scheduledAt: future,
        timezone: 'UTC',
        platforms: ['instagram'],
      });

      expect(post.media).toEqual(['image1.jpg', 'image2.jpg']);
    });
  });

  describe('cancel', () => {
    it('should cancel a scheduled post', () => {
      const future = Date.now() + 3600000;
      const post = service.schedule({
        content: 'Cancel me',
        scheduledAt: future,
        timezone: 'UTC',
        platforms: ['twitter'],
      });

      const result = service.cancel(post.id);
      expect(result).toBe(true);
    });

    it('should return false for non-existent post', () => {
      expect(service.cancel('non-existent')).toBe(false);
    });

    it('should return false for already published post', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const post = service.schedule({
        content: 'Test',
        scheduledAt: now + 1000,
        timezone: 'UTC',
        platforms: ['twitter'],
      });

      vi.setSystemTime(now + 2000);
      service.checkAndPublish();

      expect(service.cancel(post.id)).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('update', () => {
    it('should update a scheduled post', () => {
      const future = Date.now() + 3600000;
      const post = service.schedule({
        content: 'Original',
        scheduledAt: future,
        timezone: 'UTC',
        platforms: ['twitter'],
      });

      const updated = service.update(post.id, { content: 'Updated' });
      expect(updated?.content).toBe('Updated');
    });

    it('should return null for non-existent post', () => {
      expect(service.update('non-existent', { content: 'X' })).toBeNull();
    });

    it('should throw if updating scheduledAt to past', () => {
      const future = Date.now() + 3600000;
      const post = service.schedule({
        content: 'Test',
        scheduledAt: future,
        timezone: 'UTC',
        platforms: ['twitter'],
      });

      expect(() => service.update(post.id, { scheduledAt: Date.now() - 1000 })).toThrow(
        'Scheduled time must be in the future',
      );
    });

    it('should not allow updating cancelled posts', () => {
      const future = Date.now() + 3600000;
      const post = service.schedule({
        content: 'Test',
        scheduledAt: future,
        timezone: 'UTC',
        platforms: ['twitter'],
      });

      service.cancel(post.id);
      expect(service.update(post.id, { content: 'X' })).toBeNull();
    });
  });

  describe('getScheduled', () => {
    it('should return only scheduled posts sorted by time', () => {
      const now = Date.now();
      service.schedule({
        content: 'Later',
        scheduledAt: now + 7200000,
        timezone: 'UTC',
        platforms: ['twitter'],
      });
      service.schedule({
        content: 'Sooner',
        scheduledAt: now + 3600000,
        timezone: 'UTC',
        platforms: ['twitter'],
      });

      const scheduled = service.getScheduled();
      expect(scheduled).toHaveLength(2);
      expect(scheduled[0]?.content).toBe('Sooner');
      expect(scheduled[1]?.content).toBe('Later');
    });
  });

  describe('getOptimalTimes', () => {
    it('should return suggested posting hours', () => {
      const times = service.getOptimalTimes(1);
      expect(times.length).toBeGreaterThan(0);
      expect(times.every((t) => t >= 0 && t <= 23)).toBe(true);
    });
  });

  describe('checkAndPublish', () => {
    it('should publish posts whose scheduled time has passed', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      service.schedule({
        content: 'Ready',
        scheduledAt: now + 1000,
        timezone: 'UTC',
        platforms: ['twitter'],
      });
      service.schedule({
        content: 'Not yet',
        scheduledAt: now + 10000,
        timezone: 'UTC',
        platforms: ['twitter'],
      });

      vi.setSystemTime(now + 2000);
      const published = service.checkAndPublish();

      expect(published).toHaveLength(1);
      expect(published[0]?.content).toBe('Ready');
      expect(published[0]?.status).toBe('published');

      vi.useRealTimers();
    });
  });
});
