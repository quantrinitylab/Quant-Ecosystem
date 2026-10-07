import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

interface HealthPluginOptions {
  redisClient?: Redis;
}

/** Health status values, ordered by severity: ok < degraded < unavailable. */
export type HealthStatus = 'ok' | 'degraded' | 'unavailable';

/** A component health report contributed by an app (e.g. the realtime backplane). */
export interface HealthComponentResult {
  status: HealthStatus;
  detail?: string;
}

/**
 * A pluggable health contributor. Apps register one per dependency they want
 * reflected on `/healthz` (e.g. the realtime backplane). It is invoked at
 * request time so the reported status always reflects live state. Returning a
 * bare {@link HealthStatus} is shorthand for `{ status }`.
 */
export type HealthContributor = () => HealthStatus | HealthComponentResult;

interface HealthCheckResponse {
  status: HealthStatus;
  uptime: number;
  timestamp: string;
  version: string;
  components?: Record<string, HealthComponentResult>;
}

interface ReadinessCheckResponse {
  status: 'ok' | 'unavailable';
  checks: {
    database: 'ok' | 'fail' | 'n/a';
    redis: 'ok' | 'fail' | 'n/a';
  };
}

interface PrismaLike {
  $queryRawUnsafe: (query: string) => Promise<unknown>;
}

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Register a named health contributor whose live status is aggregated into
     * the `/healthz` response. If any contributor reports `degraded` the overall
     * status becomes `degraded`; `unavailable` takes precedence over `degraded`.
     * Used by apps to surface dependency health (e.g. the realtime backplane
     * starting in degraded single-node mode — QuantChat Requirement 6.1/6.2).
     */
    addHealthContributor(name: string, contributor: HealthContributor): void;
  }
}

const startTime = Date.now();

/** Normalize a contributor result into a {@link HealthComponentResult}. */
function normalizeResult(result: HealthStatus | HealthComponentResult): HealthComponentResult {
  return typeof result === 'string' ? { status: result } : result;
}

async function healthPlugin(fastify: FastifyInstance, opts: HealthPluginOptions) {
  // Registry of app-supplied health contributors. Stored in the plugin closure
  // and shared with child instances via the (fastify-plugin) root decorator, so
  // routes registered after createApp() (e.g. the websocket backplane wiring)
  // can register contributors that are evaluated on every /healthz request.
  const contributors = new Map<string, HealthContributor>();

  if (!fastify.hasDecorator('addHealthContributor')) {
    fastify.decorate('addHealthContributor', (name: string, contributor: HealthContributor) => {
      contributors.set(name, contributor);
    });
  }

  /** Evaluate every contributor and fold their statuses into an overall status. */
  function aggregate(): {
    status: HealthStatus;
    components: Record<string, HealthComponentResult>;
  } {
    const components: Record<string, HealthComponentResult> = {};
    let overall: HealthStatus = 'ok';
    for (const [name, contributor] of contributors) {
      let component: HealthComponentResult;
      try {
        component = normalizeResult(contributor());
      } catch {
        component = { status: 'degraded', detail: 'health contributor threw' };
      }
      components[name] = component;
      if (component.status === 'unavailable') {
        overall = 'unavailable';
      } else if (component.status === 'degraded' && overall !== 'unavailable') {
        overall = 'degraded';
      }
    }
    return { status: overall, components };
  }

  // Simple liveness alias — always 200 while the process is serving. This is the
  // endpoint k8s/Docker probes and the same-origin `/api/health` ingress target
  // hit: the nginx ingress strips `/api` and forwards to the Fastify backend
  // (`GET /api/health` → `GET /health`), so this route must exist. Note
  // `createApp()` already lists `/health` in its public paths — it just was
  // never registered here, which made the live endpoint 404.
  fastify.get('/health', async (_request, reply) => {
    const response: HealthCheckResponse = {
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      version: process.env['APP_VERSION'] || '1.0.0',
    };
    return reply.status(200).send(response);
  });

  fastify.get('/healthz', async (_request, reply) => {
    const { status, components } = aggregate();
    const response: HealthCheckResponse = {
      status,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      version: process.env['APP_VERSION'] || '1.0.0',
    };
    // Only surface the components map when contributors exist, keeping the
    // response shape unchanged for apps that register none.
    if (Object.keys(components).length > 0) {
      response.components = components;
    }
    // A degraded dependency (e.g. realtime backplane in single-node mode) is
    // still a live, serving process, so the endpoint stays HTTP 200.
    return reply.status(200).send(response);
  });

  fastify.get('/livez', async (_request, reply) => {
    // Liveness reflects only "is the process alive" and intentionally ignores
    // dependency degradation so an orchestrator does not restart a healthy pod
    // when, say, Redis is briefly unreachable.
    const response: HealthCheckResponse = {
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      version: process.env['APP_VERSION'] || '1.0.0',
    };
    return reply.status(200).send(response);
  });

  fastify.get('/readyz', async (_request, reply) => {
    const checks: ReadinessCheckResponse['checks'] = {
      database: 'n/a',
      redis: 'n/a',
    };

    const prisma = (fastify as unknown as { prisma?: PrismaLike }).prisma;
    if (prisma) {
      try {
        await prisma.$queryRawUnsafe('SELECT 1');
        checks.database = 'ok';
      } catch {
        checks.database = 'fail';
      }
    }

    if (opts.redisClient) {
      try {
        const pong = await opts.redisClient.ping();
        checks.redis = pong === 'PONG' ? 'ok' : 'fail';
      } catch {
        checks.redis = 'fail';
      }
    }

    const allOk = Object.values(checks).every((v) => v === 'ok' || v === 'n/a');
    const response: ReadinessCheckResponse = {
      status: allOk ? 'ok' : 'unavailable',
      checks,
    };

    return reply.status(allOk ? 200 : 503).send(response);
  });
}

export default fp(healthPlugin, {
  name: 'health',
});
