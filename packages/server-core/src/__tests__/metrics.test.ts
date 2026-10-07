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

describe('metrics plugin', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp(testConfig);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /metrics returns 200 with text/plain content-type', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
  });

  it('metrics output includes http_requests_total and http_request_duration_seconds after requests', async () => {
    // Make a few requests first
    await app.inject({ method: 'GET', url: '/healthz' });
    await app.inject({ method: 'GET', url: '/healthz' });

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    const body = response.body;
    expect(body).toContain('http_requests_total');
    expect(body).toContain('http_request_duration_seconds');
    expect(body).toContain('# HELP http_requests_total');
    expect(body).toContain('# TYPE http_requests_total counter');
    expect(body).toContain('# HELP http_request_duration_seconds');
    expect(body).toContain('# TYPE http_request_duration_seconds histogram');
  });
});
