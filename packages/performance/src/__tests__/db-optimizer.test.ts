import { describe, it, expect } from 'vitest';
import { DatabaseOptimizer } from '../db-optimizer.js';

describe('DatabaseOptimizer', () => {
  describe('slowQueryDetector', () => {
    it('detects a slow query above threshold', () => {
      const optimizer = new DatabaseOptimizer({ defaultThresholdMs: 100 });
      const result = optimizer.slowQueryDetector('SELECT * FROM users', 150);

      expect(result.isSlow).toBe(true);
      expect(result.recommendation).toContain('150ms');
    });

    it('passes a fast query below threshold', () => {
      const optimizer = new DatabaseOptimizer({ defaultThresholdMs: 100 });
      const result = optimizer.slowQueryDetector('SELECT id FROM users WHERE id = 1', 50);

      expect(result.isSlow).toBe(false);
      expect(result.recommendation).toBe('Query performance is acceptable.');
    });

    it('uses custom threshold when provided', () => {
      const optimizer = new DatabaseOptimizer({ defaultThresholdMs: 100 });
      const result = optimizer.slowQueryDetector('SELECT * FROM users', 80, 50);

      expect(result.isSlow).toBe(true);
      expect(result.threshold).toBe(50);
    });

    it('suggests avoiding SELECT *', () => {
      const optimizer = new DatabaseOptimizer();
      const result = optimizer.slowQueryDetector('SELECT * FROM users', 200);

      expect(result.recommendation).toContain('Avoid SELECT *');
    });

    it('suggests adding WHERE clause', () => {
      const optimizer = new DatabaseOptimizer();
      const result = optimizer.slowQueryDetector('SELECT id FROM users', 200);

      expect(result.recommendation).toContain('WHERE clause');
    });

    it('records slow queries in log', () => {
      const optimizer = new DatabaseOptimizer({ defaultThresholdMs: 50 });
      optimizer.slowQueryDetector('SELECT * FROM users', 100);
      optimizer.slowQueryDetector('SELECT * FROM orders', 200);
      optimizer.slowQueryDetector('SELECT id FROM users WHERE id = 1', 30); // not slow

      const log = optimizer.getSlowQueries();
      expect(log).toHaveLength(2);
    });
  });

  describe('indexAdvisor', () => {
    it('recommends indexes for frequent slow queries', () => {
      const optimizer = new DatabaseOptimizer();
      const recommendations = optimizer.indexAdvisor([
        {
          query: 'SELECT * FROM users WHERE email = ?',
          frequency: 1500,
          avgDurationMs: 150,
          table: 'users',
          columns: ['email'],
        },
      ]);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].table).toBe('users');
      expect(recommendations[0].columns).toContain('email');
      expect(recommendations[0].priority).toBe('critical');
    });

    it('suggests composite indexes for multi-column patterns', () => {
      const optimizer = new DatabaseOptimizer();
      const recommendations = optimizer.indexAdvisor([
        {
          query: 'SELECT * FROM orders WHERE user_id = ? AND status = ?',
          frequency: 500,
          avgDurationMs: 80,
          table: 'orders',
          columns: ['user_id', 'status'],
        },
      ]);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('COMPOSITE');
      expect(recommendations[0].columns).toEqual(['user_id', 'status']);
    });

    it('sorts recommendations by priority', () => {
      const optimizer = new DatabaseOptimizer();
      const recommendations = optimizer.indexAdvisor([
        {
          query: 'SELECT * FROM logs WHERE level = ?',
          frequency: 5,
          avgDurationMs: 20,
          table: 'logs',
          columns: ['level'],
        },
        {
          query: 'SELECT * FROM users WHERE email = ?',
          frequency: 2000,
          avgDurationMs: 200,
          table: 'users',
          columns: ['email'],
        },
      ]);

      expect(recommendations[0].priority).toBe('critical');
      expect(recommendations[1].priority).toBe('low');
    });

    it('returns empty for no patterns', () => {
      const optimizer = new DatabaseOptimizer();
      const recommendations = optimizer.indexAdvisor([]);
      expect(recommendations).toHaveLength(0);
    });
  });

  describe('connectionPoolMonitor', () => {
    it('reports healthy pool', () => {
      const optimizer = new DatabaseOptimizer();
      const result = optimizer.connectionPoolMonitor({
        totalConnections: 20,
        activeConnections: 5,
        idleConnections: 15,
        waitingRequests: 0,
        avgAcquireTimeMs: 5,
        maxConnections: 50,
      });

      expect(result.healthy).toBe(true);
      expect(result.utilization).toBeCloseTo(0.1, 2);
    });

    it('detects high utilization', () => {
      const optimizer = new DatabaseOptimizer();
      const result = optimizer.connectionPoolMonitor({
        totalConnections: 50,
        activeConnections: 45,
        idleConnections: 5,
        waitingRequests: 0,
        avgAcquireTimeMs: 10,
        maxConnections: 50,
      });

      expect(result.healthy).toBe(false);
      expect(result.recommendations.some((r) => r.includes('utilization'))).toBe(true);
    });

    it('detects saturation', () => {
      const optimizer = new DatabaseOptimizer();
      const result = optimizer.connectionPoolMonitor({
        totalConnections: 50,
        activeConnections: 50,
        idleConnections: 0,
        waitingRequests: 20,
        avgAcquireTimeMs: 100,
        maxConnections: 50,
      });

      expect(result.healthy).toBe(false);
      expect(result.saturation).toBeGreaterThan(1);
      expect(result.recommendations.some((r) => r.includes('saturated'))).toBe(true);
    });

    it('detects high acquire time', () => {
      const optimizer = new DatabaseOptimizer();
      const result = optimizer.connectionPoolMonitor({
        totalConnections: 20,
        activeConnections: 15,
        idleConnections: 5,
        waitingRequests: 0,
        avgAcquireTimeMs: 60,
        maxConnections: 50,
      });

      expect(result.healthy).toBe(false);
      expect(result.recommendations.some((r) => r.includes('acquire time'))).toBe(true);
    });
  });

  describe('partitionRecommender', () => {
    it('recommends no partitioning for small tables', () => {
      const optimizer = new DatabaseOptimizer();
      const result = optimizer.partitionRecommender({
        tableName: 'settings',
        rowCount: 100,
        sizeBytes: 10240,
        avgRowSizeBytes: 102,
        hasTimestampColumn: false,
        hasTenantColumn: false,
        readWriteRatio: 1,
        oldestRowAge: 365,
      });

      expect(result.strategy).toBe('NONE');
    });

    it('recommends RANGE for time-series data', () => {
      const optimizer = new DatabaseOptimizer();
      const result = optimizer.partitionRecommender({
        tableName: 'events',
        rowCount: 50_000_000,
        sizeBytes: 50_000_000_000,
        avgRowSizeBytes: 1000,
        hasTimestampColumn: true,
        hasTenantColumn: false,
        readWriteRatio: 10,
        oldestRowAge: 730,
      });

      expect(result.strategy).toBe('RANGE');
      expect(result.partitionKey).toBe('created_at');
    });

    it('recommends LIST for multi-tenant tables', () => {
      const optimizer = new DatabaseOptimizer();
      const result = optimizer.partitionRecommender({
        tableName: 'user_data',
        rowCount: 10_000_000,
        sizeBytes: 10_000_000_000,
        avgRowSizeBytes: 1000,
        hasTimestampColumn: false,
        hasTenantColumn: true,
        readWriteRatio: 3,
        oldestRowAge: 365,
      });

      expect(result.strategy).toBe('LIST');
      expect(result.partitionKey).toBe('tenant_id');
    });

    it('recommends HASH for large tables without clear pattern', () => {
      const optimizer = new DatabaseOptimizer();
      const result = optimizer.partitionRecommender({
        tableName: 'messages',
        rowCount: 5_000_000,
        sizeBytes: 5_000_000_000,
        avgRowSizeBytes: 1000,
        hasTimestampColumn: false,
        hasTenantColumn: false,
        readWriteRatio: 3,
        oldestRowAge: 365,
      });

      expect(result.strategy).toBe('HASH');
      expect(result.partitionKey).toBe('id');
    });
  });
});
