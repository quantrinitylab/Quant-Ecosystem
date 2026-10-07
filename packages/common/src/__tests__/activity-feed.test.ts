// ============================================================================
// Activity Feed Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActivityFeedService } from '../activity-feed';

describe('ActivityFeedService', () => {
  let service: ActivityFeedService;

  beforeEach(() => {
    service = new ActivityFeedService();
  });

  describe('publish', () => {
    it('should create an activity with id and timestamp', () => {
      const result = service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'New Post',
        description: 'Created a new post',
      });

      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.app).toBe('quantchat');
      expect(result.type).toBe('post');
    });

    it('should notify subscribers', () => {
      const callback = vi.fn();
      service.subscribe('user1', callback);

      service.publish({
        userId: 'user1',
        app: 'quantsync',
        type: 'share',
        title: 'Shared',
        description: 'Shared a photo',
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTimeline', () => {
    it('should return activities for a user', () => {
      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'A',
        description: 'a',
      });
      service.publish({
        userId: 'user1',
        app: 'quantmail',
        type: 'create',
        title: 'B',
        description: 'b',
      });
      service.publish({
        userId: 'user2',
        app: 'quantsync',
        type: 'like',
        title: 'C',
        description: 'c',
      });

      const timeline = service.getTimeline('user1');
      expect(timeline).toHaveLength(2);
    });

    it('should filter by apps', () => {
      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'A',
        description: 'a',
      });
      service.publish({
        userId: 'user1',
        app: 'quantmail',
        type: 'create',
        title: 'B',
        description: 'b',
      });

      const filtered = service.getTimeline('user1', { apps: ['quantchat'] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.app).toBe('quantchat');
    });

    it('should filter by types', () => {
      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'A',
        description: 'a',
      });
      service.publish({
        userId: 'user1',
        app: 'quantsync',
        type: 'like',
        title: 'B',
        description: 'b',
      });

      const filtered = service.getTimeline('user1', { types: ['like'] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.type).toBe('like');
    });

    it('should respect limit', () => {
      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'A',
        description: 'a',
      });
      service.publish({
        userId: 'user1',
        app: 'quantmail',
        type: 'create',
        title: 'B',
        description: 'b',
      });
      service.publish({
        userId: 'user1',
        app: 'quantsync',
        type: 'share',
        title: 'C',
        description: 'c',
      });

      const limited = service.getTimeline('user1', { limit: 2 });
      expect(limited).toHaveLength(2);
    });
  });

  describe('getActivities', () => {
    it('should return user activities', () => {
      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'A',
        description: 'a',
      });
      const activities = service.getActivities('user1');
      expect(activities).toHaveLength(1);
    });
  });

  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const callback = vi.fn();
      const unsub = service.subscribe('user1', callback);

      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'A',
        description: 'a',
      });
      expect(callback).toHaveBeenCalledTimes(1);

      unsub();
      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'B',
        description: 'b',
      });
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAppActivity', () => {
    it('should return activities for a specific app', () => {
      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'A',
        description: 'a',
      });
      service.publish({
        userId: 'user2',
        app: 'quantchat',
        type: 'comment',
        title: 'B',
        description: 'b',
      });
      service.publish({
        userId: 'user1',
        app: 'quantmail',
        type: 'create',
        title: 'C',
        description: 'c',
      });

      const appActivity = service.getAppActivity('quantchat');
      expect(appActivity).toHaveLength(2);
    });

    it('should respect limit', () => {
      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'A',
        description: 'a',
      });
      service.publish({
        userId: 'user2',
        app: 'quantchat',
        type: 'post',
        title: 'B',
        description: 'b',
      });

      const limited = service.getAppActivity('quantchat', 1);
      expect(limited).toHaveLength(1);
    });
  });

  describe('deleteActivity', () => {
    it('should delete an activity', () => {
      const activity = service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'A',
        description: 'a',
      });
      const result = service.deleteActivity(activity.id);
      expect(result).toBe(true);

      const timeline = service.getTimeline('user1');
      expect(timeline).toHaveLength(0);
    });

    it('should return false for non-existent activity', () => {
      const result = service.deleteActivity('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return activity counts by type', () => {
      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'A',
        description: 'a',
      });
      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'B',
        description: 'b',
      });
      service.publish({
        userId: 'user1',
        app: 'quantsync',
        type: 'like',
        title: 'C',
        description: 'c',
      });

      const stats = service.getStats('user1');
      expect(stats['post']).toBe(2);
      expect(stats['like']).toBe(1);
    });
  });

  describe('clearOlderThan', () => {
    it('should not remove recent activities', () => {
      service.publish({
        userId: 'user1',
        app: 'quantchat',
        type: 'post',
        title: 'A',
        description: 'a',
      });
      const count = service.clearOlderThan(1);
      expect(count).toBe(0);
    });
  });
});
