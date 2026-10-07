import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface ObservabilityPluginOptions {
  serviceName?: string;
}

async function observabilityPlugin(fastify: FastifyInstance, opts: ObservabilityPluginOptions) {
  const serviceName = opts.serviceName || 'quant-service';
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    fastify.log.info('OpenTelemetry disabled (OTEL_EXPORTER_OTLP_ENDPOINT not set)');
    return;
  }

  // Dynamically import to avoid loading OTel when not needed
  try {
    const { initTracing, initMetrics, getMeter, createHttpMetrics, getActiveTraceContext } =
      await import('@quant/observability');

    const shutdownTracing = initTracing({ serviceName, endpoint });
    const shutdownMetrics = initMetrics({ serviceName, endpoint });
    const meter = getMeter(serviceName);
    const httpMetrics = createHttpMetrics(meter);

    // Add trace context to response headers
    fastify.addHook('onRequest', async (request: FastifyRequest) => {
      (request as unknown as Record<string, number>).__otelStartTime = performance.now();
    });

    fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = (request as unknown as Record<string, number>).__otelStartTime;
      if (startTime === undefined) return;

      const duration = (performance.now() - startTime) / 1000;
      const method = request.method;
      const route = request.routeOptions?.url || '__unmatched__';
      const statusCode = reply.statusCode.toString();

      httpMetrics.requestCount.add(1, { method, route, status: statusCode });
      httpMetrics.requestDuration.record(duration, { method, route });

      if (reply.statusCode >= 400) {
        httpMetrics.errorCount.add(1, { method, route, status: statusCode });
      }

      // Inject trace context in response headers
      const traceCtx = getActiveTraceContext();
      if (traceCtx) {
        reply.header('x-trace-id', traceCtx.traceId);
      }
    });

    // Graceful shutdown of OTel on close
    fastify.addHook('onClose', async () => {
      await shutdownTracing();
      await shutdownMetrics();
    });

    fastify.log.info(`OpenTelemetry initialized for ${serviceName} -> ${endpoint}`);
  } catch (err) {
    // Fail soft: a telemetry init/exporter error must NEVER crash the server
    // boot. Log and continue without OTel rather than taking the service down.
    fastify.log.warn({ err }, 'OpenTelemetry initialization failed; continuing without telemetry');
  }
}

export default fp(observabilityPlugin, {
  name: 'observability',
  fastify: '5.x',
});
