import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import gracefulShutdownPlugin from '../plugins/graceful-shutdown';

describe('graceful-shutdown plugin', () => {
  it('registers without error', async () => {
    const app = Fastify();
    await app.register(gracefulShutdownPlugin, {});
    await app.ready();
    expect(app).toBeDefined();
    await app.close();
  });

  it('accepts custom timeout option', async () => {
    const app = Fastify();
    await app.register(gracefulShutdownPlugin, { timeoutMs: 5000 });
    await app.ready();
    expect(app).toBeDefined();
    await app.close();
  });

  it('normal requests work before shutdown', async () => {
    const app = Fastify();
    await app.register(gracefulShutdownPlugin, { timeoutMs: 5000 });
    app.get('/test', async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ ok: true });

    await app.close();
  });
});
