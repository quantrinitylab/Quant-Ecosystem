// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import { TypedQueue } from '@quant/queue';
import aiServicesRoutes from '../routes/ai-services';

/**
 * Regression for the undo-send queue lifecycle finding (fix/qm-ai-undo-send-onclose):
 * `aiServicesRoutes` created a real BullMQ TypedQueue ('undo-send') at
 * registration time with no onClose hook, so the queue's Redis connection
 * outlived app.close() — the same orphaned-connection class as the ci-runs
 * queue before the fix/qm-ci-queue-lifecycle-4 onClose fix.
 *
 * Expected lifecycle: register -> request -> app.close() closes the
 * route-owned queue exactly once.
 *
 * The liveness request uses GET /infra/aliases (in-memory service, no Redis
 * touch) rather than POST /infra/undo-send, so the test never needs a live
 * Redis server: it proves the plugin is live, then proves close() runs.
 */

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-1' };
  });
  await app.register(aiServicesRoutes);
  await app.ready();
  return app;
}

describe('AI services routes: route-owned undo-send queue lifecycle', () => {
  const apps: FastifyInstance[] = [];
  const closeSpy = vi.spyOn(TypedQueue.prototype, 'close');

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('closes the route-owned undo-send TypedQueue exactly once: register -> request -> app.close()', async () => {
    const app = await buildApp();
    apps.push(app);
    const before = closeSpy.mock.calls.length;

    // The route must be live before we close: proves the plugin wiring works.
    const res = await app.inject({ method: 'GET', url: '/infra/aliases' });
    expect(res.statusCode).toBe(200);

    await app.close();
    apps.splice(apps.indexOf(app), 1);

    expect(closeSpy.mock.calls.length - before).toBe(1);
  });

  it('stays closed exactly once across repeated app.close() calls', async () => {
    const before = closeSpy.mock.calls.length;
    const app = await buildApp();

    await app.close();
    await app.close();

    expect(closeSpy.mock.calls.length - before).toBe(1);
  });
});
