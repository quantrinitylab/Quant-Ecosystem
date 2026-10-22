// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import { TypedQueue } from '@quant/queue';
import ciRoutes from '../modules/code/routes/ci';

/**
 * Regression for the #1466 gate red:
 * `EnvironmentTeardownError: Closing rpc while onUserConsoleLog was pending`
 * plus Redis reconnect refusals. Root cause: the ci routes plugin created a
 * real BullMQ TypedQueue at registration time with no onClose hook, so the
 * queue's Redis connection outlived app.close().
 *
 * Expected lifecycle: register -> request -> app.close() closes the
 * route-owned queue exactly once.
 */

function makePrisma() {
  return {
    repository: {
      findFirst: vi.fn(async () => ({
        id: 'repo-1',
        ownerId: 'owner-1',
        name: 'open-project',
        visibility: 'PUBLIC',
        deletedAt: null,
      })),
    },
    repositoryCollaborator: { findFirst: vi.fn(async () => null) },
    ciRun: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(),
    },
    ciJob: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
    },
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', makePrisma() as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: 'owner-1' };
  });
  await app.register(ciRoutes);
  await app.ready();
  return app;
}

describe('CI routes: route-owned queue lifecycle', () => {
  const apps: FastifyInstance[] = [];
  const closeSpy = vi.spyOn(TypedQueue.prototype, 'close');

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('closes the route-owned TypedQueue exactly once: register -> request -> app.close()', async () => {
    const app = await buildApp();
    apps.push(app);
    const before = closeSpy.mock.calls.length;

    // The route must be live before we close: proves the queue wiring works.
    const res = await app.inject({ method: 'GET', url: '/owner-1/open-project/ci/runs' });
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
