import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DependencyRegistry } from '../dependency';

describe('DependencyRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const base = {
    kind: 'external' as const,
    degradedMode: 'reads fail; cached views served stale',
  };

  it('reports not_configured for unwired dependencies (never fake healthy)', async () => {
    const registry = new DependencyRegistry();
    registry.register({ ...base, name: 'kafka', configured: false });
    const report = await registry.check('kafka');
    expect(report.status).toBe('not_configured');
    expect(report.configured).toBe(false);
    expect(report.latencyMs).toBeNull();
    expect(report.circuitState).toBeNull();
    expect(report.errorRate).toBeNull();
  });

  it('reports unknown for configured dependencies with no live probe', async () => {
    const registry = new DependencyRegistry();
    registry.register({ ...base, name: 'object-storage', configured: true });
    const report = await registry.check('object-storage');
    expect(report.status).toBe('unknown');
    expect(report.configured).toBe(true);
    expect(report.circuitState).toBeNull();
  });

  it('reports ok with latency when the probe succeeds', async () => {
    const registry = new DependencyRegistry();
    registry.register({
      ...base,
      name: 'postgres',
      configured: true,
      probe: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { ok: true };
      },
    });
    const promise = registry.check('postgres');
    await vi.advanceTimersByTimeAsync(20);
    const report = await promise;
    expect(report.status).toBe('ok');
    expect(report.latencyMs).toBeGreaterThanOrEqual(0);
    expect(report.circuitState).toBe('closed');
    expect(report.lastError).toBeNull();
    expect(report.lastSuccessAt).not.toBeNull();
    expect(report.errorRate).toBe(0);
  });

  it('reports degraded when probe latency exceeds latencyDegradedMs', async () => {
    const registry = new DependencyRegistry();
    registry.register({
      ...base,
      name: 'slow-dep',
      configured: true,
      latencyDegradedMs: 50,
      probe: async () => {
        await new Promise((r) => setTimeout(r, 100));
        return { ok: true };
      },
    });
    const promise = registry.check('slow-dep');
    await vi.advanceTimersByTimeAsync(100);
    const report = await promise;
    expect(report.status).toBe('degraded');
  });

  it('reports unavailable with lastError when the probe fails', async () => {
    const registry = new DependencyRegistry();
    registry.register({
      ...base,
      name: 'redis',
      configured: true,
      probe: async () => { throw new Error('ECONNREFUSED'); },
    });
    const report = await registry.check('redis');
    expect(report.status).toBe('unavailable');
    expect(report.lastError).toContain('ECONNREFUSED');
    expect(report.errorRate).toBe(1);
    expect(report.timeoutRate).toBe(0);
  });

  it('counts probe timeouts separately in timeoutRate', async () => {
    const registry = new DependencyRegistry();
    registry.register({
      ...base,
      name: 'hanging-dep',
      configured: true,
      probeTimeoutMs: 100,
      breaker: { failureThreshold: 100 },
      probe: () => new Promise(() => {}), // never resolves
    });
    const promise = registry.check('hanging-dep');
    await vi.advanceTimersByTimeAsync(100);
    const report = await promise;
    expect(report.status).toBe('unavailable');
    expect(report.lastError).toContain('timed out');
    expect(report.timeoutRate).toBe(1);
    expect(report.errorRate).toBe(1);
  });

  it('opens the circuit after repeated probe failures and surfaces the state', async () => {
    const registry = new DependencyRegistry();
    registry.register({
      ...base,
      name: 'flaky',
      configured: true,
      breaker: { failureThreshold: 2, resetTimeoutMs: 60_000 },
      probe: async () => { throw new Error('down'); },
    });
    await registry.check('flaky');
    const report = await registry.check('flaky');
    expect(report.status).toBe('unavailable');
    expect(report.circuitState).toBe('open');
    expect(report.consecutiveFailures).toBe(2);

    // While open, the probe is skipped — still reported, honestly, as unavailable.
    const skipped = await registry.check('flaky');
    expect(skipped.status).toBe('unavailable');
    expect(skipped.circuitState).toBe('open');
    expect(skipped.lastError).toContain('circuit open');
  });

  it('checkAll probes every dependency and never throws', async () => {
    const registry = new DependencyRegistry();
    registry.register({ ...base, name: 'a', configured: false });
    registry.register({ ...base, name: 'b', configured: true });
    registry.register({
      ...base,
      name: 'c',
      configured: true,
      probe: async () => ({ ok: true }),
    });
    const all = await registry.checkAll();
    expect(Object.keys(all).sort()).toEqual(['a', 'b', 'c']);
    expect(all['a']!.status).toBe('not_configured');
    expect(all['b']!.status).toBe('unknown');
    expect(all['c']!.status).toBe('ok');
  });

  it('carries the declared degraded-mode behavior on every report', async () => {
    const registry = new DependencyRegistry();
    registry.register({
      ...base,
      name: 'kafka',
      configured: false,
      degradedMode: 'event relay disabled; Postgres outbox is the durable log',
    });
    const report = await registry.check('kafka');
    expect(report.degradedMode).toContain('Postgres outbox');
  });

  it('rejects duplicate registration and unknown dependency checks', async () => {
    const registry = new DependencyRegistry();
    registry.register({ ...base, name: 'x', configured: true });
    expect(() => registry.register({ ...base, name: 'x', configured: true })).toThrow(
      "dependency 'x' is already registered",
    );
    await expect(registry.check('nope')).rejects.toThrow("unknown dependency 'nope'");
  });
});
