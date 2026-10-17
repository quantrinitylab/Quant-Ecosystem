// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import pullRequestRoutes from '../modules/code/routes/pull-requests';

const PRIVATE_REPO = {
  id: 'repo-private',
  ownerId: 'owner-1',
  name: 'secret-project',
  visibility: 'PRIVATE' as const,
  deletedAt: null as Date | null,
};

const PUBLIC_REPO = {
  id: 'repo-public',
  ownerId: 'owner-1',
  name: 'open-project',
  visibility: 'PUBLIC' as const,
  deletedAt: null as Date | null,
};

const PRIVATE_PR = {
  id: 'pr-1',
  repoId: 'repo-private',
  number: 1,
  title: 'Secret PR title',
  status: 'OPEN' as const,
};

type PrismaStub = {
  repository: { findFirst: ReturnType<typeof vi.fn> };
  repositoryCollaborator: { findFirst: ReturnType<typeof vi.fn> };
  pullRequest: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function makePrisma(): PrismaStub {
  return {
    repository: { findFirst: vi.fn() },
    repositoryCollaborator: { findFirst: vi.fn(async () => null) },
    pullRequest: {
      count: vi.fn(async () => 0),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ ...PRIVATE_PR, ...args.data })),
      findMany: vi.fn(async () => [PRIVATE_PR]),
      findUnique: vi.fn(async () => ({ ...PRIVATE_PR })),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => ({ ...PRIVATE_PR, ...args.data })),
    },
  };
}

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function buildApp(userId: string | undefined, prisma: PrismaStub) {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  if (userId) {
    app.addHook('onRequest', async (request) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId };
    });
  }
  await app.register(pullRequestRoutes);
  await app.ready();
  apps.push(app);
  return app;
}

function privateRepoNoGrant(prisma: PrismaStub) {
  prisma.repository.findFirst.mockResolvedValueOnce({ ...PRIVATE_REPO });
  prisma.repositoryCollaborator.findFirst.mockResolvedValueOnce(null);
}

function privateRepoOwner(prisma: PrismaStub) {
  prisma.repository.findFirst.mockResolvedValueOnce({ ...PRIVATE_REPO });
}

function privateRepoCollaborator(prisma: PrismaStub) {
  prisma.repository.findFirst.mockResolvedValueOnce({ ...PRIVATE_REPO });
  prisma.repositoryCollaborator.findFirst.mockResolvedValueOnce({ role: 'READ' });
}

describe('Pull request routes: private-repository visibility gate', () => {
  it('rejects anonymous requests with 401 UNAUTHORIZED', async () => {
    const prisma = makePrisma();
    const app = await buildApp(undefined, prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/pulls',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 (not 200, not 403) for a non-owner listing PRs on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/pulls',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    // The PR listing must never be reached for a private repo the caller
    // cannot read: no PR data should leak.
    expect(prisma.pullRequest.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-owner creating a PR on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/owner-1/secret-project/pulls',
      payload: { title: 'Trying to open PR', sourceBranch: 'feat', targetBranch: 'main' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    expect(prisma.pullRequest.create).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-owner reading a PR on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/pulls/1',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    expect(prisma.pullRequest.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-owner reading the PR diff on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/pulls/1/diff',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    expect(prisma.pullRequest.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-owner on every PR mutation endpoint of a private repo', async () => {
    const prisma = makePrisma();
    const app = await buildApp('user-2', prisma);

    const mutating: Array<{ method: 'POST'; url: string; payload?: Record<string, unknown> }> = [
      { method: 'POST', url: '/owner-1/secret-project/pulls/1/merge', payload: { strategy: 'MERGE' } },
      { method: 'POST', url: '/owner-1/secret-project/pulls/1/close' },
      { method: 'POST', url: '/owner-1/secret-project/pulls/1/ai-review' },
    ];

    for (const call of mutating) {
      privateRepoNoGrant(prisma);
      const res = await app.inject({ method: call.method, url: call.url, payload: call.payload });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    }
    // Merge-eligibility evaluation leaks branch protection / CI details: gate it too.
    privateRepoNoGrant(prisma);
    const eligibility = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/pulls/1/merge-eligibility',
    });
    expect(eligibility.statusCode).toBe(404);
    expect(eligibility.json().error.code).toBe('REPO_NOT_FOUND');

    expect(prisma.pullRequest.update).not.toHaveBeenCalled();
  });

  it('lets the owner list, read and create PRs on a private repo', async () => {
    const prisma = makePrisma();
    const app = await buildApp('owner-1', prisma);

    privateRepoOwner(prisma);
    const list = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/pulls',
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual([PRIVATE_PR]);

    privateRepoOwner(prisma);
    const detail = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/pulls/1',
    });
    expect(detail.statusCode).toBe(200);

    privateRepoOwner(prisma);
    const created = await app.inject({
      method: 'POST',
      url: '/owner-1/secret-project/pulls',
      payload: { title: 'New PR', sourceBranch: 'feat', targetBranch: 'main' },
    });
    expect(created.statusCode).toBe(200);
    expect(prisma.pullRequest.create).toHaveBeenCalled();
  });

  it('lets a collaborator list PRs on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoCollaborator(prisma);
    const app = await buildApp('user-3', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/pulls',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([PRIVATE_PR]);
  });

  it('lets any authenticated user list PRs on a public repo', async () => {
    const prisma = makePrisma();
    prisma.repository.findFirst.mockResolvedValueOnce({ ...PUBLIC_REPO });
    prisma.pullRequest.findMany.mockResolvedValueOnce([]);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/open-project/pulls',
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 REPO_NOT_FOUND for a repo path that does not exist', async () => {
    const prisma = makePrisma();
    prisma.repository.findFirst.mockResolvedValueOnce(null);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/no-such-repo/pulls',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
  });
});
