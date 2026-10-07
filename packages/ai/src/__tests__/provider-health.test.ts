import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ProviderHealthMonitor } from '../core/provider-health';

describe('ProviderHealthMonitor', () => {
  let monitor: ProviderHealthMonitor;
  let currentTime: number;

  beforeEach(() => {
    vi.useFakeTimers();
    currentTime = 1000000;
    monitor = new ProviderHealthMonitor(() => currentTime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('recordSuccess', () => {
    it('increments success count', () => {
      monitor.recordSuccess('openai', 100);
      const stats = monitor.getStats('openai');
      expect(stats.successCount).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it('records latency', () => {
      monitor.recordSuccess('openai', 150);
      monitor.recordSuccess('openai', 250);
      const stats = monitor.getStats('openai');
      expect(stats.latencies).toEqual([150, 250]);
    });
  });

  describe('recordError', () => {
    it('increments error count', () => {
      monitor.recordError('openai');
      const stats = monitor.getStats('openai');
      expect(stats.errorCount).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it('updates lastErrorAt', () => {
      monitor.recordError('openai');
      const stats = monitor.getStats('openai');
      expect(stats.lastErrorAt).toBe(currentTime);
    });
  });

  describe('isHealthy', () => {
    it('returns true when no data exists for a provider', () => {
      expect(monitor.isHealthy('openai')).toBe(true);
    });

    it('returns true when error rate is below 5%', () => {
      // 9 successes, 0 errors - but need at least 10 requests
      for (let i = 0; i < 9; i++) {
        monitor.recordSuccess('openai', 100);
      }
      expect(monitor.isHealthy('openai')).toBe(true);
    });

    it('returns true when total requests are below threshold', () => {
      // 5 errors but only 5 total requests (below 10 minimum)
      for (let i = 0; i < 5; i++) {
        monitor.recordError('openai');
      }
      expect(monitor.isHealthy('openai')).toBe(true);
    });

    it('returns false when error rate >= 5% with enough requests', () => {
      // 9 successes + 1 error = 10% error rate with 10 requests
      for (let i = 0; i < 9; i++) {
        monitor.recordSuccess('openai', 100);
      }
      monitor.recordError('openai');
      expect(monitor.isHealthy('openai')).toBe(false);
    });

    it('returns false when all requests are errors with enough requests', () => {
      for (let i = 0; i < 10; i++) {
        monitor.recordError('openai');
      }
      expect(monitor.isHealthy('openai')).toBe(false);
    });
  });

  describe('getP95Latency', () => {
    it('returns 0 when no latencies recorded', () => {
      expect(monitor.getP95Latency('openai')).toBe(0);
    });

    it('calculates p95 correctly with multiple latencies', () => {
      // Record 100 latencies from 1 to 100
      for (let i = 1; i <= 100; i++) {
        monitor.recordSuccess('openai', i);
      }
      const p95 = monitor.getP95Latency('openai');
      // p95 of [1..100] -> index ceil(100*0.95)-1 = 94, value = 95
      expect(p95).toBe(95);
    });

    it('returns the single value when only one latency', () => {
      monitor.recordSuccess('openai', 200);
      expect(monitor.getP95Latency('openai')).toBe(200);
    });
  });

  describe('circuit breaker behavior', () => {
    it('opens circuit when provider becomes unhealthy', () => {
      for (let i = 0; i < 10; i++) {
        monitor.recordError('openai');
      }
      monitor.isHealthy('openai'); // triggers circuit open check
      const stats = monitor.getStats('openai');
      expect(stats.circuitOpen).toBe(true);
      expect(stats.circuitOpenedAt).toBe(currentTime);
    });

    it('does not allow requests during circuit open period', () => {
      for (let i = 0; i < 10; i++) {
        monitor.recordError('openai');
      }
      monitor.isHealthy('openai'); // opens circuit

      // 30 seconds later - still within 60s window
      currentTime += 30_000;
      expect(monitor.isHealthy('openai')).toBe(false);
    });

    it('allows probe request after 60 seconds', () => {
      for (let i = 0; i < 10; i++) {
        monitor.recordError('openai');
      }
      monitor.isHealthy('openai'); // opens circuit

      // 60 seconds later - probe should be allowed
      currentTime += 60_000;
      expect(monitor.isHealthy('openai')).toBe(true); // probe allowed
    });

    it('closes circuit when probe succeeds', () => {
      for (let i = 0; i < 10; i++) {
        monitor.recordError('openai');
      }
      monitor.isHealthy('openai'); // opens circuit

      // 60 seconds later - trigger probe
      currentTime += 60_000;
      monitor.isHealthy('openai'); // sets probeInFlight

      // Probe succeeds
      monitor.recordSuccess('openai', 100);
      const stats = monitor.getStats('openai');
      expect(stats.circuitOpen).toBe(false);
      expect(stats.circuitOpenedAt).toBeNull();
    });

    it('extends circuit open time when probe fails', () => {
      for (let i = 0; i < 10; i++) {
        monitor.recordError('openai');
      }
      monitor.isHealthy('openai'); // opens circuit

      // 60 seconds later - trigger probe
      currentTime += 60_000;
      monitor.isHealthy('openai'); // sets probeInFlight

      // Probe fails
      monitor.recordError('openai');
      const stats = monitor.getStats('openai');
      expect(stats.circuitOpen).toBe(true);
      expect(stats.circuitOpenedAt).toBe(currentTime); // reset to now
    });
  });

  describe('getAllStats', () => {
    it('returns stats for all tracked providers', () => {
      monitor.recordSuccess('openai', 100);
      monitor.recordSuccess('anthropic', 200);
      const allStats = monitor.getAllStats();
      expect(allStats.length).toBe(2);
      const providers = allStats.map((s) => s.provider);
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
    });
  });

  describe('reset', () => {
    it('clears all tracking data', () => {
      monitor.recordSuccess('openai', 100);
      monitor.recordError('anthropic');
      monitor.reset();
      const allStats = monitor.getAllStats();
      expect(allStats.length).toBe(0);
    });
  });

  describe('sliding window', () => {
    it('resets window data when window expires', () => {
      monitor.recordSuccess('openai', 100);
      monitor.recordError('openai');

      // Advance time past the 5-minute window
      currentTime += 300_001;

      // Record new data
      monitor.recordSuccess('openai', 200);
      const stats = monitor.getStats('openai');
      expect(stats.successCount).toBe(1);
      expect(stats.errorCount).toBe(0);
    });
  });
});
