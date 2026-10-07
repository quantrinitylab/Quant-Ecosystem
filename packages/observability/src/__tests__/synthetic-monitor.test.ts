import { describe, it, expect } from 'vitest';
import { SyntheticMonitor } from '../synthetic-monitor.js';

describe('SyntheticMonitor', () => {
  it('addProbe registers a probe', () => {
    const monitor = new SyntheticMonitor();
    monitor.addProbe('health-check', {
      url: 'http://localhost:3000/health',
      interval: 30000,
      timeout: 5000,
      expectedStatus: 200,
    });

    const names = monitor.getProbeNames();
    expect(names).toContain('health-check');
  });

  it('runProbe executes and returns result with latency', async () => {
    const monitor = new SyntheticMonitor();
    monitor.addProbe('api-check', {
      url: 'http://localhost:3000/api',
      interval: 10000,
      timeout: 5000,
      expectedStatus: 200,
    });

    const result = await monitor.runProbe('api-check');

    expect(result.success).toBe(true);
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(result.statusCode).toBe(200);
    expect(result.name).toBe('api-check');
  });

  it('defineJourney creates multi-step journey', () => {
    const monitor = new SyntheticMonitor();
    monitor.defineJourney('login-flow', [
      { name: 'load-page', execute: async () => true },
      { name: 'enter-credentials', execute: async () => true },
      { name: 'submit-form', execute: async () => true },
    ]);

    const names = monitor.getJourneyNames();
    expect(names).toContain('login-flow');
  });

  it('journey reports pass/fail per step with latency', async () => {
    const monitor = new SyntheticMonitor();
    monitor.defineJourney('checkout-flow', [
      { name: 'add-to-cart', execute: async () => true },
      { name: 'enter-address', execute: async () => true },
      { name: 'payment-fails', execute: async () => false },
    ]);

    const result = await monitor.runJourney('checkout-flow');

    expect(result.name).toBe('checkout-flow');
    expect(result.success).toBe(false);
    expect(result.steps.length).toBeGreaterThanOrEqual(2);
    expect(result.totalLatency).toBeGreaterThanOrEqual(0);

    // First two steps pass
    expect(result.steps[0]!.success).toBe(true);
    expect(result.steps[0]!.latency).toBeGreaterThanOrEqual(0);
    expect(result.steps[1]!.success).toBe(true);

    // Third step fails
    expect(result.steps[2]!.success).toBe(false);
  });
});
