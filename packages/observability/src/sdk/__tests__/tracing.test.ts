import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTracing, getActiveTraceContext } from '../tracing';

describe('initTracing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns no-op shutdown when OTEL_EXPORTER_OTLP_ENDPOINT is not set', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const shutdown = initTracing({ serviceName: 'test-service' });
    expect(shutdown).toBeInstanceOf(Function);
    await expect(shutdown()).resolves.toBeUndefined();
  });

  it('returns shutdown function when endpoint is configured', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
    const shutdown = initTracing({ serviceName: 'test-service' });
    expect(shutdown).toBeInstanceOf(Function);
    await shutdown();
  });

  it('getActiveTraceContext returns null when no active span', () => {
    const ctx = getActiveTraceContext();
    expect(ctx).toBeNull();
  });
});
