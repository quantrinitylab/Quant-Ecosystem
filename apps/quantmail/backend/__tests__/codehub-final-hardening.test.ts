// @vitest-environment node

import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import gitRoutes from '../modules/code/routes/git';

async function buildRouteApp(userId: string) {
  const repository = {
    id: 'repo-1',
    ownerId: 'owner-1',
    name: 'project',
    description: null,
    visibility: 'PUBLIC',
    defaultBranch: 'main',
    storagePathUrl: '/tmp/project.git',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const prisma = {
    repository: {
      findFirst: vi.fn(async () => repository),
      findUnique: vi.fn(async () => repository),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...repository,
        ...data,
      })),
    },
  };
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(gitRoutes);
  await app.ready();
  return { app, prisma };
}

const apps: Array<Awaited<ReturnType<typeof buildRouteApp>>['app']> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('CodeHub final release hardening', () => {
  it('renames a soft-deleted repository to release its active unique name', async () => {
    const { app, prisma } = await buildRouteApp('owner-1');
    apps.push(app);

    const response = await app.inject({
      method: 'DELETE',
      url: '/repos/owner-1/project',
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.repository.update).toHaveBeenCalledWith({
      where: { id: 'repo-1' },
      data: {
        deletedAt: expect.any(Date),
        name: expect.stringMatching(/^project-deleted-\d+$/),
      },
    });
  });

  it('does not let a read-only public-repository caller reach pushRefs', async () => {
    const { app } = await buildRouteApp('reader-1');
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/repos/owner-1/project/push',
      payload: {
        refs: [
          {
            ref: 'refs/heads/main',
            newSha: 'a'.repeat(40),
          },
        ],
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('WRITE_SCOPE_REQUIRED');
  });
});
