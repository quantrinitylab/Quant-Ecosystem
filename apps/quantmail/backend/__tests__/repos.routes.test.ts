// @vitest-environment node
// ============================================================================
// /repos — QuantGit backend database-driven routes test suite.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import reposRoutes, { resetRepoStores } from '../routes/repos';

const MOCK_REPO = {
  id: 'repo-1',
  ownerId: 'user-1',
  name: 'Quant-Ecosystem',
  branches: [
    {
      id: 'branch-1',
      repoId: 'repo-1',
      name: 'main',
      commitSha: '1111111111111111111111111111111111111111',
      isProtected: false,
    },
  ],
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

const MOCK_ISSUE_COMMENT = {
  id: 'issue-comment-1',
  issueId: 'issue-1',
  authorId: 'user-1',
  body: 'Persisted issue comment',
  createdAt: new Date('2026-09-16T10:00:00.000Z'),
  updatedAt: new Date('2026-09-16T10:00:00.000Z'),
  author: {
    id: 'user-1',
    username: 'kundan',
    displayName: 'Kundan Singh',
    avatarUrl: 'https://example.test/avatar.png',
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

const MOCK_REVIEW = {
  id: 'review-1',
  prId: 'pr-1',
  reviewerId: 'user-2',
  status: 'APPROVED',
  body: 'Looks good to me!',
  createdAt: new Date('2026-09-04T00:00:00.000Z'),
  updatedAt: new Date('2026-09-04T00:00:00.000Z'),
  reviewer: {
    id: 'user-2',
    username: 'collab',
    displayName: 'Collaborator User',
    avatarUrl: 'https://example.test/avatar.png',
  },
};

const MOCK_BRANCH_PROTECTION = {
  id: 'bp-1',
  repoId: 'repo-1',
  branchPattern: 'main',
  requiredApprovals: 1,
  requireStatusChecks: false,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
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
      findUnique: vi.fn().mockResolvedValue({
        id: 'branch-1',
        repoId: 'repo-1',
        name: 'main',
        commitSha: '1111111111111111111111111111111111111111',
        isProtected: false,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
      findMany: vi
        .fn()
        .mockResolvedValue([{ name: 'main', commitSha: '948e3612', isProtected: false }]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        id: 'branch-1',
        repoId: data.repoId,
        name: data.name,
        commitSha: data.commitSha,
        isProtected: false,
      })),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({
        id: 'branch-1',
        repoId: 'repo-1',
        name: 'main',
        commitSha: data.commitSha,
        isProtected: false,
      })),
      upsert: vi.fn().mockImplementation(async ({ create, update }: any) => ({
        id: 'branch-1',
        ...create,
        ...update,
        isProtected: false,
      })),
    },
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where?.id === 'user-1' || where?.email === 'kundan@example.test') {
          return {
            id: 'user-1',
            username: 'kundan',
            displayName: 'Kundan Singh',
            email: 'kundan@example.test',
            avatarUrl: 'https://example.test/avatar.png',
          };
        }
        if (where?.id === 'user-2' || where?.email === 'collab@example.test') {
          return {
            id: 'user-2',
            username: 'collab',
            displayName: 'Collaborator User',
            email: 'collab@example.test',
            avatarUrl: 'https://example.test/avatar.png',
          };
        }
        if (where?.id === 'user-3' || where?.email === 'collab-admin@example.test') {
          return {
            id: 'user-3',
            username: 'collabadmin',
            displayName: 'Collaborator Admin',
            email: 'collab-admin@example.test',
            avatarUrl: null,
          };
        }
        if (where?.id && !where.id.includes('nonexistent') && !where.id.includes('unauthorized')) {
          return {
            id: where.id,
            username: 'kundan',
            displayName: 'Kundan Singh',
            email: 'kundan@example.test',
            avatarUrl: 'https://example.test/avatar.png',
          };
        }
        return null;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where?.email === 'kundan@example.test' || where?.id === 'user-1') {
          return {
            id: 'user-1',
            username: 'kundan',
            displayName: 'Kundan Singh',
            email: 'kundan@example.test',
            avatarUrl: 'https://example.test/avatar.png',
          };
        }
        if (where?.email === 'collab@example.test' || where?.id === 'user-2') {
          return {
            id: 'user-2',
            username: 'collab',
            displayName: 'Collaborator User',
            email: 'collab@example.test',
            avatarUrl: 'https://example.test/avatar.png',
          };
        }
        if (where?.email === 'collab-admin@example.test' || where?.id === 'user-3') {
          return {
            id: 'user-3',
            username: 'collabadmin',
            displayName: 'Collaborator Admin',
            email: 'collab-admin@example.test',
            avatarUrl: null,
          };
        }
        return null;
      }),
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
    issueComment: {
      findMany: vi.fn().mockResolvedValue([MOCK_ISSUE_COMMENT]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(MOCK_ISSUE_COMMENT),
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
    ciRun: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        id: 'run-1',
        repoId: data.repoId,
        branch: data.branch,
        commitSha: data.commitSha,
        status: data.status,
        triggeredBy: data.triggeredBy,
        jobs: (data.jobs?.create || []).map((j: any, idx: number) => ({
          id: `job-${idx + 1}`,
          runId: 'run-1',
          name: j.name,
          status: j.status,
          startedAt: j.startedAt,
          completedAt: j.completedAt,
        })),
      })),
    },
    review: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        id: `review-${Date.now()}`,
        prId: data.prId,
        reviewerId: data.reviewerId,
        status: data.status,
        body: data.body ?? '',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
    branchProtection: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({
        id: `rule-${Date.now()}`,
        repoId: data.repoId,
        branchPattern: data.branchPattern,
        requiredApprovals: data.requiredApprovals ?? 1,
        requireStatusChecks: data.requireStatusChecks ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => ({
        id: where?.id ?? 'rule-1',
        repoId: 'repo-1',
        branchPattern: 'main',
        requiredApprovals: 1,
        requireStatusChecks: false,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      delete: vi.fn().mockResolvedValue({ id: 'rule-1' }),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (callback: (tx: any) => unknown) => callback(prisma)),
  };
}

let prisma: ReturnType<typeof fakePrisma>;
let repositoryMutation: {
  getBranchHead: ReturnType<typeof vi.fn>;
  commitFile: ReturnType<typeof vi.fn>;
  rollbackCommit: ReturnType<typeof vi.fn>;
};

async function buildApp(
  userId: string | null = 'user-1',
  extraDecorators: Record<string, any> = {},
) {
  prisma = fakePrisma();
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.decorate('repositoryProvisioning', {
    provision: vi.fn().mockResolvedValue({ storagePath: '/var/repos/test.git' }),
    archive: vi.fn().mockResolvedValue({ storagePath: '/var/repos/test.git.bak' }),
    destroy: vi.fn().mockResolvedValue(undefined),
  });
  repositoryMutation = {
    getBranchHead: vi.fn().mockResolvedValue('1111111111111111111111111111111111111111'),
    commitFile: vi.fn().mockResolvedValue({
      commitSha: '2222222222222222222222222222222222222222',
      blobSha: '3333333333333333333333333333333333333333',
      previousHeadSha: '1111111111111111111111111111111111111111',
      path: 'src/index.ts',
      branch: 'main',
    }),
    rollbackCommit: vi.fn().mockResolvedValue(undefined),
  };
  app.decorate('repositoryMutation', repositoryMutation as never);
  for (const [key, val] of Object.entries(extraDecorators)) {
    app.decorate(key, val as never);
  }
  app.addHook('onRequest', async (request) => {
    const overrideUser = (request.headers['x-user-id'] as string) || userId;
    if (overrideUser)
      (request as unknown as { auth: { userId: string } }).auth = { userId: overrideUser };
  });
  await app.register(reposRoutes, { prefix: '/repos' });
  await app.ready();
  return app;
}

describe('QuantGit Database-Backed Repos Routes', () => {
  beforeEach(() => {
    resetRepoStores();
  });

  it('PATCH /repos/:id/file commits a file on main and queues CI', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'PATCH',
      url: '/repos/repo-1/file',
      payload: {
        path: 'src/index.ts',
        branch: 'main',
        content: 'export const answer = 42;\n',
        message: 'feat: add answer module',
        parentSha: '1111111111111111111111111111111111111111',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: {
        commitSha: '2222222222222222222222222222222222222222',
        blobSha: '3333333333333333333333333333333333333333',
        path: 'src/index.ts',
        branch: 'main',
        message: 'feat: add answer module',
      },
    });

    expect(repositoryMutation.getBranchHead).toHaveBeenCalledWith({
      owner: 'user-1',
      name: 'Quant-Ecosystem',
      branch: 'main',
    });

    expect(repositoryMutation.commitFile).toHaveBeenCalledWith({
      owner: 'user-1',
      name: 'Quant-Ecosystem',
      branch: 'main',
      path: 'src/index.ts',
      content: 'export const answer = 42;\n',
      message: 'feat: add answer module',
      expectedHeadSha: '1111111111111111111111111111111111111111',
      author: {
        name: 'Kundan Singh',
        email: 'kundan@example.test',
      },
    });

    expect(prisma.branch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          repoId_name: {
            repoId: 'repo-1',
            name: 'main',
          },
        },
        update: {
          commitSha: '2222222222222222222222222222222222222222',
        },
      }),
    );

    expect(prisma.ciRun.create).toHaveBeenCalledWith({
      data: {
        repoId: 'repo-1',
        branch: 'main',
        commitSha: '2222222222222222222222222222222222222222',
        status: 'PENDING',
        triggeredBy: 'kundan',
      },
    });

    expect(repositoryMutation.rollbackCommit).not.toHaveBeenCalled();
  });

  it('PATCH /repos/:id/file compares CAS SHAs case-insensitively and forwards lowercase SHA', async () => {
    const app = await buildApp();
    repositoryMutation.getBranchHead.mockResolvedValueOnce(
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );

    const response = await app.inject({
      method: 'PATCH',
      url: '/repos/repo-1/file',
      payload: {
        path: 'src/index.ts',
        branch: 'main',
        content: 'export const normalized = true;\n',
        message: 'fix: normalize CAS SHA',
        parentSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(repositoryMutation.commitFile).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedHeadSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    );
  });

  it('POST /repos/:id/file returns 409 and currentHeadSha for stale parentSha', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/file',
      payload: {
        path: 'src/index.ts',
        branch: 'main',
        content: 'new content',
        message: 'Update file',
        parentSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      success: false,
      error: {
        code: 'STALE_PARENT_SHA',
        message: 'The branch head changed. Reload the file before committing.',
      },
      currentHeadSha: '1111111111111111111111111111111111111111',
    });

    expect(repositoryMutation.commitFile).not.toHaveBeenCalled();
    expect(prisma.branch.upsert).not.toHaveBeenCalled();
    expect(prisma.ciRun.create).not.toHaveBeenCalled();
  });

  it('PATCH /repos/:id/file fails closed when parentSha is omitted', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'PATCH',
      url: '/repos/repo-1/file',
      payload: {
        path: 'src/index.ts',
        branch: 'main',
        content: 'new content',
        message: 'Update file without CAS token',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'PARENT_SHA_REQUIRED',
        }),
      }),
    );

    expect(repositoryMutation.getBranchHead).not.toHaveBeenCalled();
    expect(repositoryMutation.commitFile).not.toHaveBeenCalled();
    expect(prisma.branch.upsert).not.toHaveBeenCalled();
    expect(prisma.ciRun.create).not.toHaveBeenCalled();
  });

  it('PATCH /repos/:id/file rejects a protected branch', async () => {
    const app = await buildApp();

    prisma.branch.findUnique.mockResolvedValueOnce({
      id: 'branch-1',
      repoId: 'repo-1',
      name: 'main',
      commitSha: '1111111111111111111111111111111111111111',
      isProtected: true,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    } as never);

    const response = await app.inject({
      method: 'PATCH',
      url: '/repos/repo-1/file',
      payload: {
        path: 'src/index.ts',
        branch: 'main',
        content: 'new content',
        message: 'Attempt protected branch commit',
        parentSha: '1111111111111111111111111111111111111111',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'BRANCH_PROTECTED',
        }),
      }),
    );

    expect(repositoryMutation.getBranchHead).not.toHaveBeenCalled();
    expect(repositoryMutation.commitFile).not.toHaveBeenCalled();
    expect(prisma.branch.upsert).not.toHaveBeenCalled();
    expect(prisma.ciRun.create).not.toHaveBeenCalled();
  });

  it('PATCH /repos/:id/file rejects unauthenticated callers', async () => {
    const app = await buildApp(null);

    const response = await app.inject({
      method: 'PATCH',
      url: '/repos/repo-1/file',
      payload: {
        path: 'src/index.ts',
        branch: 'main',
        content: 'content',
        message: 'Update file',
        parentSha: '1111111111111111111111111111111111111111',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
        }),
      }),
    );

    expect(repositoryMutation.getBranchHead).not.toHaveBeenCalled();
    expect(repositoryMutation.commitFile).not.toHaveBeenCalled();
  });

  it('PATCH /repos/:id/file returns 404 for a missing repository', async () => {
    const app = await buildApp();

    prisma.repository.findUnique.mockResolvedValueOnce(null as never);
    prisma.repository.findFirst.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'PATCH',
      url: '/repos/missing/file',
      payload: {
        path: 'src/index.ts',
        branch: 'main',
        content: 'content',
        message: 'Update file',
        parentSha: '1111111111111111111111111111111111111111',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'REPO_NOT_FOUND',
        }),
      }),
    );

    expect(repositoryMutation.getBranchHead).not.toHaveBeenCalled();
    expect(repositoryMutation.commitFile).not.toHaveBeenCalled();
  });

  it('GET /repos returns empty non-fabricated commit metadata when no branch row exists', async () => {
    const app = await buildApp();
    prisma.repository.findMany.mockResolvedValueOnce([
      {
        ...MOCK_REPO,
        branches: [],
      },
    ] as never);

    const response = await app.inject({ method: 'GET', url: '/repos' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toEqual(
      expect.objectContaining({
        topics: [],
        latestCommit: '',
        latestCommitSha: '',
        latestCommitTime: '',
        checksStatus: 'none',
        license: '',
      }),
    );
  });

  it('GET /repos derives latest commit metadata from the real default branch row', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/repos' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toEqual(
      expect.objectContaining({
        latestCommit: 'Commit 1111111',
        latestCommitSha: '1111111111111111111111111111111111111111',
        checksStatus: 'none',
        topics: [],
        license: '',
      }),
    );
    expect(prisma.repository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { branches: true },
      }),
    );
  });

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
        include: { branches: true },
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

  it('PATCH /repos/:id updates repository settings when authorized', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/repos/repo-1',
      payload: {
        name: 'Quant-Ecosystem-Renamed',
        description: 'Updated description',
        visibility: 'private',
        defaultBranch: 'develop',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(prisma.repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Quant-Ecosystem-Renamed',
          description: 'Updated description',
          visibility: 'PRIVATE',
          defaultBranch: 'develop',
        }),
      }),
    );
  });

  it('POST /repos/:id/branches creates a real branch in database', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/branches',
      payload: {
        name: 'feat/sprint-8-persistence',
        sha: '948e361200000000000000000000000000000000',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('feat/sprint-8-persistence');
    expect(prisma.branch.create).toHaveBeenCalled();
  });

  it('POST /repos/:id/branches inherits the default branch database SHA', async () => {
    const app = await buildApp();

    prisma.branch.findFirst.mockResolvedValueOnce(null as never);
    prisma.branch.findUnique.mockResolvedValueOnce({
      id: 'branch-main',
      repoId: 'repo-1',
      name: 'main',
      commitSha: '1111111111111111111111111111111111111111',
      isProtected: false,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/branches',
      payload: {
        name: 'feat/inherit-main',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(prisma.branch.create).toHaveBeenCalledWith({
      data: {
        repoId: 'repo-1',
        name: 'feat/inherit-main',
        commitSha: '1111111111111111111111111111111111111111',
      },
    });
    expect(repositoryMutation.getBranchHead).not.toHaveBeenCalled();
  });

  it('POST /repos/:id/branches falls back to the authoritative Git head', async () => {
    const app = await buildApp();

    prisma.branch.findFirst.mockResolvedValueOnce(null as never);
    prisma.branch.findUnique.mockResolvedValueOnce(null as never);
    repositoryMutation.getBranchHead.mockResolvedValueOnce(
      '4444444444444444444444444444444444444444',
    );

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/branches',
      payload: {
        name: 'feat/from-git-head',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(repositoryMutation.getBranchHead).toHaveBeenCalledWith({
      owner: 'user-1',
      name: 'Quant-Ecosystem',
      branch: 'main',
    });
    expect(prisma.branch.create).toHaveBeenCalledWith({
      data: {
        repoId: 'repo-1',
        name: 'feat/from-git-head',
        commitSha: '4444444444444444444444444444444444444444',
      },
    });
  });

  it('POST /repos/:id/branches rejects creation when no parent SHA exists', async () => {
    const app = await buildApp();

    prisma.branch.findFirst.mockResolvedValueOnce(null as never);
    prisma.branch.findUnique.mockResolvedValueOnce(null as never);
    repositoryMutation.getBranchHead.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/branches',
      payload: {
        name: 'feat/no-parent',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'BRANCH_NOT_FOUND',
          message: 'Cannot create branch: parent commit SHA not found',
        }),
      }),
    );
    expect(prisma.branch.create).not.toHaveBeenCalled();
  });

  it('POST /repos/:id/branches rejects abbreviated and non-hex SHAs', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/branches',
      payload: {
        name: 'feat/invalid-parent',
        sha: '948e3612',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
        }),
      }),
    );
    expect(prisma.branch.create).not.toHaveBeenCalled();
  });

  it('POST /repos/:id/branches normalizes a valid parent SHA to lowercase', async () => {
    const app = await buildApp();
    const uppercaseSha = 'ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD';

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/branches',
      payload: {
        name: 'feat/lowercase-parent',
        sha: uppercaseSha,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(prisma.branch.create).toHaveBeenCalledWith({
      data: {
        repoId: 'repo-1',
        name: 'feat/lowercase-parent',
        commitSha: uppercaseSha.toLowerCase(),
      },
    });
  });

  it('POST /repos/:id/pulls/:number/merge marks pull request as merged', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/pulls/1/merge',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe('merged');
    expect(prisma.pullRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'MERGED',
        }),
      }),
    );
  });

  it('GET /repos/:id/actions returns CI runs', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/repos/repo-1/actions',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('POST /repos/:id/actions/trigger returns 201 without dev gating in production environment', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSeeding = process.env.ENABLE_DEV_REPO_SEEDING;

    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_DEV_REPO_SEEDING;

    try {
      const app = await buildApp();
      const response = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/actions/trigger',
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            status: 'in_progress',
            branch: 'main',
            workflow: 'CI / Staging Pipeline',
          }),
        }),
      );
      expect(prisma.ciRun.create).toHaveBeenCalled();
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }

      if (previousSeeding === undefined) {
        delete process.env.ENABLE_DEV_REPO_SEEDING;
      } else {
        process.env.ENABLE_DEV_REPO_SEEDING = previousSeeding;
      }
    }
  });

  it('POST /repos/:id/actions/trigger dispatches to runner port when available', async () => {
    const ciRunnerSpy = {
      dispatch: vi.fn().mockResolvedValue(undefined),
    };
    const app = await buildApp('user-1', { ciRunner: ciRunnerSpy });

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/actions/trigger',
      payload: {
        branch: 'main',
        workflow: 'Custom Lint & Test',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.workflow).toBe('Custom Lint & Test');
    expect(ciRunnerSpy.dispatch).toHaveBeenCalledTimes(1);
    expect(ciRunnerSpy.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: 'repo-1',
        branch: 'main',
      }),
    );
  });

  it('POST /repos/:id/actions/trigger rejects callers without write permission with 403', async () => {
    const app = await buildApp('unauthorized-user');
    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/actions/trigger',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'FORBIDDEN',
        }),
      }),
    );
  });

  // ==================== REPOSITORY COLLABORATORS & RBAC ====================

  it('POST /repos/:id/collaborators adds a collaborator and returns 201', async () => {
    const app = await buildApp('user-1');

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/collaborators',
      payload: {
        userId: 'user-2',
        role: 'WRITE',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      success: true,
      data: {
        id: expect.any(String),
        userId: 'user-2',
        role: 'WRITE',
        user: {
          displayName: 'Collaborator User',
          email: 'collab@example.test',
          avatarUrl: 'https://example.test/avatar.png',
        },
      },
    });
  });

  it('POST /repos/:id/collaborators adds a collaborator by email and returns 201', async () => {
    const app = await buildApp('user-1');

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/collaborators',
      payload: {
        email: 'collab@example.test',
        role: 'ADMIN',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      success: true,
      data: {
        id: expect.any(String),
        userId: 'user-2',
        role: 'ADMIN',
        user: {
          displayName: 'Collaborator User',
          email: 'collab@example.test',
          avatarUrl: 'https://example.test/avatar.png',
        },
      },
    });
  });

  it('POST /repos/:id/collaborators updates an existing collaborator role and returns 200', async () => {
    const app = await buildApp('user-1');

    // Add collaborator
    await app.inject({
      method: 'POST',
      url: '/repos/repo-1/collaborators',
      payload: {
        userId: 'user-2',
        role: 'WRITE',
      },
    });

    // Update to ADMIN
    const updateRes = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/collaborators',
      payload: {
        userId: 'user-2',
        role: 'ADMIN',
      },
    });

    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        userId: 'user-2',
        role: 'ADMIN',
      }),
    });
  });

  it('GET /repos/:id/collaborators lists collaborators with user details', async () => {
    const app = await buildApp('user-1');

    // Add two collaborators
    await app.inject({
      method: 'POST',
      url: '/repos/repo-1/collaborators',
      payload: { userId: 'user-2', role: 'WRITE' },
    });
    await app.inject({
      method: 'POST',
      url: '/repos/repo-1/collaborators',
      payload: { userId: 'user-3', role: 'READ' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/repos/repo-1/collaborators',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'user-2',
          role: 'WRITE',
          user: expect.objectContaining({
            displayName: 'Collaborator User',
            email: 'collab@example.test',
          }),
        }),
        expect.objectContaining({
          userId: 'user-3',
          role: 'READ',
          user: expect.objectContaining({
            displayName: 'Collaborator Admin',
            email: 'collab-admin@example.test',
          }),
        }),
      ]),
    );
  });

  it('POST /repos/:id/collaborators rejects non-owner, non-admin callers with 403', async () => {
    const app = await buildApp('user-2'); // user-2 is not owner or admin

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/collaborators',
      payload: {
        userId: 'user-3',
        role: 'READ',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'FORBIDDEN',
        }),
      }),
    );
  });

  it('POST /repos/:id/collaborators rejects adding repository owner as collaborator with 400', async () => {
    const app = await buildApp('user-1'); // user-1 is owner

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/collaborators',
      payload: {
        userId: 'user-1',
        role: 'ADMIN',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'OWNER_CANNOT_BE_COLLABORATOR',
        }),
      }),
    );
  });

  it('POST /repos/:id/collaborators returns 404 when user is not found', async () => {
    const app = await buildApp('user-1');

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/collaborators',
      payload: {
        email: 'nonexistent-user@example.test',
        role: 'WRITE',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'USER_NOT_FOUND',
        }),
      }),
    );
  });

  it('DELETE /repos/:id/collaborators/:userId removes a collaborator', async () => {
    const app = await buildApp('user-1');

    // Add collaborator
    await app.inject({
      method: 'POST',
      url: '/repos/repo-1/collaborators',
      payload: { userId: 'user-2', role: 'WRITE' },
    });

    // Remove collaborator
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/repos/repo-1/collaborators/user-2',
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json()).toEqual({
      success: true,
      data: {
        message: 'Collaborator removed',
      },
    });

    // Verify empty list
    const listRes = await app.inject({
      method: 'GET',
      url: '/repos/repo-1/collaborators',
    });
    expect(listRes.json().data).toHaveLength(0);
  });

  it('DELETE /repos/:id/collaborators/:userId rejects removing repo owner with 400', async () => {
    const app = await buildApp('user-1');

    const response = await app.inject({
      method: 'DELETE',
      url: '/repos/repo-1/collaborators/user-1',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'CANNOT_REMOVE_OWNER',
        }),
      }),
    );
  });

  it('DELETE /repos/:id/collaborators/:userId rejects non-owner, non-admin with 403', async () => {
    const app = await buildApp('user-2');

    const response = await app.inject({
      method: 'DELETE',
      url: '/repos/repo-1/collaborators/user-3',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'FORBIDDEN',
        }),
      }),
    );
  });

  // ==================== RELEASES & TAGS ENDPOINTS ====================

  it('POST /repos/:id/tags creates a tag and returns 201', async () => {
    const app = await buildApp('user-1');

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/tags',
      payload: {
        name: 'v1.0.0',
        commitSha: '1111111111111111111111111111111111111111',
        message: 'Release version 1.0.0',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      success: true,
      data: {
        name: 'v1.0.0',
        commitSha: '1111111111111111111111111111111111111111',
        message: 'Release version 1.0.0',
      },
    });
  });

  it('GET /repos/:id/tags lists tags for repository', async () => {
    const app = await buildApp('user-1');

    // Create tag
    await app.inject({
      method: 'POST',
      url: '/repos/repo-1/tags',
      payload: {
        name: 'v1.0.0',
        commitSha: '1111111111111111111111111111111111111111',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/repos/repo-1/tags',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: [
        {
          name: 'v1.0.0',
          commitSha: '1111111111111111111111111111111111111111',
        },
      ],
    });
  });

  it('POST /repos/:id/tags rejects invalid tag name and non-hex SHA', async () => {
    const app = await buildApp('user-1');

    const badNameRes = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/tags',
      payload: {
        name: '-invalid-name',
        commitSha: '1111111111111111111111111111111111111111',
      },
    });
    expect(badNameRes.statusCode).toBe(400);

    const badShaRes = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/tags',
      payload: {
        name: 'v1.0.1',
        commitSha: 'not-a-sha',
      },
    });
    expect(badShaRes.statusCode).toBe(400);
  });

  it('POST /repos/:id/releases creates a release and returns 201', async () => {
    const app = await buildApp('user-1');

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/releases',
      payload: {
        tagName: 'v1.0.0',
        name: 'Release v1.0.0',
        body: 'First official release with full CodeHub parity.',
        isDraft: false,
        isPrerelease: false,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        id: expect.any(String),
        repoId: 'repo-1',
        tagName: 'v1.0.0',
        name: 'Release v1.0.0',
        body: 'First official release with full CodeHub parity.',
        isDraft: false,
        isPrerelease: false,
        authorId: 'user-1',
      }),
    });
  });

  it('GET /repos/:id/releases lists releases for repository', async () => {
    const app = await buildApp('user-1');

    // Create a release
    await app.inject({
      method: 'POST',
      url: '/repos/repo-1/releases',
      payload: {
        tagName: 'v1.0.0',
        name: 'Release v1.0.0',
        body: 'Initial production release',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/repos/repo-1/releases',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        tagName: 'v1.0.0',
        name: 'Release v1.0.0',
      }),
    );
  });

  it('POST /repos/:id/releases rejects unauthorized callers with 403', async () => {
    const app = await buildApp('user-unauthorized');

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/releases',
      payload: {
        tagName: 'v1.0.0',
        name: 'Release v1.0.0',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'FORBIDDEN',
        }),
      }),
    );
  });

  it('GET /repos/:id/issues/:number/comments lists persisted comments', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/repos/repo-1/issues/1/comments',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(
      expect.objectContaining({
        success: true,
        data: [
          expect.objectContaining({
            id: 'issue-comment-1',
            issueNumber: 1,
            body: 'Persisted issue comment',
            author: expect.objectContaining({ username: 'kundan' }),
          }),
        ],
      }),
    );
    expect(prisma.issueComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { issueId: 'issue-1' } }),
    );
  });

  it('POST /repos/:id/issues/:number/comments persists an authenticated comment', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/issues/1/comments',
      payload: { body: '  Persisted issue comment  ' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 'issue-comment-1',
          body: 'Persisted issue comment',
        }),
      }),
    );
    expect(prisma.issueComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          issueId: 'issue-1',
          authorId: 'user-1',
          body: 'Persisted issue comment',
        },
      }),
    );
  });

  it('GET /repos/:id/issues/:number/comments rejects unauthenticated callers', async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: 'GET',
      url: '/repos/repo-1/issues/1/comments',
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }),
    );
  });

  it('GET /repos/:id/issues/:number/comments returns 404 for a missing issue', async () => {
    const app = await buildApp();
    prisma.issue.findFirst.mockResolvedValueOnce(null as never);
    const res = await app.inject({
      method: 'GET',
      url: '/repos/repo-1/issues/999/comments',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'ISSUE_NOT_FOUND' }),
      }),
    );
    expect(prisma.issueComment.findMany).not.toHaveBeenCalled();
  });

  it('POST /repos/:id/issues/:number/toggle rejects unauthenticated callers with 401', async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/issues/1/toggle',
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }),
    );
  });

  it('POST /repos/:id/issues/:number/toggle rejects non-owner, non-author callers with 403 FORBIDDEN (V23)', async () => {
    const app = await buildApp('foreign-user');
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/issues/1/toggle',
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      }),
    );
  });

  it('POST /repos/:id/issues/:number/toggle allows repo owner to toggle issue', async () => {
    const app = await buildApp('user-1'); // owner of repo-1
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/issues/1/toggle',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 1,
          state: 'closed',
        }),
      }),
    );
  });

  it('POST /repos/:id/issues/:number/toggle allows issue author to toggle issue on another user repo (V23)', async () => {
    const app = await buildApp('author-2');
    // Repo owned by user-1, but issue author is author-2
    prisma.issue.findFirst.mockResolvedValueOnce({
      ...MOCK_ISSUE,
      authorId: 'author-2',
    } as never);

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/issues/1/toggle',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 1,
          state: 'closed',
        }),
      }),
    );
  });

  describe('Phase R & Phase M Remediations: V20, V21, V22, V24', () => {
    it('V20: GET /repos/:id/actions surfaces database errors without incident masking', async () => {
      const app = await buildApp('user-1');
      prisma.ciRun.findMany.mockRejectedValueOnce(new Error('Postgres connection failed'));

      const res = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/actions',
      });

      // Does NOT mask error with 200 and empty array
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual(
        expect.objectContaining({
          success: false,
        }),
      );
    });

    it('V21: toDto returns truthful empty language, empty website, and zero watching', async () => {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'GET',
        url: '/repos/repo-1',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.language).toBe('');
      expect(body.data.website).toBe('');
      expect(body.data.watching).toBe(0);
    });

    it('V22: PR endpoints return 0 for additions/deletions/changedFiles and checksStatus none', async () => {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/pulls',
      });

      expect(res.statusCode).toBe(200);
      const pr = res.json().data[0];
      expect(pr.additions).toBe(0);
      expect(pr.deletions).toBe(0);
      expect(pr.changedFiles).toBe(0);
      expect(pr.checksStatus).toBe('none');
    });

    it('V22: Issue endpoints return assignee null instead of hardcoded Developer 6', async () => {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/issues',
      });

      expect(res.statusCode).toBe(200);
      const issue = res.json().data[0];
      expect(issue.assignee).toBeNull();
    });

    it('V24: DELETE /repos/:id/star decrements starCount and clamps at 0', async () => {
      const app = await buildApp('user-1');

      // 1. Normal decrement: 42 -> 41
      prisma.repository.findUnique.mockResolvedValueOnce({
        ...MOCK_REPO,
        starCount: 42,
      } as never);
      prisma.repository.update.mockResolvedValueOnce({
        ...MOCK_REPO,
        starCount: 41,
      } as never);

      const unstarRes = await app.inject({
        method: 'DELETE',
        url: '/repos/repo-1/star',
      });

      expect(unstarRes.statusCode).toBe(200);
      expect(unstarRes.json()).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 'repo-1', stars: 41 }),
        }),
      );
      expect(prisma.repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { starCount: 41 },
        }),
      );

      // 2. Clamped at 0: 0 -> 0
      prisma.repository.findUnique.mockResolvedValueOnce({
        ...MOCK_REPO,
        starCount: 0,
      } as never);
      prisma.repository.update.mockResolvedValueOnce({
        ...MOCK_REPO,
        starCount: 0,
      } as never);

      const clampRes = await app.inject({
        method: 'DELETE',
        url: '/repos/repo-1/star',
      });

      expect(clampRes.statusCode).toBe(200);
      expect(clampRes.json().data.stars).toBe(0);
      expect(prisma.repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { starCount: 0 },
        }),
      );
    });
  });

  // ==================== PR REVIEW APPROVALS & BRANCH PROTECTION (Wave 15) ====================

  describe('PR Review Approvals & Branch Protection (Wave 15)', () => {
    it('GET /repos/:id/pulls/:number/reviews lists reviews on a pull request', async () => {
      const app = await buildApp('user-1');
      prisma.review.findMany.mockResolvedValueOnce([MOCK_REVIEW]);

      const res = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/pulls/1/reviews',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([
        expect.objectContaining({
          id: 'review-1',
          status: 'APPROVED',
          prId: 'pr-1',
          reviewerId: 'user-2',
          body: 'Looks good to me!',
        }),
      ]);
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { prId: 'pr-1' },
        }),
      );
    });

    it('POST /repos/:id/pulls/:number/reviews submits an approval review by a collaborator', async () => {
      const app = await buildApp('user-1');
      // Add user-2 as collaborator
      await app.inject({
        method: 'POST',
        url: '/repos/repo-1/collaborators',
        payload: { userId: 'user-2', role: 'WRITE' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/reviews',
        headers: { 'x-user-id': 'user-2' },
        payload: {
          status: 'APPROVED',
          body: 'Looks great!',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('APPROVED');
      expect(body.data.reviewerId).toBe('user-2');
      expect(body.data.body).toBe('Looks great!');
      expect(prisma.review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            prId: 'pr-1',
            reviewerId: 'user-2',
            status: 'APPROVED',
            body: 'Looks great!',
          }),
        }),
      );
    });

    it('POST /repos/:id/pulls/:number/reviews rejects self-approval by the PR author with 400', async () => {
      const app = await buildApp('user-1'); // user-1 is author of MOCK_PR

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/reviews',
        payload: {
          status: 'APPROVED',
          body: 'Self approval attempt',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SELF_APPROVAL_NOT_ALLOWED');
      expect(body.error.message).toBe('Author cannot approve own pull request');
    });

    it('POST /repos/:id/pulls/:number/reviews rejects review from non-owner non-collaborator with 403', async () => {
      const app = await buildApp('user-99'); // user-99 is not owner and not collaborator

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/reviews',
        payload: {
          status: 'COMMENTED',
          body: 'Unauthorized review',
        },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('POST /repos/:id/pulls/:number/merge blocked when requiredApprovals: 1 and 0 approvals exist', async () => {
      const app = await buildApp('user-1');
      prisma.branchProtection.findMany.mockResolvedValue([
        {
          id: 'bp-1',
          repoId: 'repo-1',
          branchPattern: 'main',
          requiredApprovals: 1,
          requireStatusChecks: false,
        },
      ]);
      prisma.review.count.mockResolvedValue(0);

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/merge',
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BRANCH_PROTECTED');
      expect(body.error.message).toContain('Requires 1 approval(s), but only has 0');
    });

    it('POST /repos/:id/pulls/:number/merge succeeds once an approval review is submitted', async () => {
      const app = await buildApp('user-1');
      prisma.branchProtection.findMany.mockResolvedValue([
        {
          id: 'bp-1',
          repoId: 'repo-1',
          branchPattern: 'main',
          requiredApprovals: 1,
          requireStatusChecks: false,
        },
      ]);
      prisma.review.count.mockResolvedValue(1);

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/merge',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.state).toBe('merged');
      expect(prisma.review.count).toHaveBeenCalledWith({
        where: {
          prId: 'pr-1',
          status: 'APPROVED',
          reviewerId: { not: 'user-1' },
        },
      });
      expect(prisma.pullRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'MERGED',
          }),
        }),
      );
    });

    it('POST /repos/:id/pulls/:number/merge blocked when requireStatusChecks: true and CI has not passed', async () => {
      const app = await buildApp('user-1');
      prisma.branchProtection.findMany.mockResolvedValue([
        {
          id: 'bp-1',
          repoId: 'repo-1',
          branchPattern: 'main',
          requiredApprovals: 0,
          requireStatusChecks: true,
        },
      ]);
      prisma.ciRun.findFirst.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/merge',
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BRANCH_PROTECTED');
      expect(body.error.message).toBe('Required status checks have not passed');
    });

    it('POST /repos/:id/pulls/:number/merge succeeds when requireStatusChecks: true and CI has passed', async () => {
      const app = await buildApp('user-1');
      prisma.branchProtection.findMany.mockResolvedValue([
        {
          id: 'bp-1',
          repoId: 'repo-1',
          branchPattern: 'main',
          requiredApprovals: 0,
          requireStatusChecks: true,
        },
      ]);
      prisma.ciRun.findFirst.mockResolvedValue({
        id: 'run-1',
        repoId: 'repo-1',
        branch: 'feat/test',
        commitSha: '1111111111111111111111111111111111111111',
        status: 'SUCCESS',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/merge',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.state).toBe('merged');
    });

    it('GET /repos/:id/branch-protection returns branch protection rules', async () => {
      const app = await buildApp('user-1');
      prisma.branchProtection.findMany.mockResolvedValueOnce([MOCK_BRANCH_PROTECTION]);

      const res = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/branch-protection',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([
        expect.objectContaining({
          id: 'bp-1',
          repoId: 'repo-1',
          branchPattern: 'main',
          requiredApprovals: 1,
          requireStatusChecks: false,
        }),
      ]);
    });

    it('POST /repos/:id/branch-protection creates branch protection rule', async () => {
      const app = await buildApp('user-1');

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/branch-protection',
        payload: {
          branchPattern: 'main',
          requiredApprovals: 2,
          requireStatusChecks: true,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.branchPattern).toBe('main');
      expect(body.data.requiredApprovals).toBe(2);
      expect(body.data.requireStatusChecks).toBe(true);
      expect(prisma.branchProtection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            repoId: 'repo-1',
            branchPattern: 'main',
            requiredApprovals: 2,
            requireStatusChecks: true,
          }),
        }),
      );
    });

    it('POST /repos/:id/branch-protection updates existing rule when pattern matches', async () => {
      const app = await buildApp('user-1');
      prisma.branchProtection.findFirst.mockResolvedValueOnce(MOCK_BRANCH_PROTECTION);

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/branch-protection',
        payload: {
          branchPattern: 'main',
          requiredApprovals: 3,
          requireStatusChecks: false,
        },
      });

      expect([200, 201]).toContain(res.statusCode);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(prisma.branchProtection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bp-1' },
          data: expect.objectContaining({
            requiredApprovals: 3,
            requireStatusChecks: false,
          }),
        }),
      );
    });

    it('POST /repos/:id/branch-protection rejects non-owner non-admin with 403', async () => {
      const app = await buildApp('user-2');

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/branch-protection',
        payload: {
          branchPattern: 'main',
          requiredApprovals: 1,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('DELETE /repos/:id/branch-protection/:ruleId deletes rule by ID', async () => {
      const app = await buildApp('user-1');

      const res = await app.inject({
        method: 'DELETE',
        url: '/repos/repo-1/branch-protection/bp-1',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Branch protection rule deleted');
      expect(prisma.branchProtection.delete).toHaveBeenCalledWith({
        where: { id: 'bp-1' },
      });
    });

    it('DELETE /repos/:id/branch-protection/:ruleId rejects non-owner non-admin with 403', async () => {
      const app = await buildApp('user-2');

      const res = await app.inject({
        method: 'DELETE',
        url: '/repos/repo-1/branch-protection/bp-1',
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });
  });
});
