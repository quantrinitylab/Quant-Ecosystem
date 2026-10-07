import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// `PerformanceBudgetChecker` is a barrel export of `@quant/performance`, but it
// is imported here from its defining module (`slo-baselines`) on purpose: the
// package barrel (`@quant/performance`) re-exports ~20 modules, several of which
// rely on the engine package's own looser tsconfig (it sets
// `noUncheckedIndexedAccess: false`). Importing the barrel would drag those
// modules into server-core's strict type program and surface pre-existing
// engine-internal type violations that are out of scope for this wiring task
// (the engine is reused, not rewritten). Targeting the single module we need
// keeps the seam strict-clean while consuming the exact same class.
import { PerformanceBudgetChecker } from '@quant/performance/src/slo-baselines';

// Cross-cutting performance substrate (Category A). Wired ONCE in `createApp()`
// in the Stage 1 cross-cutting block, so every app inherits `fastify.performance`
// through `createApp()` without any per-app registration (Requirements 2.1, 2.2;
// design Property P6).
//
// Modeled on `observability.ts`: a pair of allocation-light request hooks
// (`onRequest` stamps a start time, `onResponse` measures elapsed wall-clock via
// the global `performance.now()`) plus a decorated singleton built once at boot.
// The engine (`@quant/performance`) provides `PerformanceBudgetChecker`, a
// per-route SLO budget evaluator (p50/p95/p99 latency, error-rate, throughput).
//
// The hook is intentionally **no-op-friendly**: when no budget is defined for a
// matched route (the default for every app) the onResponse path costs only a
// `Map` lookup + a counter increment and records nothing. A budget is opt-in via
// `fastify.performance.budgets.defineBudget(route, ...)`, at which point each
// request to that route is checked against the budget and a warning is logged
// when the budget is exceeded. No database access is required, so — like
// `observability.ts` — the plugin declares no upstream `dependencies`.

// Derive the engine's metric/result shapes from the checker's own signature so
// no extra type re-export from `@quant/performance` is needed (engine untouched).
type MeasuredMetrics = Parameters<PerformanceBudgetChecker['checkBudget']>[1];
type BudgetCheckResult = ReturnType<PerformanceBudgetChecker['checkBudget']>;

/** Shape decorated onto the instance as `fastify.performance`. */
export interface PerformanceService {
  /** Per-route SLO budget evaluator from `@quant/performance`. */
  readonly budgets: PerformanceBudgetChecker;
  /**
   * Record one request's latency. When a budget is defined for `route`, the
   * sample is checked against it (returning the result); otherwise this is a
   * cheap no-op returning `null`. Never throws — budget-check failures are
   * logged, not propagated, so the request lifecycle is unaffected.
   */
  record(route: string, durationMs: number, statusCode: number): BudgetCheckResult | null;
  /** Cheap counter of observed requests (no per-request allocation beyond a number). */
  readonly observed: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Shared performance timing/budget engine from `@quant/performance`. */
    performance: PerformanceService;
  }
}

/** Internal, allocation-light implementation of the decorated service. */
class PerformanceTracker implements PerformanceService {
  readonly budgets = new PerformanceBudgetChecker();
  #observed = 0;

  get observed(): number {
    return this.#observed;
  }

  record(route: string, durationMs: number, statusCode: number): BudgetCheckResult | null {
    this.#observed += 1;

    const budget = this.budgets.getBudget(route);
    if (!budget) {
      // No budget for this route → nothing to evaluate (the common case).
      return null;
    }

    // Single-request sample: treat the measured latency as every percentile and
    // derive error-rate from the status code. Throughput is reported as the
    // budget minimum so a single in-flight request never spuriously fails the
    // throughput gate — the hook flags latency/error regressions, not load.
    const measured: MeasuredMetrics = {
      p50Ms: durationMs,
      p95Ms: durationMs,
      p99Ms: durationMs,
      errorRate: statusCode >= 500 ? 1 : 0,
      throughput: budget.throughputMin,
    };

    try {
      return this.budgets.checkBudget(route, measured);
    } catch {
      // Defensive: never let budget evaluation disrupt the response lifecycle.
      return null;
    }
  }
}

const START_TIME_KEY = '__perfStartTime';

async function performancePlugin(fastify: FastifyInstance) {
  // Construct the engine once at boot (a decorated singleton), never per-request.
  const tracker = new PerformanceTracker();
  fastify.decorate('performance', tracker);

  // onRequest: stamp a monotonic start time. Mirrors observability.ts and keeps
  // the hot path allocation-light (one numeric property on the request).
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    (request as unknown as Record<string, number>)[START_TIME_KEY] = performance.now();
  });

  // onResponse: measure elapsed wall-clock and run the (opt-in) budget check.
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = (request as unknown as Record<string, number>)[START_TIME_KEY];
    if (startTime === undefined) return;

    const durationMs = performance.now() - startTime;
    const route = request.routeOptions?.url || '__unmatched__';

    const result = tracker.record(route, durationMs, reply.statusCode);
    if (result && !result.passed) {
      fastify.log.warn(
        { route, durationMs, summary: result.summary },
        'performance budget exceeded',
      );
    }
  });
}

export default fp(performancePlugin, {
  name: 'performance',
  fastify: '5.x',
});
