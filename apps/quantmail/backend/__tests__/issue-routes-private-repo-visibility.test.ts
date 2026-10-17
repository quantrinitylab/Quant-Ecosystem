// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import issueRoutes from '../modules/code/routes/issues';

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

const PRIVATE_ISSUE = {
  id: 'issue-1',
  repoId: 'repo-private',
  number: 1,
  title: 'Secret issue title',
  body: 'Secret issue body',
  status: 'OPEN' as const,
};

type PrismaStub = {
  repository: { findFirst: ReturnType<typeof vi.fn> };
  repositoryCollaborator: { findFirst: ReturnType<typeof vi.fn> };
  issue: {
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
    issue: {
      count: vi.fn(async () => 0),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ ...PRIVATE_ISSUE, ...args.data })),
      findMany: vi.fn(async () => [PRIVATE_ISSUE]),
      findUnique: vi.fn(async () => ({ ...PRIVATE_ISSUE })),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => ({ ...PRIVATE_ISSUE, ...args.data })),
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
  await app.register(issueRoutes);
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

describe('Issue routes: private-repository visibility gate', () => {
  it('rejects anonymous requests with 401 UNAUTHORIZED', async () => {
    const prisma = makePrisma();
    const app = await buildApp(undefined, prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/issues',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 (not 200, not 403) for a non-owner listing issues on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/issues',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    // The issue listing must never be reached for a private repo the caller
    // cannot read: no issue data should leak.
    expect(prisma.issue.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-owner creating an issue on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/owner-1/secret-project/issues',
      payload: { title: 'Trying to post' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    expect(prisma.issue.create).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-owner reading an issue on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/issues/1',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    expect(prisma.issue.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-owner updating an issue on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'PATCH',
      url: '/owner-1/secret-project/issues/1',
      payload: { title: 'Tampered title' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    expect(prisma.issue.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-owner on every issue mutation endpoint of a private repo', async () => {
    const prisma = makePrisma();
    const app = await buildApp('user-2', prisma);

    const mutating: Array<{ method: 'POST'; url: string; payload?: Record<string, unknown> }> = [
      { method: 'POST', url: '/owner-1/secret-project/issues/1/labels', payload: { labels: ['bug'] } },
      { method: 'POST', url: '/owner-1/secret-project/issues/1/assignees', payload: { assignees: ['user-3'] } },
      { method: 'POST', url: '/owner-1/secret-project/issues/1/close' },
      { method: 'POST', url: '/owner-1/secret-project/issues/1/reopen' },
    ];

    for (const call of mutating) {
      privateRepoNoGrant(prisma);
      const res = await app.inject({ method: call.method, url: call.url, payload: call.payload });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    }
    expect(prisma.issue.update).not.toHaveBeenCalled();
  });

  it('lets the owner list, read and mutate issues on a private repo', async () => {
    const prisma = makePrisma();
    const app = await buildApp('owner-1', prisma);

    privateRepoOwner(prisma);
    const list = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/issues',
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual([PRIVATE_ISSUE]);

    privateRepoOwner(prisma);
    const detail = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/issues/1',
    });
    expect(detail.statusCode).toBe(200);

    privateRepoOwner(prisma);
    prisma.issue.findUnique.mockResolvedValueOnce({ ...PRIVATE_ISSUE });
    const patched = await app.inject({
      method: 'PATCH',
      url: '/owner-1/secret-project/issues/1',
      payload: { title: 'Updated title' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data.title).toBe('Updated title');
  });

  it('lets the owner create an issue on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoOwner(prisma);
    const app = await buildApp('owner-1', prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/owner-1/secret-project/issues',
      payload: { title: 'New issue', body: 'Details' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe('New issue');
    expect(prisma.issue.create).toHaveBeenCalled();
  });

  it('lets a collaborator list issues on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoCollaborator(prisma);
    const app = await buildApp('user-3', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/issues',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([PRIVATE_ISSUE]);
  });

  it('lets any authenticated user list issues on a public repo', async () => {
    const prisma = makePrisma();
    prisma.repository.findFirst.mockResolvedValueOnce({ ...PUBLIC_REPO });
    prisma.issue.findMany.mockResolvedValueOnce([]);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/open-project/issues',
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 REPO_NOT_FOUND for a repo path that does not exist', async () => {
    const prisma = makePrisma();
    prisma.repository.findFirst.mockResolvedValueOnce(null);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/no-such-repo/issues',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
  });
});
