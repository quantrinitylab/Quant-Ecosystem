import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsAggregatorService } from '../analytics-aggregator.service.js';

describe('AnalyticsAggregatorService', () => {
  let service: AnalyticsAggregatorService;

  beforeEach(() => {
    service = new AnalyticsAggregatorService();
  });

  describe('recordMetrics', () => {
    it('should record metrics for a surface', () => {
      service.recordMetrics(
        'intent-1',
        'quantube',
        {
          views: 100,
          likes: 10,
          shares: 5,
          comments: 3,
          watchTime: 500,
        },
        'user-1',
      );

      const aggregated = service.getAggregated('intent-1');
      expect(aggregated).toBeDefined();
      expect(aggregated!.perSurface).toHaveLength(1);
      expect(aggregated!.perSurface[0]!.surface).toBe('quantube');
      expect(aggregated!.perSurface[0]!.metrics.views).toBe(100);
    });

    it('should update existing metrics for same surface', () => {
      service.recordMetrics(
        'intent-1',
        'quantube',
        {
          views: 100,
          likes: 10,
          shares: 5,
          comments: 3,
          watchTime: 500,
        },
        'user-1',
      );
      service.recordMetrics(
        'intent-1',
        'quantube',
        {
          views: 200,
          likes: 20,
          shares: 10,
          comments: 6,
          watchTime: 1000,
        },
        'user-1',
      );

      const aggregated = service.getAggregated('intent-1');
      expect(aggregated!.perSurface).toHaveLength(1);
      expect(aggregated!.perSurface[0]!.metrics.views).toBe(200);
    });
  });

  describe('getAggregated', () => {
    it('should aggregate metrics across multiple surfaces', () => {
      service.recordMetrics(
        'intent-1',
        'quantube',
        {
          views: 100,
          likes: 10,
          shares: 5,
          comments: 3,
          watchTime: 500,
        },
        'user-1',
      );
      service.recordMetrics(
        'intent-1',
        'quantsync',
        {
          views: 200,
          likes: 50,
          shares: 20,
          comments: 10,
          watchTime: 300,
        },
        'user-1',
      );
      service.recordMetrics(
        'intent-1',
        'quantneon',
        {
          views: 50,
          likes: 30,
          shares: 15,
          comments: 5,
          watchTime: 0,
        },
        'user-1',
      );

      const aggregated = service.getAggregated('intent-1');
      expect(aggregated).toBeDefined();
      expect(aggregated!.surfaces).toHaveLength(3);
      expect(aggregated!.totalMetrics.views).toBe(350);
      expect(aggregated!.totalMetrics.likes).toBe(90);
      expect(aggregated!.totalMetrics.shares).toBe(40);
      expect(aggregated!.totalMetrics.comments).toBe(18);
      expect(aggregated!.totalMetrics.watchTime).toBe(800);
    });

    it('should return undefined for nonexistent intent', () => {
      const result = service.getAggregated('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getByUser', () => {
    it('should return analytics for a specific user', () => {
      service.recordMetrics(
        'intent-1',
        'quantube',
        {
          views: 100,
          likes: 10,
          shares: 5,
          comments: 3,
          watchTime: 500,
        },
        'user-1',
      );
      service.recordMetrics(
        'intent-2',
        'quantsync',
        {
          views: 200,
          likes: 50,
          shares: 20,
          comments: 10,
          watchTime: 300,
        },
        'user-1',
      );
      service.recordMetrics(
        'intent-3',
        'quantneon',
        {
          views: 50,
          likes: 30,
          shares: 15,
          comments: 5,
          watchTime: 0,
        },
        'user-2',
      );

      const results = service.getByUser('user-1');
      expect(results).toHaveLength(2);
    });

    it('should return empty array for user with no analytics', () => {
      const results = service.getByUser('unknown-user');
      expect(results).toHaveLength(0);
    });
  });
});
