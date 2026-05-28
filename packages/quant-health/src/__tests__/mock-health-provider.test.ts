import { MockHealthProvider } from '../providers/health-provider.js';
import { MetricType } from '../types.js';

describe('MockHealthProvider', () => {
  let provider: MockHealthProvider;

  beforeEach(() => {
    provider = new MockHealthProvider();
  });

  it('should connect successfully', async () => {
    const result = await provider.connect();
    expect(result).toBe(true);
  });

  it('should disconnect without error', async () => {
    await provider.connect();
    await expect(provider.disconnect()).resolves.toBeUndefined();
  });

  it('should return null for getLatestMetric when not connected', async () => {
    const metric = await provider.getLatestMetric(MetricType.heartRate);
    expect(metric).toBeNull();
  });

  it('should return a metric for getLatestMetric when connected', async () => {
    await provider.connect();
    const metric = await provider.getLatestMetric(MetricType.heartRate);
    expect(metric).not.toBeNull();
    expect(metric!.type).toBe(MetricType.heartRate);
    expect(metric!.unit).toBe('bpm');
  });

  it('should return metrics from syncMetrics for a valid range', async () => {
    const from = Date.now() - 86400000 * 3;
    const to = Date.now();
    const metrics = await provider.syncMetrics(from, to);
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics[0]!.source).toBe('google_fit');
  });

  it('should return empty array from syncMetrics when from >= to', async () => {
    const now = Date.now();
    const metrics = await provider.syncMetrics(now, now);
    expect(metrics).toHaveLength(0);
  });

  it('should complete full connect/sync/disconnect lifecycle', async () => {
    await provider.connect();
    const from = Date.now() - 86400000;
    const to = Date.now();
    const metrics = await provider.syncMetrics(from, to);
    expect(metrics.length).toBeGreaterThan(0);
    await provider.disconnect();
    const latest = await provider.getLatestMetric(MetricType.steps);
    expect(latest).toBeNull();
  });
});
