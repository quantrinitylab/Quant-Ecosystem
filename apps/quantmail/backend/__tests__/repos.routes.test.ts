// @vitest-environment node
// ============================================================================
// /repos — QuantGit backend database-driven routes test suite.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import reposRoutes from '../routes/repos';

const MOCK_REPO = {
  id: 'repo-1',
  ownerId: 'user-1',
  name: 'Quant-Ecosystem',
  description: 'The unified ecosystem monorepo',
  visibility: 'PUBLIC',
  defaultBranch: 'main',
  storagePathUrl: '/var/repos/user-1/Quant-Ecosystem.git',
  starCount: 42,
  forkCount: 5,
  isArchived: false,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  deletedAt: null,
};

const MOCK_ISSUE = {
  id: 'issue-1',
  repoId: 'repo-1',
  number: 1,
  title: 'Test Issue #1',
  body: 'This is a test issue',
  authorId: 'user-1',
  status: 'OPEN',
  labels: ['bug'],
  assignees: [],
  createdAt: new Date('2026-09-02T00:00:00.000Z'),
  updatedAt: new Date('2026-09-02T00:00:00.000Z'),
  closedAt: null,
  author: {
    username: 'kundan',
    displayName: 'Kundan Singh',
  },
};

const MOCK_PR = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 1,
  title: 'Test Pull Request #1',
  body: 'Feature branch changes',
  authorId: 'user-1',
  status: 'OPEN',
  sourceBranch: 'feat/test',
  targetBranch: 'main',
  createdAt: new Date('2026-09-03T00:00:00.000Z'),
  updatedAt: new Date('2026-09-03T00:00:00.000Z'),
  closedAt: null,
  mergedAt: null,
  author: {
    username: 'kundan',
    displayName: 'Kundan Singh',
  },
};

function fakePrisma() {
  return {
    repository: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([MOCK_REPO]),
      findUnique: vi.fn().mockResolvedValue(MOCK_REPO),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(MOCK_REPO),
      update: vi.fn().mockImplementation(async ({ data }: any) => {
        if (data.starCount?.increment) {
          return { ...MOCK_REPO, starCount: MOCK_REPO.starCount + data.starCount.increment };
        }
        return { ...MOCK_REPO, ...data };
      }),
      delete: vi.fn().mockResolvedValue(MOCK_REPO),
    },
    branch: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ name: 'main', commitSha: '948e3612', isProtected: false }]),
    },
    issue: {
      findMany: vi.fn().mockResolvedValue([MOCK_ISSUE]),
      findFirst: vi.fn().mockResolvedValue(MOCK_ISSUE),
      create: vi.fn().mockResolvedValue(MOCK_ISSUE),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({
        ...MOCK_ISSUE,
        ...data,
      })),
    },
    pullRequest: {
      findMany: vi.fn().mockResolvedValue([MOCK_PR]),
      findFirst: vi.fn().mockResolvedValue(MOCK_PR),
      create: vi.fn().mockResolvedValue(MOCK_PR),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({
        ...MOCK_PR,
        ...data,
      })),
    },
  };
}

let prisma: ReturnType<typeof fakePrisma>;

async function buildApp(userId: string | null = 'user-1') {
  prisma = fakePrisma();
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.decorate('repositoryProvisioning', {
    provision: vi.fn().mockResolvedValue({ storagePath: '/var/repos/test.git' }),
    archive: vi.fn().mockResolvedValue({ storagePath: '/var/repos/test.git.bak' }),
    destroy: vi.fn().mockResolvedValue(undefined),
  });
  app.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(reposRoutes, { prefix: '/repos' });
  await app.ready();
  return app;
}

describe('QuantGit Database-Backed Repos Routes', () => {
  it('GET /repos returns public and owned repositories', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/repos' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Quant-Ecosystem');
    expect(body.data[0].stars).toBe(42);
    expect(prisma.repository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ ownerId: 'user-1' }, { visibility: 'PUBLIC' }],
        }),
      }),
    );
  });

  it('POST /repos creates a new repository with default branch', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: {
        name: 'new-sovereign-repo',
        description: 'Testing real DB persistence',
        visibility: 'public',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(prisma.repository.create).toHaveBeenCalled();
  });

  it('POST /repos/:id/issues creates a real issue linked to repository and user', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/issues',
      payload: {
        title: 'Real DB Issue',
        body: 'Verified persistence in Postgres',
        labels: ['bug', 'ui'],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Test Issue #1');
    expect(prisma.issue.create).toHaveBeenCalled();
  });

  it('GET /repos/:id/issues lists issues for the repository', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/repos/repo-1/issues' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].number).toBe(1);
    expect(body.data[0].state).toBe('open');
  });

  it('POST /repos/:id/issues/:number/toggle toggles an issue between OPEN and CLOSED', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/issues/1/toggle',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe('closed');
    expect(prisma.issue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CLOSED',
        }),
      }),
    );
  });

  it('POST /repos/:id/pulls creates a real pull request in database', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/pulls',
      payload: {
        title: 'New PR Title',
        body: 'Pull request description',
        sourceBranch: 'feat/test-pr',
        targetBranch: 'main',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.branchSource).toBe('feat/test');
    expect(prisma.pullRequest.create).toHaveBeenCalled();
  });

  it('POST /repos/:id/star increments starCount in database and returns updated total', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/star',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.stars).toBe(43);
    expect(prisma.repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { starCount: { increment: 1 } },
      }),
    );
  });
});
