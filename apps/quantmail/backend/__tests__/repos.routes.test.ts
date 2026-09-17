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
      upsert: vi.fn().mockImplementation(async ({ create, update }: any) => ({
        id: 'branch-1',
        ...create,
        ...update,
        isProtected: false,
      })),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        username: 'kundan',
        displayName: 'Kundan Singh',
        email: 'kundan@example.test',
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
  app.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(reposRoutes, { prefix: '/repos' });
  await app.ready();
  return app;
}

describe('QuantGit Database-Backed Repos Routes', () => {
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
        sha: '948e3612',
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

  it('POST /repos/:id/actions/trigger triggers a new CI run', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/actions/trigger',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('in_progress');
    expect(prisma.ciRun.create).toHaveBeenCalled();
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
});
