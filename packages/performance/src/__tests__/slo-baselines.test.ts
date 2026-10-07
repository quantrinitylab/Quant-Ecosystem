import { describe, it, expect } from 'vitest';
import { PerformanceBudgetChecker } from '../slo-baselines.js';

describe('PerformanceBudgetChecker', () => {
  it('defines a budget for a route', () => {
    const checker = new PerformanceBudgetChecker();
    checker.defineBudget('/api/users', {
      latency: { p50Ms: 50, p95Ms: 150, p99Ms: 300 },
      errorRateBudget: 0.01,
      throughputMin: 100,
    });

    const budget = checker.getBudget('/api/users');
    expect(budget).toBeDefined();
    expect(budget!.route).toBe('/api/users');
    expect(budget!.latency.p50Ms).toBe(50);
    expect(budget!.latency.p95Ms).toBe(150);
    expect(budget!.latency.p99Ms).toBe(300);
    expect(budget!.errorRateBudget).toBe(0.01);
  });

  it('returns all defined routes', () => {
    const checker = new PerformanceBudgetChecker();
    checker.defineBudget('/api/users', {
      latency: { p50Ms: 50, p95Ms: 150, p99Ms: 300 },
      errorRateBudget: 0.01,
      throughputMin: 100,
    });
    checker.defineBudget('/api/posts', {
      latency: { p50Ms: 30, p95Ms: 100, p99Ms: 200 },
      errorRateBudget: 0.005,
      throughputMin: 500,
    });

    const routes = checker.getRoutes();
    expect(routes).toHaveLength(2);
    expect(routes).toContain('/api/users');
    expect(routes).toContain('/api/posts');
  });

  it('passes when all metrics are within budget', () => {
    const checker = new PerformanceBudgetChecker();
    checker.defineBudget('/api/users', {
      latency: { p50Ms: 50, p95Ms: 150, p99Ms: 300 },
      errorRateBudget: 0.01,
      throughputMin: 100,
    });

    const result = checker.checkBudget('/api/users', {
      p50Ms: 40,
      p95Ms: 120,
      p99Ms: 250,
      errorRate: 0.005,
      throughput: 150,
    });

    expect(result.passed).toBe(true);
    expect(result.details).toHaveLength(5);
    expect(result.details.every((d) => d.passed)).toBe(true);
  });

  it('fails when latency exceeds budget', () => {
    const checker = new PerformanceBudgetChecker();
    checker.defineBudget('/api/users', {
      latency: { p50Ms: 50, p95Ms: 150, p99Ms: 300 },
      errorRateBudget: 0.01,
      throughputMin: 100,
    });

    const result = checker.checkBudget('/api/users', {
      p50Ms: 60,
      p95Ms: 200,
      p99Ms: 400,
      errorRate: 0.005,
      throughput: 150,
    });

    expect(result.passed).toBe(false);
    const failedMetrics = result.details.filter((d) => !d.passed);
    expect(failedMetrics.length).toBeGreaterThan(0);
    expect(result.summary).toContain('Budget exceeded');
  });

  it('fails when error rate exceeds budget', () => {
    const checker = new PerformanceBudgetChecker();
    checker.defineBudget('/api/users', {
      latency: { p50Ms: 50, p95Ms: 150, p99Ms: 300 },
      errorRateBudget: 0.01,
      throughputMin: 100,
    });

    const result = checker.checkBudget('/api/users', {
      p50Ms: 30,
      p95Ms: 100,
      p99Ms: 200,
      errorRate: 0.05,
      throughput: 150,
    });

    expect(result.passed).toBe(false);
    const errorDetail = result.details.find((d) => d.metric === 'error_rate');
    expect(errorDetail!.passed).toBe(false);
  });

  it('fails when throughput is below minimum', () => {
    const checker = new PerformanceBudgetChecker();
    checker.defineBudget('/api/users', {
      latency: { p50Ms: 50, p95Ms: 150, p99Ms: 300 },
      errorRateBudget: 0.01,
      throughputMin: 100,
    });

    const result = checker.checkBudget('/api/users', {
      p50Ms: 30,
      p95Ms: 100,
      p99Ms: 200,
      errorRate: 0.005,
      throughput: 50,
    });

    expect(result.passed).toBe(false);
    const throughputDetail = result.details.find((d) => d.metric === 'throughput');
    expect(throughputDetail!.passed).toBe(false);
  });

  it('throws when checking undefined route', () => {
    const checker = new PerformanceBudgetChecker();
    expect(() =>
      checker.checkBudget('/undefined', {
        p50Ms: 30,
        p95Ms: 100,
        p99Ms: 200,
        errorRate: 0.005,
        throughput: 50,
      }),
    ).toThrow('No budget defined for route: /undefined');
  });

  it('stores check history', () => {
    const checker = new PerformanceBudgetChecker();
    checker.defineBudget('/api/users', {
      latency: { p50Ms: 50, p95Ms: 150, p99Ms: 300 },
      errorRateBudget: 0.01,
      throughputMin: 100,
    });

    checker.checkBudget('/api/users', {
      p50Ms: 30,
      p95Ms: 100,
      p99Ms: 200,
      errorRate: 0.005,
      throughput: 150,
    });
    checker.checkBudget('/api/users', {
      p50Ms: 60,
      p95Ms: 200,
      p99Ms: 400,
      errorRate: 0.05,
      throughput: 50,
    });

    const history = checker.getHistory('/api/users');
    expect(history).toHaveLength(2);
    expect(history[0].passed).toBe(true);
    expect(history[1].passed).toBe(false);
  });

  it('validates budget with zod schema', () => {
    const checker = new PerformanceBudgetChecker();
    expect(() =>
      checker.defineBudget('', {
        latency: { p50Ms: 50, p95Ms: 150, p99Ms: 300 },
        errorRateBudget: 0.01,
        throughputMin: 100,
      }),
    ).toThrow();
  });

  it('removes a budget', () => {
    const checker = new PerformanceBudgetChecker();
    checker.defineBudget('/api/users', {
      latency: { p50Ms: 50, p95Ms: 150, p99Ms: 300 },
      errorRateBudget: 0.01,
      throughputMin: 100,
    });

    expect(checker.removeBudget('/api/users')).toBe(true);
    expect(checker.getBudget('/api/users')).toBeUndefined();
  });
});
