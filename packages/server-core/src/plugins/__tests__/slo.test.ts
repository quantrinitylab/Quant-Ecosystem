import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import sloPlugin from '../slo';
import metricsPlugin from '../metrics';

const SLOS = [
  {
    id: 'mail.inbox-read',
    journey: 'Inbox read',
    availabilityTarget: 0.999,
    latencyTargetMs: 800,
  },
];

const ROUTES = [{ method: 'GET', pattern: '/emails', sloId: 'mail.inbox-read' }];

describe('slo plugin', () => {
  it('records request observations against the mapped SLO journey', async () => {
    const app = Fastify({ logger: false });
    await app.register(sloPlugin, { slos: SLOS, routes: ROUTES });
    app.get('/emails', async () => ({ ok: true }));

    await app.inject({ method: 'GET', url: '/emails' });
    await app.inject({ method: 'GET', url: '/emails' });

    const evals = app.sloEvaluations();
    expect(evals).toHaveLength(1);
    expect(evals[0]!.observations).toBe(2);
    expect(evals[0]!.status).toBe('healthy');
    await app.close();
  });

  it('treats 5xx as availability failures but not 4xx', async () => {
    const app = Fastify({ logger: false });
    await app.register(sloPlugin, {
      slos: SLOS,
      routes: [
        { method: 'GET', pattern: '/emails', sloId: 'mail.inbox-read' },
        { method: 'GET', pattern: '/boom', sloId: 'mail.inbox-read' },
      ],
    });
    app.get('/emails', async (_req, reply) => reply.status(404).send({}));
    app.get('/boom', async (_req, reply) => reply.status(500).send({ error: true }));

    await app.inject({ method: 'GET', url: '/emails' });
    await app.inject({ method: 'GET', url: '/boom' });

    const eval_ = app.sloTracker.evaluate('mail.inbox-read');
    expect(eval_.observations).toBe(2);
    // Only the 500 burns the availability budget; the 404 is a client error.
    expect(eval_.availability.errorRate).toBe(0.5);
    await app.close();
  });

  it('ignores /api prefix and matches :param segments', async () => {
    const app = Fastify({ logger: false });
    await app.register(sloPlugin, {
      slos: SLOS,
      routes: [{ method: 'GET', pattern: '/threads/:id', sloId: 'mail.inbox-read' }],
    });
    app.get('/threads/:id', async () => ({ ok: true }));

    await app.inject({ method: 'GET', url: '/api/threads/123' });
    const eval_ = app.sloTracker.evaluate('mail.inbox-read');
    expect(eval_.observations).toBe(1);
    await app.close();
  });

  it('does not record health/metrics probes as journey traffic', async () => {
    const app = Fastify({ logger: false });
    await app.register(sloPlugin, { slos: SLOS, routes: ROUTES });
    await app.inject({ method: 'GET', url: '/metrics' });
    await app.inject({ method: 'GET', url: '/health' });
    expect(app.sloTracker.evaluate('mail.inbox-read').status).toBe('no_data');
    await app.close();
  });

  it('exposes slo_burn_rate_alerts_total on /metrics and logs alerts', async () => {
    const app = Fastify({ logger: false });
    const logged: unknown[] = [];
    const origWarn = app.log.warn.bind(app.log);
    (app.log as unknown as { warn: (...a: unknown[]) => void }).warn = (...a: unknown[]) => {
      logged.push(a[0]);
      return origWarn(...(a as [unknown]));
    };
    await app.register(metricsPlugin);
    await app.register(sloPlugin, {
      slos: SLOS,
      routes: ROUTES,
      fastBurnThreshold: 1.5,
      slowBurnThreshold: 1,
    });
    app.get('/emails', async (_req, reply) => reply.status(500).send({}));

    await app.inject({ method: 'GET', url: '/emails' });

    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.payload).toContain('slo_burn_rate_alerts_total');
    expect(metrics.payload).toMatch(
      /slo_burn_rate_alerts_total\{slo_id="mail\.inbox-read",severity="fast"\} 1/,
    );
    expect(logged.some((e) => (e as { event?: string }).event === 'slo.burn_rate_alert')).toBe(true);
    await app.close();
  });

  it('rejects route mappings that reference unknown SLOs', async () => {
    const app = Fastify({ logger: false });
    await expect(
      app.register(sloPlugin, {
        slos: SLOS,
        routes: [{ method: 'GET', pattern: '/x', sloId: 'nope' }],
      }),
    ).rejects.toThrow("references unknown SLO 'nope'");
    await app.close();
  });
});
