import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import healthPlugin from '../plugins/health';

// Covers the health-contributor registry added for QuantChat Requirement
// 6.1/6.2: apps register a named dependency-health callback whose live status
// is folded into the overall /healthz status (ok < degraded < unavailable).
describe('health plugin — contributor aggregation', () => {
  it('reports overall degraded when a contributor is degraded', async () => {
    const app = Fastify();
    await app.register(healthPlugin, {});
    app.addHealthContributor('realtime-backplane', () => ({
      status: 'degraded',
      detail: 'single-node mode',
    }));

    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200); // still serving
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('degraded');
    expect(body.components['realtime-backplane']).toEqual({
      status: 'degraded',
      detail: 'single-node mode',
    });
  });

  it('flips back to ok when the contributor recovers', async () => {
    const app = Fastify();
    await app.register(healthPlugin, {});
    let healthy = false;
    app.addHealthContributor('realtime-backplane', () => (healthy ? 'ok' : 'degraded'));

    const degraded = JSON.parse((await app.inject({ method: 'GET', url: '/healthz' })).payload);
    expect(degraded.status).toBe('degraded');

    healthy = true;
    const recovered = JSON.parse((await app.inject({ method: 'GET', url: '/healthz' })).payload);
    expect(recovered.status).toBe('ok');
    expect(recovered.components['realtime-backplane'].status).toBe('ok');
  });

  it('unavailable takes precedence over degraded', async () => {
    const app = Fastify();
    await app.register(healthPlugin, {});
    app.addHealthContributor('a', () => 'degraded');
    app.addHealthContributor('b', () => 'unavailable');

    const body = JSON.parse((await app.inject({ method: 'GET', url: '/healthz' })).payload);
    expect(body.status).toBe('unavailable');
  });

  it('omits the components map and stays ok when no contributors are registered', async () => {
    const app = Fastify();
    await app.register(healthPlugin, {});

    const body = JSON.parse((await app.inject({ method: 'GET', url: '/healthz' })).payload);
    expect(body.status).toBe('ok');
    expect(body.components).toBeUndefined();
  });

  it('treats a throwing contributor as degraded rather than crashing the endpoint', async () => {
    const app = Fastify();
    await app.register(healthPlugin, {});
    app.addHealthContributor('boom', () => {
      throw new Error('contributor exploded');
    });

    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('degraded');
    expect(body.components.boom.status).toBe('degraded');
  });

  it('livez stays ok even when a contributor is degraded (liveness ignores deps)', async () => {
    const app = Fastify();
    await app.register(healthPlugin, {});
    app.addHealthContributor('realtime-backplane', () => 'degraded');

    const body = JSON.parse((await app.inject({ method: 'GET', url: '/livez' })).payload);
    expect(body.status).toBe('ok');
  });
});
