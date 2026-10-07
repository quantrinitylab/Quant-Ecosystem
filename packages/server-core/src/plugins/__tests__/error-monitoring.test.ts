import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { ErrorCapture } from '@quant/error-monitoring';
import type { ErrorEvent, ErrorTransport } from '@quant/error-monitoring';

import errorMonitoringPlugin from '../error-monitoring';
import errorHandlerPlugin from '../error-handler';
import requestIdPlugin from '../request-id';
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

/** A fake sink (ErrorTransport) that records every forwarded event. */
class FakeSink implements ErrorTransport {
  readonly name = 'fake-sink';
  readonly received: ErrorEvent[] = [];
  async send(event: ErrorEvent): Promise<boolean> {
    this.received.push(event);
    return true;
  }
  async flush(): Promise<void> {
    /* immediate send → nothing to flush */
  }
}

/**
 * Build a minimal Fastify instance carrying the same error flow as `createApp()`
 * — error-handler (owns the envelope) + request-id (correlation) + the
 * error-monitoring seam — without pulling in `@quant/database`. A throwing route
 * lets us assert the envelope/status AND the captured, correlated error.
 */
async function seamApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(requestIdPlugin);
  await app.register(errorMonitoringPlugin);
  app.get('/boom', async () => {
    throw new Error('kaboom');
  });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Unit tests (Requirement 8.1): the plugin decorates the instance with a usable
// ErrorCapture-backed service and registers its onError + onClose hooks.
// ---------------------------------------------------------------------------
describe('error-monitoring plugin (decoration + hooks)', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('decorates the instance with a usable ErrorCapture-backed service', async () => {
    app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    await app.register(requestIdPlugin);
    await app.register(errorMonitoringPlugin);
    await app.ready();

    expect(app.hasDecorator('errorMonitoring')).toBe(true);
    expect(app.errorMonitoring.capture).toBeInstanceOf(ErrorCapture);
    // usable: capturing tags the event with the supplied request id
    const event = app.errorMonitoring.captureRequestError(new Error('x'), {
      requestId: 'rid-123',
    });
    expect(event?.message).toBe('x');
    expect(event?.context.tags?.['request_id']).toBe('rid-123');
  });

  it('registers onError + onClose hooks', async () => {
    app = Fastify({ logger: false });
    const spy = vi.spyOn(app, 'addHook');
    await app.register(errorHandlerPlugin);
    await app.register(requestIdPlugin);
    await app.register(errorMonitoringPlugin);
    await app.ready();

    const names = spy.mock.calls.map((c) => c[0] as string);
    expect(names).toContain('onError');
    expect(names).toContain('onClose');
  });
});

// ---------------------------------------------------------------------------
// Seam test (Requirements 2.1, 8.5, request-id propagation): a route that throws
// still returns the unchanged error envelope/status AND error-monitoring
// captured/forwarded the error correlated by x-request-id (asserted via a fake
// sink + a spy on the capture pipeline).
// ---------------------------------------------------------------------------
describe('error-monitoring seam (capture + x-request-id correlation)', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('captures the error correlated by an inbound x-request-id; envelope/status unchanged', async () => {
    app = await seamApp();

    const sink = new FakeSink();
    app.errorMonitoring.capture.addTransport(sink);
    const captureSpy = vi.spyOn(app.errorMonitoring, 'captureRequestError');

    const res = await app.inject({
      method: 'GET',
      url: '/boom',
      headers: { 'x-request-id': 'corr-abc-001' },
    });

    // error-handler's envelope + status are intact (unknown error → 500 INTERNAL_ERROR)
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INTERNAL_ERROR', statusCode: 500 },
    });
    // correlation id echoed on the response by request-id.ts
    expect(res.headers['x-request-id']).toBe('corr-abc-001');

    // the seam fired: the original error was captured, tagged with the request id
    expect(captureSpy).toHaveBeenCalledTimes(1);
    const captured = captureSpy.mock.results[0]?.value as ErrorEvent | null;
    expect(captured?.message).toBe('kaboom');
    expect(captured?.context.tags?.['request_id']).toBe('corr-abc-001');

    // and it was FORWARDED to the sink with the correlation tag preserved
    await app.errorMonitoring.flush();
    expect(sink.received).toHaveLength(1);
    expect(sink.received[0]?.message).toBe('kaboom');
    expect(sink.received[0]?.context.tags?.['request_id']).toBe('corr-abc-001');
  });

  it('correlates with a generated request id when the client sends none', async () => {
    app = await seamApp();
    const captureSpy = vi.spyOn(app.errorMonitoring, 'captureRequestError');

    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(500);
    const generatedId = res.headers['x-request-id'];
    expect(typeof generatedId).toBe('string');
    expect(generatedId).toBeTruthy();

    const captured = captureSpy.mock.results[0]?.value as ErrorEvent | null;
    // the captured event carries a non-empty correlation tag (the generated id)
    expect(captured?.context.tags?.['request_id']).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Inheritance test (design Property P6): an app that only calls `createApp()`
// exposes `fastify.errorMonitoring` WITHOUT any local registration, and the
// seam still produces the standard envelope for engine errors.
// ---------------------------------------------------------------------------
describe('error-monitoring inheritance via createApp() (Property P6)', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('exposes a usable `fastify.errorMonitoring` with no per-app registration', async () => {
    app = await createApp(testConfig);
    await app.ready();

    expect(app.hasDecorator('errorMonitoring')).toBe(true);
    expect(app.errorMonitoring.capture).toBeInstanceOf(ErrorCapture);
  });
});
