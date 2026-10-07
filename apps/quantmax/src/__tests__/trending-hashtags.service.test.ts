import { describe, it, expect, beforeEach } from 'vitest';
import { TrendingHashtagsService } from '../services/trending-hashtags.service';

describe('TrendingHashtagsService', () => {
  let service: TrendingHashtagsService;

  beforeEach(() => {
    service = new TrendingHashtagsService();
  });

  describe('trackUsage', () => {
    it('should track a new hashtag', () => {
      service.trackUsage('dance');
      const stats = service.getStats('dance');
      expect(stats).not.toBeNull();
      expect(stats?.volume).toBe(1);
    });

    it('should increment volume on repeated usage', () => {
      service.trackUsage('fyp');
      service.trackUsage('fyp');
      service.trackUsage('fyp');
      const stats = service.getStats('fyp');
      expect(stats?.volume).toBe(3);
    });

    it('should normalize hashtags (lowercase, strip #)', () => {
      service.trackUsage('#Dance');
      service.trackUsage('DANCE');
      const stats = service.getStats('dance');
      expect(stats?.volume).toBe(2);
    });
  });

  describe('getTrending', () => {
    it('should return hashtags sorted by volume', () => {
      service.trackUsage('a');
      service.trackUsage('b');
      service.trackUsage('b');
      service.trackUsage('c');
      service.trackUsage('c');
      service.trackUsage('c');

      const trending = service.getTrending(3);
      expect(trending[0]?.tag).toBe('c');
      expect(trending[0]?.rank).toBe(1);
    });

    it('should respect limit', () => {
      service.trackUsage('a');
      service.trackUsage('b');
      service.trackUsage('c');
      expect(service.getTrending(2)).toHaveLength(2);
    });

    it('should mark new hashtags', () => {
      service.trackUsage('new');
      const trending = service.getTrending(10);
      expect(trending[0]?.isNew).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return null for unknown hashtag', () => {
      expect(service.getStats('nonexistent')).toBeNull();
    });
  });

  describe('suggestHashtags', () => {
    it('should suggest hashtags based on content words', () => {
      service.trackUsage('dance');
      service.trackUsage('cooking');
      const suggestions = service.suggestHashtags('I love to dance', 5);
      expect(suggestions).toContain('dance');
    });

    it('should respect limit', () => {
      service.trackUsage('a');
      service.trackUsage('b');
      const suggestions = service.suggestHashtags('a b', 1);
      expect(suggestions.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getRelated', () => {
    it('should return related tags', () => {
      service.trackUsage('dance');
      service.addRelated('dance', 'choreography');
      service.addRelated('dance', 'music');
      const related = service.getRelated('dance', 5);
      expect(related).toContain('choreography');
    });

    it('should return empty for unknown tag', () => {
      expect(service.getRelated('unknown', 5)).toHaveLength(0);
    });
  });

  describe('getVelocity', () => {
    it('should return 0 for unknown tag', () => {
      expect(service.getVelocity('unknown')).toBe(0);
    });

    it('should return 0 for tag with single usage', () => {
      service.trackUsage('once');
      expect(service.getVelocity('once')).toBe(0);
    });
  });

  describe('isCurrentlyTrending', () => {
    it('should return false for low-volume tags', () => {
      service.trackUsage('low');
      expect(service.isCurrentlyTrending('low')).toBe(false);
    });

    it('should return true for high-volume tags', () => {
      for (let i = 0; i < 10; i++) {
        service.trackUsage('hot');
      }
      expect(service.isCurrentlyTrending('hot')).toBe(true);
    });
  });
});
