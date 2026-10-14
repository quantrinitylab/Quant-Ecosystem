// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import ciRoutes from '../modules/code/routes/ci';

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

const PRIVATE_RUN = {
  id: 'run-private-1',
  repoId: 'repo-private',
  branch: 'main',
  commitSha: 'abc123',
  status: 'SUCCESS' as const,
};

const OTHER_REPO_RUN = {
  id: 'run-other-repo',
  repoId: 'repo-someone-else',
  branch: 'main',
  commitSha: 'def456',
  status: 'SUCCESS' as const,
};

type PrismaStub = {
  repository: { findFirst: ReturnType<typeof vi.fn> };
  repositoryCollaborator: { findFirst: ReturnType<typeof vi.fn> };
  ciRun: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  ciJob: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

function makePrisma(): PrismaStub {
  return {
    repository: { findFirst: vi.fn() },
    repositoryCollaborator: { findFirst: vi.fn(async () => null) },
    ciRun: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => [PRIVATE_RUN]),
      findUnique: vi.fn(),
    },
    ciJob: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
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
  await app.register(ciRoutes);
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

describe('CI routes: private-repository visibility gate', () => {
  it('rejects anonymous requests with 401 UNAUTHORIZED', async () => {
    const prisma = makePrisma();
    const app = await buildApp(undefined, prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/ci/runs',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 (not 200, not 403) for an authenticated non-owner on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/ci/runs',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    // The run listing must never be reached for a private repo the caller
    // cannot read: no CI data should leak.
    expect(prisma.ciRun.findMany).not.toHaveBeenCalled();
  });

  it('lets the owner list CI runs on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoOwner(prisma);
    const app = await buildApp('owner-1', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/ci/runs',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([PRIVATE_RUN]);
  });

  it('lets a collaborator list CI runs on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoCollaborator(prisma);
    const app = await buildApp('user-3', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/ci/runs',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([PRIVATE_RUN]);
  });

  it('lets any authenticated user list runs on a public repo', async () => {
    const prisma = makePrisma();
    prisma.repository.findFirst.mockResolvedValueOnce({ ...PUBLIC_REPO });
    prisma.ciRun.findMany.mockResolvedValueOnce([]);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/open-project/ci/runs',
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 on run detail for a non-owner of a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/ci/runs/run-private-1',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    expect(prisma.ciRun.findFirst).not.toHaveBeenCalled();
  });

  it('returns 404 CI_RUN_NOT_FOUND when the run id belongs to another repository', async () => {
    const prisma = makePrisma();
    privateRepoOwner(prisma);
    // run-other-repo exists, but scoped to repo-someone-else — never matches.
    prisma.ciRun.findFirst.mockResolvedValueOnce(null);
    const app = await buildApp('owner-1', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/ci/runs/run-other-repo',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CI_RUN_NOT_FOUND');
  });

  it('lets the owner read run detail, status and jobs on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoOwner(prisma); // GET /:runId
    prisma.ciRun.findFirst.mockResolvedValueOnce({ ...PRIVATE_RUN });

    const app = await buildApp('owner-1', prisma);

    const detail = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/ci/runs/run-private-1',
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.id).toBe('run-private-1');

    // status: loadRepoRun gates, then PipelineService.getRunStatus (findUnique).
    privateRepoOwner(prisma);
    prisma.ciRun.findFirst.mockResolvedValueOnce({ ...PRIVATE_RUN });
    prisma.ciRun.findUnique.mockResolvedValueOnce({ ...PRIVATE_RUN, jobs: [] });
    const status = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/ci/runs/run-private-1/status',
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().data.runId).toBe('run-private-1');

    // jobs
    privateRepoOwner(prisma);
    prisma.ciRun.findFirst.mockResolvedValueOnce({ ...PRIVATE_RUN });
    const jobs = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/ci/runs/run-private-1/jobs',
    });
    expect(jobs.statusCode).toBe(200);
  });

  it('returns 404 on job logs for a non-owner of a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/ci/runs/run-private-1/jobs/job-1/logs',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
  });

  it('returns 404 CI_JOB_NOT_FOUND when the job id does not belong to the run', async () => {
    const prisma = makePrisma();
    privateRepoOwner(prisma);
    prisma.ciRun.findFirst.mockResolvedValueOnce({ ...PRIVATE_RUN });
    prisma.ciJob.findFirst.mockResolvedValueOnce(null);
    const app = await buildApp('owner-1', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/secret-project/ci/runs/run-private-1/jobs/job-from-another-run/logs',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CI_JOB_NOT_FOUND');
  });

  it('returns 404 for a non-owner triggering a pipeline on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/owner-1/secret-project/ci/runs',
      payload: { ref: 'main', type: 'MANUAL' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
  });

  it('returns 404 on retry for a non-owner of a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/owner-1/secret-project/ci/runs/run-private-1/retry',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
  });

  it('returns 404 REPO_NOT_FOUND for a repo path that does not exist', async () => {
    const prisma = makePrisma();
    prisma.repository.findFirst.mockResolvedValueOnce(null);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/no-such-repo/ci/runs',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
  });
});
