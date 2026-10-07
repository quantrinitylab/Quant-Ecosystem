import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface MetricsBucket {
  le: number;
  count: number;
}

interface RouteMetrics {
  count: Map<string, number>;
  duration: Map<string, MetricsBucket[]>;
  durationSum: Map<string, number>;
  durationCount: Map<string, number>;
}

const HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/** Maximum number of unique route keys before overflow bucketing kicks in. */
const MAX_ROUTE_CARDINALITY = 1000;

function createBuckets(): MetricsBucket[] {
  return HISTOGRAM_BUCKETS.map((le) => ({ le, count: 0 }));
}

async function metricsPlugin(fastify: FastifyInstance) {
  const metrics: RouteMetrics = {
    count: new Map(),
    duration: new Map(),
    durationSum: new Map(),
    durationCount: new Map(),
  };

  /** Set of known route keys for cardinality tracking. */
  const knownRoutes = new Set<string>();

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    (request as unknown as Record<string, number>).__startTime = performance.now();
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = (request as unknown as Record<string, number>).__startTime;
    if (startTime === undefined) return;

    // Exclude the /metrics endpoint itself from being recorded to avoid self-counting noise.
    const registeredRoute = request.routeOptions?.url;
    if (registeredRoute === '/metrics') return;

    const duration = (performance.now() - startTime) / 1000;
    const method = request.method;

    // Use the registered route pattern (e.g. /users/:id) to avoid unbounded cardinality
    // from path parameters. Fall back to a fixed label when no registered route exists
    // (404s, unmatched paths).
    let route = registeredRoute ?? '__unmatched__';

    // Cardinality cap: once we exceed MAX_ROUTE_CARDINALITY unique route keys,
    // bucket new routes under __overflow__ to prevent unbounded memory growth.
    const routeKey = `${method}|${route}`;
    if (!knownRoutes.has(routeKey)) {
      if (knownRoutes.size >= MAX_ROUTE_CARDINALITY) {
        route = '__overflow__';
      } else {
        knownRoutes.add(routeKey);
      }
    }

    const statusCode = reply.statusCode.toString();

    // Increment counter
    const countKey = `${method}|${route}|${statusCode}`;
    metrics.count.set(countKey, (metrics.count.get(countKey) ?? 0) + 1);

    // Record histogram
    const durationKey = `${method}|${route}`;
    if (!metrics.duration.has(durationKey)) {
      metrics.duration.set(durationKey, createBuckets());
      metrics.durationSum.set(durationKey, 0);
      metrics.durationCount.set(durationKey, 0);
    }

    const buckets = metrics.duration.get(durationKey)!;
    for (const bucket of buckets) {
      if (duration <= bucket.le) {
        bucket.count++;
      }
    }
    metrics.durationSum.set(durationKey, (metrics.durationSum.get(durationKey) ?? 0) + duration);
    metrics.durationCount.set(durationKey, (metrics.durationCount.get(durationKey) ?? 0) + 1);
  });

  // Security note: The /metrics endpoint is intentionally unauthenticated.
  // It is designed to be scraped by Prometheus within the Kubernetes cluster
  // and should not be exposed publicly. Access is restricted via k8s network
  // policies that limit ingress to the monitoring namespace only.
  fastify.get('/metrics', async (_request, reply) => {
    const lines: string[] = [];

    // http_requests_total counter
    lines.push('# HELP http_requests_total Total number of HTTP requests');
    lines.push('# TYPE http_requests_total counter');
    for (const [key, value] of metrics.count) {
      const [method, route, status_code] = key.split('|');
      lines.push(
        `http_requests_total{method="${method}",route="${route}",status_code="${status_code}"} ${value}`,
      );
    }

    // http_request_duration_seconds histogram
    lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds');
    lines.push('# TYPE http_request_duration_seconds histogram');
    for (const [key, buckets] of metrics.duration) {
      const [method, route] = key.split('|');
      for (const bucket of buckets) {
        lines.push(
          `http_request_duration_seconds_bucket{method="${method}",route="${route}",le="${bucket.le}"} ${bucket.count}`,
        );
      }
      lines.push(
        `http_request_duration_seconds_bucket{method="${method}",route="${route}",le="+Inf"} ${metrics.durationCount.get(key)}`,
      );
      lines.push(
        `http_request_duration_seconds_sum{method="${method}",route="${route}"} ${metrics.durationSum.get(key)}`,
      );
      lines.push(
        `http_request_duration_seconds_count{method="${method}",route="${route}"} ${metrics.durationCount.get(key)}`,
      );
    }

    lines.push('');
    return reply.type('text/plain; charset=utf-8').send(lines.join('\n'));
  });
}

export default fp(metricsPlugin, {
  name: 'metrics',
});
