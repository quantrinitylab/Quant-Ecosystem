/**
 * SLO tracking plugin (K12 — reliability).
 *
 * Records real HTTP request observations against the configured SLO journeys
 * (route pattern → SLO mapping), evaluates burn rates in-process via
 * {@link SloTracker}, and hooks burn-rate alerts into the existing
 * metrics/logging pipeline:
 *
 * - logging: every alert is emitted as a structured pino log
 *   (`event: 'slo.burn_rate_alert'`) through the app logger;
 * - metrics: `slo_burn_rate_alerts_total{slo_id,severity}` counters are exposed
 *   on the existing `/metrics` endpoint (the metrics plugin appends
 *   `fastify.sloPrometheusLines()` when the decorator exists).
 *
 * Availability "errors" are 5xx responses (and handler throws); 4xx are client
 * errors and do not burn the availability budget — standard SRE practice.
 */
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  SloTracker,
  type BurnRateAlert,
  type SloDefinition,
  type SloEvaluation,
} from '../resilience/slos';

export interface SloRouteMapping {
  /** HTTP method, e.g. 'GET'. */
  method: string;
  /**
   * Route pattern matched against the request path, e.g. '/emails' or
   * '/threads/:id'. A leading '/api' on the request path is ignored because
   * the ingress strips it before forwarding.
   */
  pattern: string;
  /** SLO id from the `slos` definitions list. */
  sloId: string;
}

export interface SloPluginOptions {
  slos: SloDefinition[];
  routes?: SloRouteMapping[];
  fastBurnThreshold?: number;
  slowBurnThreshold?: number;
  /** Extra alert sinks beyond the default log + metrics hooks. */
  onAlert?: Array<(alert: BurnRateAlert) => void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** In-process SLO tracker fed by the onResponse hook. */
    sloTracker: SloTracker;
    /** Prometheus exposition lines for SLO alert counters. */
    sloPrometheusLines(): string[];
    /** Latest evaluations for every configured SLO (used by /health/detailed). */
    sloEvaluations(): SloEvaluation[];
  }
}

/** Paths that must never feed SLO observations (probes, not user journeys). */
const EXCLUDED_PREFIXES = [
  '/metrics',
  '/health',
  '/healthz',
  '/livez',
  '/readyz',
  '/api/health',
];

function normalizePath(rawUrl: string): string {
  let path = rawUrl.split('?')[0] ?? '/';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  // The ingress strips a leading /api before forwarding, so the backend sees
  // both '/emails' and '/api/emails' forms depending on the caller.
  if (path === '/api' || path.startsWith('/api/')) path = path.slice(4) || '/';
  return path;
}

function patternMatches(pattern: string, path: string): boolean {
  const patternSegments = pattern.split('/').filter(Boolean);
  const pathSegments = path.split('/').filter(Boolean);
  if (patternSegments.length !== pathSegments.length) return false;
  return patternSegments.every(
    (seg, i) => seg.startsWith(':') || seg === pathSegments[i],
  );
}

async function sloPlugin(fastify: FastifyInstance, opts: SloPluginOptions) {
  const tracker = new SloTracker(opts.slos, {
    fastBurnThreshold: opts.fastBurnThreshold,
    slowBurnThreshold: opts.slowBurnThreshold,
  });

  const alertCounts = new Map<string, number>();
  const countKey = (alert: BurnRateAlert) => `${alert.sloId}|${alert.severity}`;

  const pipelineHandler = (alert: BurnRateAlert) => {
    // Logging pipeline: structured pino log through the app logger.
    fastify.log.warn(
      {
        event: 'slo.burn_rate_alert',
        sloId: alert.sloId,
        journey: alert.journey,
        severity: alert.severity,
        burnRate: Number(alert.burnRate.toFixed(2)),
        availabilityBurnRate: Number(alert.availabilityBurnRate.toFixed(2)),
        latencyBurnRate: Number(alert.latencyBurnRate.toFixed(2)),
        budgetConsumedPct: Number(alert.budgetConsumedPct.toFixed(2)),
        windowHours: alert.windowHours,
      },
      `SLO burn-rate alert (${alert.severity}): ${alert.journey} burning at ${alert.burnRate.toFixed(1)}x`,
    );
    // Metrics pipeline: counter scraped from /metrics.
    alertCounts.set(countKey(alert), (alertCounts.get(countKey(alert)) ?? 0) + 1);
  };

  tracker.onAlert(pipelineHandler);
  for (const extra of opts.onAlert ?? []) tracker.onAlert(extra);

  const routes = opts.routes ?? [];
  for (const mapping of routes) {
    if (!tracker.sloIds().includes(mapping.sloId)) {
      throw new Error(
        `sloPlugin route mapping '${mapping.method} ${mapping.pattern}' references unknown SLO '${mapping.sloId}'`,
      );
    }
  }

  fastify.decorate('sloTracker', tracker);
  fastify.decorate('sloEvaluations', () => tracker.evaluateAll());
  fastify.decorate('sloPrometheusLines', () => {
    const lines = [
      '# HELP slo_burn_rate_alerts_total Total number of SLO burn-rate alerts fired',
      '# TYPE slo_burn_rate_alerts_total counter',
    ];
    const seen = new Set<string>();
    for (const sloId of tracker.sloIds()) {
      for (const severity of ['fast', 'slow'] as const) {
        const key = `${sloId}|${severity}`;
        seen.add(key);
        lines.push(
          `slo_burn_rate_alerts_total{slo_id="${sloId}",severity="${severity}"} ${alertCounts.get(key) ?? 0}`,
        );
      }
    }
    return lines;
  });

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    (request as unknown as Record<string, number>).__sloStartTime = performance.now();
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = (request as unknown as Record<string, number>).__sloStartTime;
    if (startTime === undefined) return;

    const path = normalizePath(request.raw.url ?? '/');
    if (EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) return;

    const mapping = routes.find(
      (m) => m.method === request.method && patternMatches(m.pattern, path),
    );
    if (!mapping) return;

    const latencyMs = performance.now() - startTime;
    try {
      tracker.record(mapping.sloId, {
        ok: reply.statusCode < 500,
        latencyMs,
      });
    } catch {
      // Recording must never break responses.
    }
  });
}

export default fp(sloPlugin, {
  name: 'slo',
});

export { SloTracker };
export type { SloDefinition, SloEvaluation, BurnRateAlert };
