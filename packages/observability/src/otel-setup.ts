// ============================================================================
// OTel Setup - OpenTelemetry SDK Initialization
// ============================================================================

import { DistributedTracer } from './core/distributed-tracer';
import { MetricsCollector } from './core/metrics-collector';
import { StructuredLogger } from './core/structured-logger';
import { OTelConfig, Span } from './types';

export class OTelSetup {
  private config: OTelConfig;
  private tracer: DistributedTracer | null = null;
  private metrics: MetricsCollector | null = null;
  private logger: StructuredLogger | null = null;
  private initialized: boolean = false;

  constructor(config: OTelConfig) {
    this.config = config;
  }

  /**
   * Initialize tracing, metrics, and logging subsystems.
   */
  setup(): void {
    if (this.initialized) return;

    this.tracer = new DistributedTracer({
      headSamplingRate: this.config.samplingRate ?? 1.0,
    });

    if (this.config.enableMetrics !== false) {
      this.metrics = new MetricsCollector();
    }

    if (this.config.enableLogs !== false) {
      this.logger = new StructuredLogger({
        serviceName: this.config.serviceName,
        minLevel: 'info',
      });
    }

    this.initialized = true;
  }

  /**
   * Get the configured tracer instance.
   */
  getTracer(): DistributedTracer {
    if (!this.tracer) {
      throw new Error('OTelSetup not initialized. Call setup() first.');
    }
    return this.tracer;
  }

  /**
   * Get the configured metrics collector instance.
   */
  getMetrics(): MetricsCollector {
    if (!this.metrics) {
      throw new Error(
        'MetricsCollector not initialized. Ensure enableMetrics is not false and call setup() first.',
      );
    }
    return this.metrics;
  }

  /**
   * Get the configured logger instance.
   */
  getLogger(): StructuredLogger {
    if (!this.logger) {
      throw new Error(
        'StructuredLogger not initialized. Ensure enableLogs is not false and call setup() first.',
      );
    }
    return this.logger;
  }

  /**
   * Instrument a Fastify app with request/response tracing hooks.
   */
  instrumentFastify(app: {
    addHook: (hook: string, handler: (...args: unknown[]) => void) => void;
  }): void {
    const tracer = this.getTracer();
    const metrics = this.metrics;

    const spanMap = new Map<string, Span>();
    const spanTimers = new Map<string, ReturnType<typeof setTimeout>>();

    // TTL-based cleanup: if onResponse never fires (dropped connection, timeout),
    // remove the span entry after 60 seconds to prevent memory leaks.
    const SPAN_TTL_MS = 60_000;

    app.addHook('onRequest', (...args: unknown[]) => {
      const request = args[0] as { id?: string; method?: string; url?: string } | undefined;
      const done = args[2] as (() => void) | undefined;

      const requestId = request?.id ?? `req_${Date.now()}`;
      const span = tracer.startSpan(
        `${request?.method ?? 'HTTP'} ${request?.url ?? '/'}`,
        'server',
        undefined,
        {
          'http.method': request?.method ?? 'unknown',
          'http.url': request?.url ?? '/',
          'http.request_id': requestId,
        },
      );
      if (span) {
        spanMap.set(requestId, span);

        // Set a TTL timer to clean up the span if onResponse never fires
        const timer = setTimeout(() => {
          if (spanMap.has(requestId)) {
            tracer.endSpan(span.id, { code: 'error', message: 'Span TTL expired (no response)' });
            spanMap.delete(requestId);
            spanTimers.delete(requestId);
          }
        }, SPAN_TTL_MS);

        // Unref the timer so it does not prevent process exit
        if (typeof timer === 'object' && 'unref' in timer) {
          timer.unref();
        }

        spanTimers.set(requestId, timer);
      }
      if (metrics) {
        metrics.incrementCounter('http_requests_total', 1, {
          method: request?.method ?? 'unknown',
        });
      }
      if (done) done();
    });

    app.addHook('onResponse', (...args: unknown[]) => {
      const request = args[0] as { id?: string } | undefined;
      const reply = args[1] as { statusCode?: number } | undefined;
      const done = args[2] as (() => void) | undefined;

      const requestId = request?.id ?? '';
      const span = spanMap.get(requestId);
      if (span) {
        // Clear the TTL timer since we received a response
        const timer = spanTimers.get(requestId);
        if (timer) {
          clearTimeout(timer);
          spanTimers.delete(requestId);
        }

        const statusCode = reply?.statusCode ?? 200;
        tracer.setSpanAttributes(span.id, {
          'http.status_code': statusCode,
        });
        const statusCodeType = statusCode >= 400 ? 'error' : 'ok';
        tracer.endSpan(span.id, {
          code: statusCodeType as 'ok' | 'error',
          message: statusCode >= 400 ? `HTTP ${statusCode}` : undefined,
        });
        spanMap.delete(requestId);
      }
      if (done) done();
    });
  }

  /**
   * Instrument a Prisma client with query tracing middleware.
   */
  instrumentPrisma(client: {
    $use: (
      middleware: (
        params: { model?: string; action?: string; args?: unknown },
        next: (params: unknown) => Promise<unknown>,
      ) => Promise<unknown>,
    ) => void;
  }): void {
    const tracer = this.getTracer();
    const metrics = this.metrics;

    client.$use(
      async (
        params: { model?: string; action?: string; args?: unknown },
        next: (params: unknown) => Promise<unknown>,
      ) => {
        const model = params.model ?? 'unknown';
        const action = params.action ?? 'unknown';
        const spanName = `prisma.${model}.${action}`;

        const span = tracer.startSpan(spanName, 'client', undefined, {
          'db.system': 'prisma',
          'db.operation': action,
          'db.model': model,
        });

        const startTime = Date.now();

        try {
          const result = await next(params);
          const duration = Date.now() - startTime;

          if (span) {
            tracer.setSpanAttributes(span.id, { 'db.duration_ms': duration });
            tracer.endSpan(span.id, { code: 'ok' });
          }

          if (metrics) {
            metrics.observeHistogram('prisma_query_duration_seconds', duration / 1000, {
              model,
              action,
            });
          }

          return result;
        } catch (error: unknown) {
          if (span) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            tracer.setSpanAttributes(span.id, { 'error.message': errorMessage });
            tracer.endSpan(span.id, { code: 'error', message: errorMessage });
          }
          throw error;
        }
      },
    );
  }

  /**
   * Shutdown and cleanup all subsystems.
   */
  shutdown(): void {
    if (this.tracer) {
      this.tracer.reset();
    }
    if (this.metrics) {
      this.metrics.reset();
    }
    if (this.logger) {
      this.logger.clear();
    }
    this.initialized = false;
  }
}
