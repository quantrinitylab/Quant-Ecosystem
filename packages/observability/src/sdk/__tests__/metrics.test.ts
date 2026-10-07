import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initMetrics, getMeter, createHttpMetrics } from '../metrics';

describe('initMetrics', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns no-op shutdown when OTEL_EXPORTER_OTLP_ENDPOINT is not set', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const shutdown = initMetrics({ serviceName: 'test-service' });
    expect(shutdown).toBeInstanceOf(Function);
    await expect(shutdown()).resolves.toBeUndefined();
  });

  it('getMeter returns a meter instance', () => {
    const meter = getMeter('test');
    expect(meter).toBeDefined();
  });

  it('createHttpMetrics returns counter and histogram instruments', () => {
    const meter = getMeter('test-http');
    const httpMetrics = createHttpMetrics(meter);
    expect(httpMetrics.requestCount).toBeDefined();
    expect(httpMetrics.requestDuration).toBeDefined();
    expect(httpMetrics.errorCount).toBeDefined();
  });
});
