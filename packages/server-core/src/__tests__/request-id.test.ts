import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../app';
import type { AppConfig } from '../types';

const testConfig: AppConfig = {
  port: 3000,
  host: '0.0.0.0',
  logLevel: 'silent',
  corsOrigins: ['http://localhost:3000'],
  rateLimitMax: 100,
  rateLimitWindow: '1 minute',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('request-id plugin', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp(testConfig);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('response includes X-Request-ID header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('if request sends X-Request-ID, it is echoed back', async () => {
    const customId = 'my-custom-request-id-123';
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: {
        'x-request-id': customId,
      },
    });

    expect(response.headers['x-request-id']).toBe(customId);
  });

  it('generated request ID is a valid UUID format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    const requestId = response.headers['x-request-id'] as string;
    expect(requestId).toMatch(UUID_REGEX);
  });

  it('response includes X-Trace-ID header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(response.headers['x-trace-id']).toBeDefined();
    const traceId = response.headers['x-trace-id'] as string;
    expect(traceId).toMatch(UUID_REGEX);
  });

  it('if request sends X-Trace-ID, it is echoed back', async () => {
    const customTraceId = 'my-custom-trace-id-456';
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: {
        'x-trace-id': customTraceId,
      },
    });

    expect(response.headers['x-trace-id']).toBe(customTraceId);
  });

  it('rejects malicious X-Request-ID containing control characters and replaces with UUID', async () => {
    const maliciousId = 'evil\n{"injected":"json"}\r\x00';
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: {
        'x-request-id': maliciousId,
      },
    });

    const requestId = response.headers['x-request-id'] as string;
    // Should NOT echo back the malicious value
    expect(requestId).not.toBe(maliciousId);
    // Should be a valid UUID (fallback)
    expect(requestId).toMatch(UUID_REGEX);
  });

  it('rejects X-Request-ID exceeding 128 characters', async () => {
    const longId = 'a'.repeat(200);
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: {
        'x-request-id': longId,
      },
    });

    const requestId = response.headers['x-request-id'] as string;
    expect(requestId).not.toBe(longId);
    expect(requestId).toMatch(UUID_REGEX);
  });

  it('rejects malicious X-Trace-ID and replaces with UUID', async () => {
    const maliciousTraceId = 'trace\ninjection\tattack';
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: {
        'x-trace-id': maliciousTraceId,
      },
    });

    const traceId = response.headers['x-trace-id'] as string;
    expect(traceId).not.toBe(maliciousTraceId);
    expect(traceId).toMatch(UUID_REGEX);
  });
});
