// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TypedQueue } from '@quant/queue';
import aiServicesRoutes from '../routes/ai-services';

/**
 * Regression for the gate-red teardown class (same as the ci-routes queue
 * fix, #1489): aiServicesRoutes creates a real BullMQ TypedQueue at
 * registration time ('undo-send'). Without an onClose hook, the queue's
 * Redis connection outlives app.close() and trips EnvironmentTeardownError
 * ('Closing rpc while onUserConsoleLog was pending') during test teardown.
 *
 * Expected lifecycle: register -> app.close() closes the route-owned queue
 * exactly once.
 */

describe('AI services routes: route-owned queue lifecycle', () => {
  const apps: FastifyInstance[] = [];
  const closeSpy = vi.spyOn(TypedQueue.prototype, 'close');

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('closes the route-owned undo-send TypedQueue exactly once: register -> app.close()', async () => {
    const app = Fastify();
    apps.push(app);
    await app.register(aiServicesRoutes);
    await app.ready();
    const before = closeSpy.mock.calls.length;

    await app.close();
    apps.splice(apps.indexOf(app), 1);

    expect(closeSpy.mock.calls.length - before).toBe(1);
  });

  it('stays closed exactly once across repeated app.close() calls', async () => {
    const before = closeSpy.mock.calls.length;
    const app = Fastify();
    await app.register(aiServicesRoutes);
    await app.ready();

    await app.close();
    await app.close();

    expect(closeSpy.mock.calls.length - before).toBe(1);
  });
});
