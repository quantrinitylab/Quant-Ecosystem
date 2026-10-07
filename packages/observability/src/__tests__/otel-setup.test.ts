import { describe, it, expect, beforeEach } from 'vitest';
import { OTelSetup } from '../otel-setup.js';

describe('OTelSetup', () => {
  let otel: OTelSetup;

  beforeEach(() => {
    otel = new OTelSetup({
      serviceName: 'test-service',
      environment: 'test',
      samplingRate: 1.0,
      enableMetrics: true,
      enableLogs: true,
    });
  });

  it('initializes tracer, metrics, and logger after setup()', () => {
    otel.setup();

    expect(otel.getTracer()).toBeDefined();
    expect(otel.getMetrics()).toBeDefined();
    expect(otel.getLogger()).toBeDefined();
  });

  it('throws if getTracer() is called before setup()', () => {
    expect(() => otel.getTracer()).toThrow();
  });

  it('Fastify instrumentation hook creates request spans', () => {
    otel.setup();

    const hooks: Record<string, (...args: unknown[]) => void> = {};
    const mockApp = {
      addHook: (name: string, handler: (...args: unknown[]) => void) => {
        hooks[name] = handler;
      },
    };

    otel.instrumentFastify(mockApp);

    // Simulate a request
    const mockRequest = { id: 'req-1', method: 'GET', url: '/api/test' };
    const mockReply = { statusCode: 200 };
    const done = () => {};

    hooks['onRequest']!(mockRequest, undefined, done);
    hooks['onResponse']!(mockRequest, mockReply, done);

    const tracer = otel.getTracer();
    const stats = tracer.getStats();
    expect(stats.totalSpans).toBe(1);
  });

  it('Prisma instrumentation hook creates query spans', async () => {
    otel.setup();

    let middleware:
      | ((params: { model?: string; action?: string; args?: unknown }, next: (params: unknown) => Promise<unknown>) => Promise<unknown>)
      | null = null;
    const mockClient = {
      $use: (mw: (params: { model?: string; action?: string; args?: unknown }, next: (params: unknown) => Promise<unknown>) => Promise<unknown>) => {
        middleware = mw;
      },
    };

    otel.instrumentPrisma(mockClient);
    expect(middleware).not.toBeNull();

    // Simulate a query
    const params = { model: 'User', action: 'findMany', args: {} };
    const next = async (_p: unknown) => [{ id: 1 }];
    await middleware!(params, next);

    const tracer = otel.getTracer();
    const stats = tracer.getStats();
    expect(stats.totalSpans).toBe(1);
  });

  it('shutdown() cleans up without error', () => {
    otel.setup();
    expect(() => otel.shutdown()).not.toThrow();
  });
});
