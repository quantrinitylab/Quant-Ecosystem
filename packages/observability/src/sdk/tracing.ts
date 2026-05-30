import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import type { Span as OTelSpan, Tracer } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;

export interface TracingConfig {
  serviceName: string;
  endpoint?: string;
}

/**
 * Initialize OpenTelemetry tracing.
 * Opt-in: only activates when OTEL_EXPORTER_OTLP_ENDPOINT env var is set.
 * Returns a shutdown function. Safe to call multiple times; subsequent calls
 * return the existing shutdown function without re-initializing.
 */
export function initTracing(config: TracingConfig): () => Promise<void> {
  // Guard: if already initialized, return existing shutdown without re-init
  if (sdk) {
    return async () => {
      if (sdk) {
        await sdk.shutdown();
        sdk = null;
      }
    };
  }

  const endpoint = config.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    // No-op when not configured
    return async () => {};
  }

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
    }),
    traceExporter,
  });

  sdk.start();

  return async () => {
    if (sdk) {
      await sdk.shutdown();
      sdk = null;
    }
  };
}

/**
 * Get a tracer instance for creating spans.
 */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

/**
 * Get current active span context (trace_id, span_id).
 */
export function getActiveTraceContext(): { traceId: string; spanId: string } | null {
  const span = trace.getActiveSpan();
  if (!span) return null;
  const ctx = span.spanContext();
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

export { trace, context, SpanStatusCode };
export type { OTelSpan, Tracer };
