import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsService } from '../services/analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    service = new AnalyticsService();
  });

  describe('trackImpression', () => {
    it('should increment impression count', () => {
      service.trackImpression('post-1');
      service.trackImpression('post-1');
      service.trackImpression('post-1');

      const metrics = service.getPostMetrics('post-1');
      expect(metrics.impressions).toBe(3);
    });
  });

  describe('trackClick', () => {
    it('should increment click count and update engagement rate', () => {
      service.trackImpression('post-1');
      service.trackImpression('post-1');
      service.trackClick('post-1');

      const metrics = service.getPostMetrics('post-1');
      expect(metrics.clicks).toBe(1);
      expect(metrics.engagementRate).toBeGreaterThan(0);
    });
  });

  describe('getPostMetrics', () => {
    it('should return default metrics for new post', () => {
      const metrics = service.getPostMetrics('new-post');

      expect(metrics.postId).toBe('new-post');
      expect(metrics.impressions).toBe(0);
      expect(metrics.clicks).toBe(0);
      expect(metrics.likes).toBe(0);
      expect(metrics.shares).toBe(0);
      expect(metrics.engagementRate).toBe(0);
    });

    it('should return stored metrics', () => {
      service.setMetrics('post-1', { impressions: 100, likes: 10, shares: 5 });

      const metrics = service.getPostMetrics('post-1');
      expect(metrics.impressions).toBe(100);
      expect(metrics.likes).toBe(10);
      expect(metrics.shares).toBe(5);
    });
  });

  describe('getEngagementRate', () => {
    it('should return 0 for post with no impressions', () => {
      expect(service.getEngagementRate('new-post')).toBe(0);
    });

    it('should calculate engagement rate correctly', () => {
      service.setMetrics('post-1', {
        impressions: 100,
        likes: 5,
        shares: 3,
        comments: 2,
        clicks: 10,
        saves: 0,
      });

      const rate = service.getEngagementRate('post-1');
      // (5 + 3 + 2 + 10 + 0) / 100 * 100 = 20%
      expect(rate).toBe(20);
    });
  });

  describe('getTopPosts', () => {
    it('should return top posts by engagement rate', () => {
      service.registerPost('user-1', 'post-a');
      service.registerPost('user-1', 'post-b');
      service.registerPost('user-1', 'post-c');

      service.setMetrics('post-a', { impressions: 100, likes: 5 });
      service.setMetrics('post-b', { impressions: 100, likes: 20 });
      service.setMetrics('post-c', { impressions: 100, likes: 10 });

      const topPosts = service.getTopPosts('user-1', 2);
      expect(topPosts).toHaveLength(2);
      expect(topPosts[0]?.postId).toBe('post-b');
      expect(topPosts[1]?.postId).toBe('post-c');
    });

    it('should return empty array for user with no posts', () => {
      expect(service.getTopPosts('no-user', 5)).toHaveLength(0);
    });
  });

  describe('getProfileMetrics', () => {
    it('should return aggregated profile metrics', () => {
      service.registerPost('user-1', 'post-1');
      service.registerPost('user-1', 'post-2');
      service.setMetrics('post-1', { impressions: 100, likes: 10 });
      service.setMetrics('post-2', { impressions: 200, likes: 40 });

      const profile = service.getProfileMetrics('user-1', { start: 0, end: Date.now() });
      expect(profile.totalPosts).toBe(2);
      expect(profile.avgEngagement).toBeGreaterThan(0);
      expect(profile.topPosts.length).toBeGreaterThan(0);
    });

    it('should return default metrics for unknown user', () => {
      const profile = service.getProfileMetrics('unknown', { start: 0, end: Date.now() });
      expect(profile.totalPosts).toBe(0);
      expect(profile.avgEngagement).toBe(0);
    });
  });
});
