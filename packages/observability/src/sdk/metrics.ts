import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { metrics } from '@opentelemetry/api';
import type { Counter, Histogram, Meter } from '@opentelemetry/api';

let meterProvider: MeterProvider | null = null;

export interface MetricsConfig {
  serviceName: string;
  endpoint?: string;
  exportIntervalMs?: number;
}

/**
 * Initialize OpenTelemetry metrics.
 * Opt-in: only activates when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * Safe to call multiple times; subsequent calls return the existing shutdown
 * function without re-initializing.
 */
export function initMetrics(config: MetricsConfig): () => Promise<void> {
  // Guard: if already initialized, return existing shutdown without re-init
  if (meterProvider) {
    return async () => {
      if (meterProvider) {
        await meterProvider.shutdown();
        meterProvider = null;
      }
    };
  }

  const endpoint = config.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    return async () => {};
  }

  const metricExporter = new OTLPMetricExporter({
    url: `${endpoint}/v1/metrics`,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: config.exportIntervalMs || 30000,
  });

  meterProvider = new MeterProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: config.serviceName,
    }),
    readers: [metricReader],
  });

  metrics.setGlobalMeterProvider(meterProvider);

  return async () => {
    if (meterProvider) {
      await meterProvider.shutdown();
      meterProvider = null;
    }
  };
}

/**
 * Get a meter for creating instruments.
 */
export function getMeter(name: string): Meter {
  return metrics.getMeter(name);
}

/**
 * Pre-built HTTP metrics for common use.
 */
export function createHttpMetrics(meter: Meter) {
  return {
    requestCount: meter.createCounter('http_request_count', {
      description: 'Total number of HTTP requests',
    }),
    requestDuration: meter.createHistogram('http_request_duration_seconds', {
      description: 'HTTP request duration in seconds',
    }),
    errorCount: meter.createCounter('http_error_total', {
      description: 'Total number of HTTP errors',
    }),
  };
}

export type { Counter, Histogram, Meter };
