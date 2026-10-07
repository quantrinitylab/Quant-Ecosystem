// ============================================================================
// Performance Package - SLO Baselines & Performance Budget Checker
// Per-route performance budgets with p50, p95, p99 latency targets
// ============================================================================

import { z } from 'zod';

/** Latency targets for a route */
export interface LatencyTargets {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

/** Performance budget for a route */
export interface PerformanceBudget {
  route: string;
  latency: LatencyTargets;
  errorRateBudget: number;
  throughputMin: number;
}

/** Measured metrics for a route */
export interface MeasuredMetrics {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  throughput: number;
}

/** Individual check result */
export interface BudgetCheckDetail {
  metric: string;
  target: number;
  actual: number;
  passed: boolean;
  deviation: number;
}

/** Overall budget check result */
export interface BudgetCheckResult {
  route: string;
  passed: boolean;
  timestamp: number;
  details: BudgetCheckDetail[];
  summary: string;
}

/** Zod schema for latency targets validation */
export const LatencyTargetsSchema = z.object({
  p50Ms: z.number().positive(),
  p95Ms: z.number().positive(),
  p99Ms: z.number().positive(),
});

/** Zod schema for performance budget validation */
export const PerformanceBudgetSchema = z.object({
  route: z.string().min(1),
  latency: LatencyTargetsSchema,
  errorRateBudget: z.number().min(0).max(1),
  throughputMin: z.number().min(0),
});

/**
 * PerformanceBudgetChecker validates measured metrics against
 * per-route performance budgets (SLO baselines).
 */
export class PerformanceBudgetChecker {
  private readonly budgets: Map<string, PerformanceBudget>;
  private readonly history: Map<string, BudgetCheckResult[]>;
  private readonly maxHistoryPerRoute: number;

  constructor(config: { maxHistoryPerRoute?: number } = {}) {
    this.budgets = new Map();
    this.history = new Map();
    this.maxHistoryPerRoute = config.maxHistoryPerRoute ?? 100;
  }

  /**
   * Define a performance budget for a route.
   */
  defineBudget(route: string, targets: Omit<PerformanceBudget, 'route'>): void {
    const budget: PerformanceBudget = { route, ...targets };
    PerformanceBudgetSchema.parse(budget);
    this.budgets.set(route, budget);
  }

  /**
   * Check measured metrics against the defined budget for a route.
   * Returns pass/fail with detailed breakdown.
   */
  checkBudget(route: string, measured: MeasuredMetrics): BudgetCheckResult {
    const budget = this.budgets.get(route);
    if (!budget) {
      throw new Error(`No budget defined for route: ${route}`);
    }

    const details: BudgetCheckDetail[] = [
      {
        metric: 'latency_p50',
        target: budget.latency.p50Ms,
        actual: measured.p50Ms,
        passed: measured.p50Ms <= budget.latency.p50Ms,
        deviation: (measured.p50Ms - budget.latency.p50Ms) / budget.latency.p50Ms,
      },
      {
        metric: 'latency_p95',
        target: budget.latency.p95Ms,
        actual: measured.p95Ms,
        passed: measured.p95Ms <= budget.latency.p95Ms,
        deviation: (measured.p95Ms - budget.latency.p95Ms) / budget.latency.p95Ms,
      },
      {
        metric: 'latency_p99',
        target: budget.latency.p99Ms,
        actual: measured.p99Ms,
        passed: measured.p99Ms <= budget.latency.p99Ms,
        deviation: (measured.p99Ms - budget.latency.p99Ms) / budget.latency.p99Ms,
      },
      {
        metric: 'error_rate',
        target: budget.errorRateBudget,
        actual: measured.errorRate,
        passed: measured.errorRate <= budget.errorRateBudget,
        deviation:
          budget.errorRateBudget > 0
            ? (measured.errorRate - budget.errorRateBudget) / budget.errorRateBudget
            : measured.errorRate > 0
              ? 1
              : 0,
      },
      {
        metric: 'throughput',
        target: budget.throughputMin,
        actual: measured.throughput,
        passed: measured.throughput >= budget.throughputMin,
        deviation:
          budget.throughputMin > 0
            ? (budget.throughputMin - measured.throughput) / budget.throughputMin
            : 0,
      },
    ];

    const passed = details.every((d) => d.passed);
    const failedMetrics = details.filter((d) => !d.passed).map((d) => d.metric);

    const summary = passed
      ? `All metrics within budget for ${route}`
      : `Budget exceeded for ${route}: ${failedMetrics.join(', ')}`;

    const result: BudgetCheckResult = {
      route,
      passed,
      timestamp: Date.now(),
      details,
      summary,
    };

    // Store in history
    if (!this.history.has(route)) {
      this.history.set(route, []);
    }
    const routeHistory = this.history.get(route)!;
    routeHistory.push(result);
    if (routeHistory.length > this.maxHistoryPerRoute) {
      routeHistory.shift();
    }

    return result;
  }

  /**
   * Get the budget definition for a route.
   */
  getBudget(route: string): PerformanceBudget | undefined {
    return this.budgets.get(route);
  }

  /**
   * Get all defined routes.
   */
  getRoutes(): string[] {
    return [...this.budgets.keys()];
  }

  /**
   * Get check history for a route.
   */
  getHistory(route: string, limit?: number): BudgetCheckResult[] {
    const routeHistory = this.history.get(route) ?? [];
    return limit ? routeHistory.slice(-limit) : routeHistory;
  }

  /**
   * Remove a budget definition.
   */
  removeBudget(route: string): boolean {
    return this.budgets.delete(route);
  }
}
