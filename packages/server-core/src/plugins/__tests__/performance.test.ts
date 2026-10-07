import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { PerformanceBudgetChecker } from '@quant/performance/src/slo-baselines';

import performancePlugin from '../performance';
import { createApp } from '../../app';
import type { AppConfig } from '../../types';

const testConfig: AppConfig = {
  port: 3000,
  host: '0.0.0.0',
  logLevel: 'silent',
  corsOrigins: ['http://localhost:3000'],
  rateLimitMax: 1000,
  rateLimitWindow: '1 minute',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

/** Build a bare Fastify instance (no createApp → no @quant/database dependency). */
function bareApp(): FastifyInstance {
  return Fastify({ logger: false });
}

function spyHooks(app: FastifyInstance) {
  return vi.spyOn(app, 'addHook');
}

function hookNames(spy: ReturnType<typeof spyHooks>): string[] {
  return spy.mock.calls.map((c) => c[0] as string);
}

// ---------------------------------------------------------------------------
// Unit tests (Requirements 2.1, 2.2): the plugin decorates the instance with a
// usable budget/timing service and registers its request-timing hooks.
// ---------------------------------------------------------------------------
describe('performance plugin (decoration + timing hooks)', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('decorates the instance with a usable PerformanceBudgetChecker-backed service', async () => {
    app = bareApp();
    await app.register(performancePlugin);
    await app.ready();

    expect(app.hasDecorator('performance')).toBe(true);
    expect(app.performance.budgets).toBeInstanceOf(PerformanceBudgetChecker);
    expect(app.performance.observed).toBe(0);
    // usable: a budget can be defined and read back through the decorated engine
    app.performance.budgets.defineBudget('/widgets', {
      latency: { p50Ms: 50, p95Ms: 100, p99Ms: 200 },
      errorRateBudget: 0.01,
      throughputMin: 0,
    });
    expect(app.performance.budgets.getRoutes()).toContain('/widgets');
  });

  it('registers onRequest + onResponse timing hooks', async () => {
    app = bareApp();
    const spy = spyHooks(app);
    await app.register(performancePlugin);
    await app.ready();

    const names = hookNames(spy);
    expect(names).toContain('onRequest');
    expect(names).toContain('onResponse');
  });

  it('lets a request flow through and counts it without error (no budget → no-op)', async () => {
    app = bareApp();
    await app.register(performancePlugin);
    app.get('/ping', async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/ping' });
    expect(res.statusCode).toBe(200);
    // onResponse ran: the request was observed, but with no budget nothing failed
    expect(app.performance.observed).toBe(1);
  });

  it('runs the budget-check logic on the request path when a budget is defined', async () => {
    app = bareApp();
    await app.register(performancePlugin);
    await app.ready();

    // Define a budget for the route, then drive the recorded timing path directly
    // (the same code the onResponse hook calls) to assert the engine evaluates it.
    app.performance.budgets.defineBudget('/slow', {
      latency: { p50Ms: 10, p95Ms: 20, p99Ms: 30 },
      errorRateBudget: 0.5,
      throughputMin: 0,
    });

    // within budget → passes
    const ok = app.performance.record('/slow', 5, 200);
    expect(ok).not.toBeNull();
    expect(ok?.passed).toBe(true);

    // exceeds the latency budget → fails (logic runs, returns a result, no throw)
    const bad = app.performance.record('/slow', 500, 200);
    expect(bad).not.toBeNull();
    expect(bad?.passed).toBe(false);
    expect(bad?.summary).toContain('/slow');
  });
});

// ---------------------------------------------------------------------------
// Inheritance test (design Property P6): an app that only calls `createApp()`
// exposes `fastify.performance` WITHOUT any local registration of the plugin.
// ---------------------------------------------------------------------------
describe('performance inheritance via createApp() (Property P6)', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('exposes a usable `fastify.performance` with no per-app registration', async () => {
    app = await createApp(testConfig);
    await app.ready();

    expect(app.hasDecorator('performance')).toBe(true);
    expect(app.performance.budgets).toBeInstanceOf(PerformanceBudgetChecker);

    // a public (unauthenticated) request flows through the inherited hooks
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(app.performance.observed).toBeGreaterThanOrEqual(1);
  });
});
