// ============================================================================
// Search Observability Service - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { SearchObservabilityService } from './search-observability';

describe('SearchObservabilityService', () => {
  let service: SearchObservabilityService;

  beforeEach(() => {
    service = new SearchObservabilityService();
  });

  describe('recordQuery', () => {
    it('should record a query', () => {
      service.recordQuery('hello world', 50, 10, 'user-1');
      const metrics = service.getMetrics();
      expect(metrics.totalQueries).toBe(1);
    });
  });

  describe('getMetrics', () => {
    it('should return zero metrics for empty store', () => {
      const metrics = service.getMetrics();
      expect(metrics.totalQueries).toBe(0);
      expect(metrics.avgLatencyMs).toBe(0);
      expect(metrics.p50LatencyMs).toBe(0);
      expect(metrics.p95LatencyMs).toBe(0);
      expect(metrics.p99LatencyMs).toBe(0);
    });

    it('should compute correct average latency', () => {
      service.recordQuery('q1', 100, 5, 'user-1');
      service.recordQuery('q2', 200, 10, 'user-1');
      service.recordQuery('q3', 300, 0, 'user-1');

      const metrics = service.getMetrics();
      expect(metrics.avgLatencyMs).toBe(200);
      expect(metrics.totalQueries).toBe(3);
    });

    it('should compute p50 latency correctly', () => {
      // Record 10 queries with latencies 10, 20, 30, ..., 100
      for (let i = 1; i <= 10; i++) {
        service.recordQuery(`q${i}`, i * 10, 5, 'user-1');
      }

      const metrics = service.getMetrics();
      expect(metrics.p50LatencyMs).toBe(50);
    });

    it('should compute p95 and p99 latency correctly', () => {
      // Record 100 queries with latencies 1..100
      for (let i = 1; i <= 100; i++) {
        service.recordQuery(`q${i}`, i, 5, 'user-1');
      }

      const metrics = service.getMetrics();
      expect(metrics.p95LatencyMs).toBe(95);
      expect(metrics.p99LatencyMs).toBe(99);
    });

    it('should track zero-result queries', () => {
      service.recordQuery('found', 50, 10, 'user-1');
      service.recordQuery('not-found', 50, 0, 'user-1');
      service.recordQuery('also-not-found', 30, 0, 'user-1');

      const metrics = service.getMetrics();
      expect(metrics.zeroResultCount).toBe(2);
    });

    it('should filter by time range', () => {
      service.recordQuery('early', 50, 5, 'user-1');

      // Wait is not needed - just test with an explicit range that excludes the record
      const futureRange = {
        from: new Date(Date.now() + 60000),
        to: new Date(Date.now() + 120000),
      };
      const metrics = service.getMetrics(futureRange);
      expect(metrics.totalQueries).toBe(0);
    });
  });

  describe('getSlowQueries', () => {
    it('should return queries above threshold', () => {
      service.recordQuery('fast', 20, 10, 'user-1');
      service.recordQuery('slow', 500, 5, 'user-1');
      service.recordQuery('very-slow', 1000, 3, 'user-2');

      const slow = service.getSlowQueries(100);
      expect(slow).toHaveLength(2);
      expect(slow[0]!.query).toBe('very-slow');
      expect(slow[1]!.query).toBe('slow');
    });

    it('should return empty array when no slow queries', () => {
      service.recordQuery('fast', 20, 10, 'user-1');
      const slow = service.getSlowQueries(100);
      expect(slow).toHaveLength(0);
    });
  });

  describe('getPopularQueries', () => {
    it('should return queries sorted by frequency', () => {
      service.recordQuery('alpha', 50, 5, 'user-1');
      service.recordQuery('alpha', 60, 5, 'user-2');
      service.recordQuery('alpha', 40, 5, 'user-3');
      service.recordQuery('beta', 50, 5, 'user-1');
      service.recordQuery('beta', 50, 5, 'user-2');
      service.recordQuery('gamma', 50, 5, 'user-1');

      const popular = service.getPopularQueries(2);
      expect(popular).toHaveLength(2);
      expect(popular[0]!.query).toBe('alpha');
      expect(popular[0]!.count).toBe(3);
      expect(popular[1]!.query).toBe('beta');
      expect(popular[1]!.count).toBe(2);
    });

    it('should normalize query case', () => {
      service.recordQuery('Hello', 50, 5, 'user-1');
      service.recordQuery('hello', 50, 5, 'user-1');
      service.recordQuery('HELLO', 50, 5, 'user-1');

      const popular = service.getPopularQueries(10);
      expect(popular).toHaveLength(1);
      expect(popular[0]!.count).toBe(3);
    });

    it('should respect limit', () => {
      service.recordQuery('a', 50, 5, 'user-1');
      service.recordQuery('b', 50, 5, 'user-1');
      service.recordQuery('c', 50, 5, 'user-1');

      const popular = service.getPopularQueries(1);
      expect(popular).toHaveLength(1);
    });
  });

  describe('getZeroResultQueries', () => {
    it('should return queries with zero results', () => {
      service.recordQuery('found', 50, 10, 'user-1');
      service.recordQuery('not-found', 50, 0, 'user-1');
      service.recordQuery('not-found', 60, 0, 'user-2');
      service.recordQuery('also-missing', 30, 0, 'user-1');

      const zeroResult = service.getZeroResultQueries(10);
      expect(zeroResult).toHaveLength(2);
      expect(zeroResult[0]!.query).toBe('not-found');
      expect(zeroResult[0]!.count).toBe(2);
    });

    it('should return empty when all queries have results', () => {
      service.recordQuery('query1', 50, 5, 'user-1');
      const zeroResult = service.getZeroResultQueries(10);
      expect(zeroResult).toHaveLength(0);
    });
  });
});
