import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

export type HealthCheck = () => Promise<boolean>;

export interface HealthServerOptions {
  port: number;
  host?: string;
  checks?: Record<string, HealthCheck>;
}

/**
 * Start a minimal HTTP server that exposes /healthz and /readyz endpoints.
 * Designed for non-HTTP services (workers, consumers) that need health probes.
 */
export async function startHealthServer(
  port: number,
  checks?: Record<string, HealthCheck>,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.get('/healthz', async (_request, reply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  app.get('/readyz', async (_request, reply) => {
    if (!checks || Object.keys(checks).length === 0) {
      return reply.status(200).send({ status: 'ready' });
    }

    const entries = Object.entries(checks);
    const settled = await Promise.allSettled(entries.map(([, check]) => check()));

    const results: Record<string, boolean> = {};
    let allReady = true;

    for (let i = 0; i < entries.length; i++) {
      const name = entries[i]![0];
      const outcome = settled[i]!;
      if (outcome.status === 'fulfilled') {
        results[name] = outcome.value;
        if (!outcome.value) allReady = false;
      } else {
        results[name] = false;
        allReady = false;
      }
    }

    const status = allReady ? 200 : 503;
    return reply.status(status).send({ status: allReady ? 'ready' : 'not_ready', checks: results });
  });

  await app.listen({ port, host: '0.0.0.0' });
  return app;
}

export default startHealthServer;
