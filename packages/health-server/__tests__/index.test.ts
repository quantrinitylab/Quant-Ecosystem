import { describe, it, expect, afterEach } from 'vitest';
import { startHealthServer } from '../src/index';
import type { FastifyInstance } from 'fastify';

describe('health-server', () => {
  let server: FastifyInstance | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('starts and responds to /healthz with 200', async () => {
    server = await startHealthServer(0);
    const response = await server.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('responds to /readyz with 200 when no checks are provided', async () => {
    server = await startHealthServer(0);
    const response = await server.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ready' });
  });

  it('responds to /readyz with 200 when all checks pass', async () => {
    server = await startHealthServer(0, {
      db: async () => true,
      redis: async () => true,
    });
    const response = await server.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ready');
    expect(body.checks).toEqual({ db: true, redis: true });
  });

  it('responds to /readyz with 503 when a check fails', async () => {
    server = await startHealthServer(0, {
      db: async () => true,
      redis: async () => false,
    });
    const response = await server.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('not_ready');
    expect(body.checks).toEqual({ db: true, redis: false });
  });

  it('handles check that throws an error', async () => {
    server = await startHealthServer(0, {
      db: async () => {
        throw new Error('connection refused');
      },
    });
    const response = await server.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.checks).toEqual({ db: false });
  });
});
