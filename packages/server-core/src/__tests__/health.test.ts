import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import healthPlugin from '../plugins/health';

describe('health plugin', () => {
  it('/healthz returns structured health response', async () => {
    const app = Fastify();
    await app.register(healthPlugin, {});

    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('version');
  });

  it('/livez returns same as healthz', async () => {
    const app = Fastify();
    await app.register(healthPlugin, {});

    const res = await app.inject({ method: 'GET', url: '/livez' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('timestamp');
  });

  it('/readyz returns checks structure', async () => {
    const app = Fastify();
    await app.register(healthPlugin, {});

    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('checks');
    expect(body.checks).toHaveProperty('database');
    expect(body.checks).toHaveProperty('redis');
  });

  it('/readyz returns ok when all checks are n/a', async () => {
    const app = Fastify();
    await app.register(healthPlugin, {});

    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.checks.database).toBe('n/a');
    expect(body.checks.redis).toBe('n/a');
  });
});
