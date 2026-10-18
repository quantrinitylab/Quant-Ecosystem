// @vitest-environment node
// ============================================================================
// /repos — QuantGit backend database-driven routes test suite.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import reposRoutes, { resetRepoStores, seedSecurityAlertsForTests, seedCodeqlAlertsForTests, seedSecretAlertsForTests } from '../routes/repos';
import type { BackendSecurityAlert, BackendCodeqlAlert, BackendSecretAlert } from '../routes/repos';
import { GitProvisioningAdapter } from '../modules/code/adapters/repository.adapter';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Real bare-git fixture for merge-honesty tests. The merge endpoint must
// perform a REAL git merge; this stands up a throwaway bare repo under
// GIT_REPOS_PATH so the endpoint's git plumbing genuinely executes.
// (MOCK_REPO has ownerId 'user-1', name 'Quant-Ecosystem', and
//  MOCK_PR merges source 'feat/test' into target 'main'.)
// ---------------------------------------------------------------------------
let mergeFixtureDir = '';
async function ensureMergeFixture(): Promise<string> {
  if (mergeFixtureDir) return mergeFixtureDir;
  const root = await mkdtemp(join(tmpdir(), 'qm-merge-route-'));
  const bare = join(root, 'user-1', 'Quant-Ecosystem.git');
  const work = join(root, 'work');
  await mkdir(join(root, 'user-1'), { recursive: true });
  const git = (args: string[], cwd?: string) => execFileAsync('git', args, { cwd });
  await git(['init', '--bare', '--initial-branch=main', bare]);
  await git(['clone', bare, work]);
  const w = (args: string[]) => git(args, work);
  await w(['config', 'user.email', 'test@example.test']);
  await w(['config', 'user.name', 'Test']);
  await w(['checkout', '-b', 'main']);
  await writeFile(join(work, 'file.txt'), 'base line\n');
  await w(['add', 'file.txt']);
  await w(['commit', '-m', 'init']);
  await w(['push', '-u', 'origin', 'main']);
  // feat/test touches a NEW file so merges are genuinely clean.
  await w(['checkout', '-b', 'feat/test']);
  await writeFile(join(work, 'file2.txt'), 'clean addition\n');
  await w(['add', 'file2.txt']);
  await w(['commit', '-m', 'clean change']);
  await w(['push', '-u', 'origin', 'feat/test']);
  process.env.GIT_REPOS_PATH = root;
  mergeFixtureDir = root;
  return root;
}
async function destroyMergeFixture(): Promise<void> {
  delete process.env.GIT_REPOS_PATH;
  if (mergeFixtureDir) {
    await rm(mergeFixtureDir, { recursive: true, force: true });
    mergeFixtureDir = '';
  }
}

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
  // Behavioural star store: the routes must derive the count from these rows,
  // so the fake keeps real set semantics instead of returning canned numbers.
  const starRows = new Set<string>();
  return {
    repositoryStar: {
      upsert: vi.fn().mockImplementation(async ({ where }: any) => {
        const { repositoryId, userId } = where.repositoryId_userId;
        starRows.add(`${repositoryId}:${userId}`);
        return { id: `star-${starRows.size}`, repositoryId, userId, createdAt: new Date() };
      }),
      deleteMany: vi.fn().mockImplementation(async ({ where }: any) => {
        const existed = starRows.delete(`${where.repositoryId}:${where.userId}`);
        return { count: existed ? 1 : 0 };
      }),
      count: vi
        .fn()
        .mockImplementation(
          async ({ where }: any) =>
            [...starRows].filter((row) => row.startsWith(`${where.repositoryId}:`)).length,
        ),
      findUnique: vi.fn().mockResolvedValue(null),
    },
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
        if (data.forkCount?.increment) {
          return { ...MOCK_REPO, forkCount: MOCK_REPO.forkCount + data.forkCount.increment };
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
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
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
      delete: vi.fn().mockImplementation(async ({ where }: any) => ({
        id: 'branch-old',
        repoId: where?.repoId_name?.repoId ?? 'repo-1',
        name: where?.repoId_name?.name ?? 'feat-old',
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
        // Routes may pass the email filter as a plain string or as
        // `{ equals, mode: 'insensitive' }`. This double emulates the
        // Postgres case-insensitive semantics by comparing lowercased values,
        // so a legacy mixed-case row resolves from a lowercase lookup.
        const emailArg =
          typeof where?.email === 'object' && where.email !== null
            ? where.email.equals
            : where?.email;
        const email =
          typeof emailArg === 'string' ? emailArg.toLowerCase() : undefined;
        if (email === 'kundan@example.test' || where?.id === 'user-1') {
          return {
            id: 'user-1',
            username: 'kundan',
            displayName: 'Kundan Singh',
            email: 'kundan@example.test',
            avatarUrl: 'https://example.test/avatar.png',
          };
        }
        if (email === 'collab@example.test' || where?.id === 'user-2') {
          return {
            id: 'user-2',
            username: 'collab',
            displayName: 'Collaborator User',
            email: 'collab@example.test',
            avatarUrl: 'https://example.test/avatar.png',
          };
        }
        if (email === 'collab-admin@example.test' || where?.id === 'user-3') {
          return {
            id: 'user-3',
            username: 'collabadmin',
            displayName: 'Collaborator Admin',
            email: 'collab-admin@example.test',
            avatarUrl: null,
          };
        }
        // Legacy row predating email normalization: mixed case on disk.
        if (email === 'legacycase@quantmail.in' || where?.id === 'user-legacy') {
          return {
            id: 'user-legacy',
            username: 'legacycase',
            displayName: 'Legacy Case',
            email: 'LegacyCase@quantmail.in',
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
  app.decorate('repositoryInspection', {
    listTree: vi.fn().mockResolvedValue([]),
    readBlob: vi.fn().mockResolvedValue({
      path: 'src/index.ts',
      content: 'export const answer = 42;\n',
      size: 27,
      sha: '3333333333333333333333333333333333333333',
    }),
    listCommits: vi.fn().mockResolvedValue([]),
    searchCode: vi.fn().mockImplementation(async ({ query }: any) => {
      if (query.toLowerCase().includes('answer')) {
        return [{ path: 'src/index.ts', lineNumber: 1, lineContent: 'export const answer = 42;' }];
      }
      return [];
    }),
    ...(extraDecorators.repositoryInspection || {}),
  } as never);
  for (const [key, val] of Object.entries(extraDecorators)) {
    if (key !== 'repositoryInspection') {
      app.decorate(key, val as never);
    }
  }
  app.addHook('onRequest', async (request) => {
    const overrideUser = (request.headers['x-user-id'] as string) || userId;
    if (overrideUser)
      (request as unknown as { auth: { userId: string } }).auth = { userId: overrideUser };
  });
  await app.register(reposRoutes, { prefix: '/repos' });
  await app.register(reposRoutes, { prefix: '/api/repos' });
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

  it('GET /repos dev seeding creates sample repos with zero engagement counts (QM-UIUX-068)', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSeeding = process.env.ENABLE_DEV_REPO_SEEDING;

    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEV_REPO_SEEDING = 'true';

    try {
      const app = await buildApp();
      // Empty database: the dev seeding path must run.
      prisma.repository.count.mockResolvedValue(0);

      const res = await app.inject({ method: 'GET', url: '/repos' });
      expect(res.statusCode).toBe(200);

      // The four dev-fixture repos are still seeded…
      expect(prisma.repository.create).toHaveBeenCalledTimes(4);
      const seededNames = (prisma.repository.create as any).mock.calls.map(
        (call: any) => call[0].data.name,
      );
      expect(seededNames).toEqual([
        'Quant-Ecosystem',
        'quantmail-core',
        'quantchat-meet',
        'quant-mobile-android',
      ]);

      // …but never with fabricated engagement. starCount/forkCount must be
      // absent (Prisma @default(0)) or explicitly 0 — real counts only ever
      // come from Prisma-backed RepositoryStar rows and real forks.
      for (const call of (prisma.repository.create as any).mock.calls) {
        const data = call[0].data;
        expect(data.starCount ?? 0).toBe(0);
        expect(data.forkCount ?? 0).toBe(0);
        expect([342, 128, 95, 76]).not.toContain(data.starCount);
        expect([48, 19, 12, 8]).not.toContain(data.forkCount);
      }
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

  it('POST /repos persists the repo and GET /repos lists it (QM-UIUX-077)', async () => {
    const app = await buildApp();
    const store: any[] = [];
    prisma.repository.findFirst.mockResolvedValue(null);
    prisma.repository.create.mockImplementation(async ({ data }: any) => {
      const row = {
        id: 'repo-audit-test',
        ...data,
        branches: [],
        starCount: 0,
        forkCount: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.push(row);
      return row;
    });
    prisma.repository.findMany.mockImplementation(async () =>
      store.filter((r) => r.deletedAt === null),
    );
    prisma.repository.count.mockImplementation(async () => store.length);

    const created = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: {
        name: 'audit-test-repo',
        description: 'Regression: creation must persist and list',
        visibility: 'private',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().success).toBe(true);

    const listed = await app.inject({ method: 'GET', url: '/repos' });
    const body = listed.json();
    expect(listed.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.map((r: any) => r.name)).toContain('audit-test-repo');
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
    // Idempotency guard miss: no OPEN PR exists for this branch pair.
    prisma.pullRequest.findFirst.mockResolvedValueOnce(null);
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
    expect(body.deduplicated).toBeFalsy();
    expect(body.data.branchSource).toBe('feat/test');
    expect(prisma.pullRequest.create).toHaveBeenCalled();
  });

  it('POST /repos/:id/pulls is idempotent: an existing OPEN PR for the same source/target branch pair is returned instead of creating a duplicate', async () => {
    const app = await buildApp();
    // Default mock: pullRequest.findFirst resolves MOCK_PR (OPEN,
    // feat/test -> main) — the guard hits for this branch pair.
    const createsBefore = prisma.pullRequest.create.mock.calls.length;
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/pulls',
      payload: {
        title: 'Duplicate attempt',
        body: 'Should not create PR #2',
        sourceBranch: 'feat/test',
        targetBranch: 'main',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.deduplicated).toBe(true);
    expect(body.data.number).toBe(1);
    expect(body.data.branchSource).toBe('feat/test');
    expect(body.data.branchTarget).toBe('main');
    // The sequential double-fire (commit handler + modal) must not consume
    // another PR number: create must not have run for this request.
    expect(prisma.pullRequest.create.mock.calls.length).toBe(createsBefore);
  });

  it('POST /repos/:id/pulls still creates (201) when the existing PR is CLOSED or the branch pair differs', async () => {
    const app = await buildApp();
    // Guard miss: no OPEN PR on this branch pair.
    prisma.pullRequest.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/pulls',
      payload: {
        title: 'Second PR',
        body: 'Different branch pair',
        sourceBranch: 'feat/other',
        targetBranch: 'main',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    expect(res.json().deduplicated).toBeFalsy();
    expect(prisma.pullRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceBranch: 'feat/other',
          targetBranch: 'main',
        }),
      }),
    );
  });

  it('POST /repos/:id/star is idempotent and derives the count from the star table', async () => {
    const app = await buildApp();

    const first = await app.inject({ method: 'POST', url: '/repos/repo-1/star' });
    expect(first.statusCode).toBe(200);
    expect(first.json().success).toBe(true);
    expect(first.json().data).toEqual(
      expect.objectContaining({ id: 'repo-1', stars: 1, starred: true }),
    );

    // Replaying the request must not inflate the counter.
    const second = await app.inject({ method: 'POST', url: '/repos/repo-1/star' });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.stars).toBe(1);

    expect(prisma.repositoryStar.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.repository.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { starCount: 1 } }),
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

  it('POST /repos/:id/branches returns 409 BRANCH_EXISTS when the name is taken', async () => {
    // fix/qm-commit-existing-branch-check: the frontend commit-to-new-branch
    // flow keys its "stop before committing" guard on this exact contract —
    // a 409 whose error.code is BRANCH_EXISTS. Do not rename the code or
    // fold it into a generic 409 without updating the frontend guard.
    const app = await buildApp();
    prisma.branch.findFirst.mockResolvedValueOnce({
      id: 'branch-taken',
      repoId: 'repo-1',
      name: 'taken-name',
      commitSha: '1111111111111111111111111111111111111111',
      isProtected: false,
    } as never);
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/branches',
      payload: {
        name: 'taken-name',
        sha: '948e361200000000000000000000000000000000',
      },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('BRANCH_EXISTS');
    expect(prisma.branch.create).not.toHaveBeenCalled();
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

  it('POST /repos/:id/branches forks from the named source branch (AUD-P0-G3)', async () => {
    const app = await buildApp();
    prisma.branch.findUnique.mockResolvedValueOnce({
      id: 'branch-develop',
      repoId: 'repo-1',
      name: 'develop',
      commitSha: '5555555555555555555555555555555555555555',
      isProtected: false,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/branches',
      payload: {
        name: 'feat/from-develop',
        sourceBranch: 'develop',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ name: 'feat/from-develop' }),
      }),
    );
    expect(prisma.branch.create).toHaveBeenCalledWith({
      data: {
        repoId: 'repo-1',
        name: 'feat/from-develop',
        commitSha: '5555555555555555555555555555555555555555',
      },
    });
  });

  it('POST /repos/:id/branches returns 400 when the source branch does not exist (AUD-P0-G3)', async () => {
    const app = await buildApp();
    prisma.branch.findUnique.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/branches',
      payload: {
        name: 'feat/ghost-source',
        sourceBranch: 'no-such-branch',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'BRANCH_NOT_FOUND',
        }),
      }),
    );
    expect(prisma.branch.create).not.toHaveBeenCalled();
  });

  it('DELETE /repos/:id/branches/:branch deletes the branch (AUD-P0-G3)', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'DELETE',
      url: '/repos/repo-1/branches/feat-old',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ deleted: true, name: 'feat-old' }),
      }),
    );
    expect(prisma.branch.delete).toHaveBeenCalledWith({
      where: { repoId_name: { repoId: 'repo-1', name: 'feat-old' } },
    });
  });

  it('DELETE /repos/:id/branches/:branch refuses to delete the default branch (AUD-P0-G3)', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'DELETE',
      url: '/repos/repo-1/branches/main',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'CANNOT_DELETE_DEFAULT_BRANCH',
        }),
      }),
    );
    expect(prisma.branch.delete).not.toHaveBeenCalled();
  });

  it('DELETE /repos/:id/branches/:branch refuses to delete a branch flagged isProtected with 403 BRANCH_PROTECTED', async () => {
    const app = await buildApp();
    prisma.branch.findUnique.mockResolvedValueOnce({
      id: 'branch-2',
      repoId: 'repo-1',
      name: 'release',
      commitSha: '2222222222222222222222222222222222222222',
      isProtected: true,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    } as never);

    const response = await app.inject({
      method: 'DELETE',
      url: '/repos/repo-1/branches/release',
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
    expect(prisma.branch.delete).not.toHaveBeenCalled();
  });

  it('DELETE /repos/:id/branches/:branch refuses to delete a branch matched by a protection rule with 403 BRANCH_PROTECTED', async () => {
    const app = await buildApp();
    prisma.branchProtection.findMany.mockResolvedValueOnce([
      { ...MOCK_BRANCH_PROTECTION, id: 'bp-2', branchPattern: 'feat-*' },
    ]);

    const response = await app.inject({
      method: 'DELETE',
      url: '/repos/repo-1/branches/feat-old',
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
    expect(prisma.branch.delete).not.toHaveBeenCalled();
  });

  it('DELETE /repos/:id/branches/:branch rejects a caller without write permission with 403', async () => {
    const app = await buildApp('user-9');

    const response = await app.inject({
      method: 'DELETE',
      url: '/repos/repo-1/branches/feat-old',
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
    expect(prisma.branch.delete).not.toHaveBeenCalled();
  });

  it('DELETE /repos/:id/branches/:branch returns 404 for an unknown branch (AUD-P0-G3)', async () => {
    const app = await buildApp();
    prisma.branch.findUnique.mockResolvedValueOnce(null as never);

    const response = await app.inject({
      method: 'DELETE',
      url: '/repos/repo-1/branches/no-such-branch',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'BRANCH_NOT_FOUND',
        }),
      }),
    );
    expect(prisma.branch.delete).not.toHaveBeenCalled();
  });

  it('POST /repos/:id/pulls/:number/merge fails honestly (501 REPO_STORAGE_UNAVAILABLE) when no git repo is on disk — never fabricates a SHA', async () => {
    // Guarantee: no bare repo on disk for this test.
    await destroyMergeFixture();
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/pulls/1/merge',
    });
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('REPO_STORAGE_UNAVAILABLE');
    expect(body.error.message).toContain('remains open');
    // Nothing was persisted: the PR must NOT be marked merged and no fake
    // SHA may be written into any branch row.
    expect(prisma.pullRequest.update).not.toHaveBeenCalled();
    expect(prisma.branch.update).not.toHaveBeenCalled();
    expect(prisma.branch.upsert).not.toHaveBeenCalled();
    // And the honest error body carries no fabricated mergeCommitSha.
    expect(JSON.stringify(body)).not.toContain('mergeCommitSha');
  });

  it('POST /repos/:id/pulls/:number/merge performs a REAL git merge when the bare repo exists — real SHA, no fabrication', async () => {
    const gitRoot = await ensureMergeFixture();
    const bare = join(gitRoot, 'user-1', 'Quant-Ecosystem.git');
    try {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/merge',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.state).toBe('merged');
      const sha: string = body.data.mergeCommitSha;
      expect(sha).toMatch(/^[0-9a-f]{40}$/i);
      expect(sha).not.toBe('2222222222222222222222222222222222222222');
      // The returned SHA is a REAL merge commit in the bare repo (two parents)…
      const { stdout: catOut } = await execFileAsync('git', ['cat-file', '-p', sha], {
        cwd: bare,
      });
      expect(catOut.split('\n').filter((l) => l.startsWith('parent '))).toHaveLength(2);
      // …and the target branch ref was genuinely moved to it.
      const { stdout: refOut } = await execFileAsync('git', ['rev-parse', 'refs/heads/main'], {
        cwd: bare,
      });
      expect(refOut.trim()).toBe(sha);
      // Persisted honestly: PR marked MERGED with the real SHA, target branch
      // row updated with the same real SHA.
      expect(prisma.pullRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'MERGED', mergeCommitSha: sha }),
        }),
      );
      expect(prisma.branch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ commitSha: sha }),
        }),
      );
    } finally {
      // Tear the fixture down immediately so later tests that assume "no git
      // repo on disk" (e.g. V22b null-diff-stats) see a clean environment.
      await destroyMergeFixture();
    }
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

  it('GET /repos/:id/actions computes honest durations, times, names — never invented (QM-SCREEN-013 P1)', async () => {
    const app = await buildApp();
    const now = Date.now();
    prisma.ciRun.findMany.mockResolvedValueOnce([
      {
        id: 'run-1',
        repoId: 'repo-1',
        branch: 'main',
        commitSha: 'a'.repeat(40),
        status: 'SUCCESS',
        triggeredBy: 'kundan',
        startedAt: new Date(now - 330_000),
        completedAt: new Date(now - 35_000), // 295s -> '4m 55s' by real math
        createdAt: new Date(now - 2 * 3_600_000),
        jobs: [
          {
            id: 'job-1',
            name: 'build',
            status: 'SUCCESS',
            startedAt: new Date(now - 300_000),
            completedAt: new Date(now - 170_000), // 130s -> '2m 10s' by real math
          },
        ],
      },
      {
        id: 'run-2',
        repoId: 'repo-1',
        branch: 'main',
        commitSha: 'b'.repeat(40),
        status: 'PENDING',
        triggeredBy: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(now - 30_000),
        jobs: [],
      },
    ]);
    const res = await app.inject({ method: 'GET', url: '/repos/repo-1/actions' });
    expect(res.statusCode).toBe(200);
    const [first, second] = res.json().data;
    // Real computed values — never the old hardcoded '4m 55s' / 'recently'.
    expect(first.duration).toBe('4m 55s');
    expect(first.timeAgo).toBe('2h ago');
    expect(first.name).toBe('Build triggered by kundan');
    expect(first.actor).toBe('kundan');
    expect(first.workflow).toBe('build');
    expect(first.jobs[0].duration).toBe('2m 10s');
    // Missing data renders honest placeholders — never invented names/times.
    expect(second.name).toBe('Unknown');
    expect(second.actor).toBeNull();
    expect(second.duration).toBe('—');
    expect(second.timeAgo).toBe('just now');
    expect(second.workflow).toBe('—');
    expect(second.jobs).toEqual([]);
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

  it('POST /repos/:id/collaborators resolves a legacy mixed-case user by email case-insensitively', async () => {
    const app = await buildApp('user-1');

    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/collaborators',
      payload: {
        email: 'legacycase@quantmail.in',
        role: 'WRITE',
      },
    });

    // The seeded row stores `LegacyCase@quantmail.in` (mixed case, predating
    // email normalization). A case-exact lookup would 404 with
    // USER_NOT_FOUND; the insensitive lookup must resolve it.
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      success: true,
      data: {
        id: expect.any(String),
        userId: 'user-legacy',
        role: 'WRITE',
        user: {
          displayName: 'Legacy Case',
          email: 'LegacyCase@quantmail.in',
          avatarUrl: null,
        },
      },
    });

    // The lookup must go out as a case-insensitive Postgres filter, not a
    // case-exact match on the raw input.
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { equals: 'legacycase@quantmail.in', mode: 'insensitive' },
        },
      }),
    );
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

    it('V22: PR list/create endpoints return null (unknown) for additions/deletions/changedFiles and checksStatus none', async () => {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/pulls',
      });

      expect(res.statusCode).toBe(200);
      const pr = res.json().data[0];
      // List responses never compute diff stats — null (unknown), never
      // invented zeros. Frontend renders '—'.
      expect(pr.additions).toBeNull();
      expect(pr.deletions).toBeNull();
      expect(pr.changedFiles).toBeNull();
      expect(pr.checksStatus).toBe('none');
    });

    it('V22b: GET /repos/:id/pulls/:number returns null diff stats when the git diff cannot be computed', async () => {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/pulls/1',
      });

      expect(res.statusCode).toBe(200);
      const pr = res.json().data;
      // No local git checkout exists for the fixture repo, so the diff cannot
      // be measured — report unknown (null), never a fabricated 0.
      expect(pr.additions).toBeNull();
      expect(pr.deletions).toBeNull();
      expect(pr.changedFiles).toBeNull();
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

    it('V24: DELETE /repos/:id/star removes only the caller row and cannot go negative', async () => {
      const app = await buildApp('user-1');

      await app.inject({ method: 'POST', url: '/repos/repo-1/star' });

      const unstarRes = await app.inject({
        method: 'DELETE',
        url: '/repos/repo-1/star',
      });

      expect(unstarRes.statusCode).toBe(200);
      expect(unstarRes.json()).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 'repo-1', stars: 0, starred: false }),
        }),
      );

      // Unstarring what the caller never starred is a no-op, not a decrement of
      // somebody else's star.
      const repeatRes = await app.inject({
        method: 'DELETE',
        url: '/repos/repo-1/star',
      });

      expect(repeatRes.statusCode).toBe(200);
      expect(repeatRes.json().data.stars).toBe(0);
      expect(prisma.repository.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: { starCount: 0 } }),
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
      await ensureMergeFixture();
      try {
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
      } finally {
        await destroyMergeFixture();
      }
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
      await ensureMergeFixture();
      try {
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
      } finally {
        await destroyMergeFixture();
      }
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

  // ==================== REPOSITORY & CODE SEARCH (Wave 16) ====================

  describe('Repository & Code Search (Wave 16)', () => {
    it('GET /repos/search returns matching public repos and caller repos', async () => {
      const app = await buildApp('user-1');

      const publicRepo = {
        ...MOCK_REPO,
        id: 'repo-pub',
        name: 'quant-public-tool',
        description: 'Public tools for Quant Ecosystem',
        visibility: 'PUBLIC',
        ownerId: 'user-9',
      };

      const callerPrivateRepo = {
        ...MOCK_REPO,
        id: 'repo-priv-mine',
        name: 'quant-caller-secret',
        description: 'Caller secret repo',
        visibility: 'PRIVATE',
        ownerId: 'user-1',
      };

      const otherPrivateRepo = {
        ...MOCK_REPO,
        id: 'repo-priv-other',
        name: 'quant-other-secret',
        description: 'Other user secret repo',
        visibility: 'PRIVATE',
        ownerId: 'user-9',
      };

      prisma.repository.findMany.mockResolvedValueOnce([
        publicRepo,
        callerPrivateRepo,
        otherPrivateRepo,
      ]);

      const res = await app.inject({
        method: 'GET',
        url: '/repos/search?q=quant',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.totalCount).toBe(2);
      expect(body.data.repos).toHaveLength(2);
      const ids = body.data.repos.map((r: any) => r.id);
      expect(ids).toContain('repo-pub');
      expect(ids).toContain('repo-priv-mine');
      expect(ids).not.toContain('repo-priv-other');
    });

    it('GET /repos/search excludes private repos caller does not have access to', async () => {
      const app = await buildApp('user-2');

      const otherPrivateRepo = {
        ...MOCK_REPO,
        id: 'repo-priv-other',
        name: 'quant-super-secret',
        description: 'Super secret project',
        visibility: 'PRIVATE',
        ownerId: 'user-1',
      };

      prisma.repository.findMany.mockResolvedValueOnce([otherPrivateRepo]);

      const res = await app.inject({
        method: 'GET',
        url: '/repos/search?q=secret',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.totalCount).toBe(0);
      expect(body.data.repos).toHaveLength(0);
    });

    it('GET /repos/:id/search returns matching code lines from repo commits', async () => {
      const app = await buildApp('user-1');

      const res = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/search?q=answer',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.query).toBe('answer');
      expect(body.data.branch).toBe('main');
      expect(body.data.totalMatches).toBe(1);
      expect(body.data.matches).toEqual([
        {
          path: 'src/index.ts',
          lineNumber: 1,
          lineContent: 'export const answer = 42;',
        },
      ]);
    });

    it('GET /repos/:id/search rejects 400 when query q is missing', async () => {
      const app = await buildApp('user-1');

      const resMissing = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/search',
      });

      expect(resMissing.statusCode).toBe(400);
      expect(resMissing.json().error.code).toBe('VALIDATION_FAILED');
      expect(resMissing.json().error.message).toBe('Search query q is required');

      const resEmpty = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/search?q=%20%20',
      });

      expect(resEmpty.statusCode).toBe(400);
      expect(resEmpty.json().error.code).toBe('VALIDATION_FAILED');
      expect(resEmpty.json().error.message).toBe('Search query q is required');
    });

    it('GET /repos/search rejects 400 when query q is missing', async () => {
      const app = await buildApp('user-1');

      const resMissing = await app.inject({
        method: 'GET',
        url: '/repos/search',
      });

      expect(resMissing.statusCode).toBe(400);
      expect(resMissing.json().error.code).toBe('VALIDATION_FAILED');
      expect(resMissing.json().error.message).toBe('Search query q is required');
    });
  });

  describe('Webhooks Suite (Task G16)', () => {
    beforeEach(() => {
      resetRepoStores();
    });

    it('GET /repos/:id/hooks returns empty array initially', async () => {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/hooks',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().data).toEqual([]);
    });

    it('POST /repos/:id/hooks creates a new webhook and GET returns it', async () => {
      const app = await buildApp('user-1');
      const createRes = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/hooks',
        payload: {
          url: 'https://ci.example.com/webhook',
          secret: 'supersecret',
          events: ['push', 'pull_request'],
          active: true,
        },
      });

      expect(createRes.statusCode).toBe(201);
      const hook = createRes.json().data;
      expect(hook.id).toMatch(/^hook_/);
      expect(hook.url).toBe('https://ci.example.com/webhook');
      expect(hook.secret).toBe('supersecret');
      expect(hook.events).toEqual(['push', 'pull_request']);
      expect(hook.active).toBe(true);

      const listRes = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/hooks',
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().data).toHaveLength(1);
      expect(listRes.json().data[0].id).toBe(hook.id);
    });

    it('POST /repos/:id/hooks validates payload and rejects invalid URL', async () => {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/hooks',
        payload: {
          url: 'not-a-valid-url',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('POST /repos/:id/hooks/:hookId/test sends ping payload', async () => {
      const app = await buildApp('user-1');
      const createRes = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/hooks',
        payload: {
          url: 'https://example.com/test-endpoint',
          secret: 'pingsecret',
        },
      });
      const hook = createRes.json().data;

      // Mock global fetch for test dispatch
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as any);

      try {
        const testRes = await app.inject({
          method: 'POST',
          url: `/repos/repo-1/hooks/${hook.id}/test`,
        });

        expect(testRes.statusCode).toBe(200);
        expect(testRes.json().success).toBe(true);
        expect(testRes.json().data.event).toBe('ping');
        expect(testRes.json().data.status).toBe(200);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('DELETE /repos/:id/hooks/:hookId deletes webhook and returns 404 on missing', async () => {
      const app = await buildApp('user-1');
      const createRes = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/hooks',
        payload: {
          url: 'https://delete.example.com/hook',
        },
      });
      const hook = createRes.json().data;

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/repos/repo-1/hooks/${hook.id}`,
      });
      expect(delRes.statusCode).toBe(200);

      // Verify it's gone
      const listRes = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/hooks',
      });
      expect(listRes.json().data).toHaveLength(0);

      // Second delete returns 404
      const secondDel = await app.inject({
        method: 'DELETE',
        url: `/repos/repo-1/hooks/${hook.id}`,
      });
      expect(secondDel.statusCode).toBe(404);
      expect(secondDel.json().error.code).toBe('HOOK_NOT_FOUND');
    });
  });

  describe('Repository Forks Engine (Task G13)', () => {
    it('POST /repos/:id/forks creates a fork and increments parent forkCount', async () => {
      const app = await buildApp('user-2');
      const mockCreatedFork = {
        ...MOCK_REPO,
        id: 'repo-fork-1',
        ownerId: 'user-2',
        name: 'Quant-Ecosystem',
        description: 'The unified ecosystem monorepo [forked from Quant-Ecosystem]',
        forkCount: 0,
        starCount: 0,
        branches: [
          { id: 'b-1', name: 'main', commitSha: '1111111111111111111111111111111111111111' },
        ],
      };
      prisma.repository.create.mockResolvedValueOnce(mockCreatedFork);

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/forks',
        payload: {},
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('repo-fork-1');
      expect(body.data.ownerId).toBe('user-2');
      expect(body.data.isFork).toBe(true);

      expect(prisma.repository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'repo-1' },
          data: { forkCount: { increment: 1 } },
        }),
      );
      expect(prisma.branch.create).toHaveBeenCalled();
    });

    it('POST /repos/:id/forks provisions real git storage and clones the source history', async () => {
      // Real end-to-end storage: a real bare source repo under GIT_REPOS_PATH
      // with one real commit, and the REAL provisioning adapter (not the mock).
      const root = await mkdtemp(join(tmpdir(), 'qm-fork-route-'));
      const srcBare = join(root, 'user-1', 'Quant-Ecosystem.git');
      const work = join(root, 'work');
      await mkdir(join(root, 'user-1'), { recursive: true });
      const git = (args: string[], cwd?: string) => execFileAsync('git', args, { cwd });
      await git(['init', '--bare', '--initial-branch=main', srcBare]);
      await git(['clone', srcBare, work]);
      const w = (args: string[]) => git(args, work);
      await w(['config', 'user.email', 'test@example.test']);
      await w(['config', 'user.name', 'Test']);
      await w(['checkout', '-b', 'main']);
      await writeFile(join(work, 'file.txt'), 'fork me\n');
      await w(['add', 'file.txt']);
      await w(['commit', '-m', 'init']);
      await w(['push', '-u', 'origin', 'main']);
      const { stdout: revOut } = await git(['rev-parse', 'HEAD'], work);
      const headSha = revOut.trim();

      const prevGitPath = process.env.GIT_REPOS_PATH;
      process.env.GIT_REPOS_PATH = root;
      let app: Awaited<ReturnType<typeof buildApp>> | null = null;
      try {
        // RepoStorageService reads GIT_REPOS_PATH at construction time.
        const realProvisioning = new GitProvisioningAdapter();
        app = await buildApp('user-2');
        // Swap in the real adapter after build (buildApp pre-decorates a mock).
        (app as any).repositoryProvisioning = realProvisioning;
        prisma.repository.create.mockResolvedValueOnce({
          ...MOCK_REPO,
          id: 'repo-fork-real',
          ownerId: 'user-2',
          name: 'fork-real',
          description: 'x [forked from Quant-Ecosystem]',
          forkCount: 0,
          starCount: 0,
          storagePathUrl: null,
          branches: [],
        });
        // Source repo's branch rows carry the REAL commit SHA.
        prisma.branch.findMany.mockResolvedValueOnce([
          { name: 'main', commitSha: headSha, isProtected: false },
        ]);

        const res = await app.inject({
          method: 'POST',
          url: '/repos/repo-1/forks',
          payload: { name: 'fork-real' },
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data.id).toBe('repo-fork-real');
        expect(body.data.storageReady).toBe(true);

        // The fork's bare repo exists on disk and the branch SHA resolves to
        // the real commit cloned from the source.
        const forkBare = join(root, 'user-2', 'fork-real.git');
        const { stdout: forkHead } = await execFileAsync(
          'git',
          ['rev-parse', '--verify', 'refs/heads/main^{commit}'],
          { cwd: forkBare },
        );
        expect(forkHead.trim()).toBe(headSha);

        // storagePathUrl was persisted honestly — pointing at the real fork
        // bare repo, not a fabricated path.
        const updateCalls = prisma.repository.update.mock.calls.filter(
          (c: any) => c[0]?.where?.id === 'repo-fork-real',
        );
        expect(updateCalls.length).toBeGreaterThanOrEqual(1);
        expect(updateCalls[updateCalls.length - 1][0].data.storagePathUrl).toContain(
          'fork-real.git',
        );
      } finally {
        if (app) await app.close();
        if (prevGitPath === undefined) delete process.env.GIT_REPOS_PATH;
        else process.env.GIT_REPOS_PATH = prevGitPath;
        await rm(root, { recursive: true, force: true });
      }
    });

    it('POST /repos/:id/forks honestly reports storageReady:false when provisioning fails', async () => {
      const failingProvisioning = {
        provision: vi.fn().mockRejectedValue(new Error('disk full')),
        archive: vi.fn().mockResolvedValue({ storagePath: null }),
        destroy: vi.fn().mockResolvedValue(undefined),
      };
      const app = await buildApp('user-2');
      // Swap in the failing adapter after build (buildApp pre-decorates a mock).
      (app as any).repositoryProvisioning = failingProvisioning;
      prisma.repository.create.mockResolvedValueOnce({
        ...MOCK_REPO,
        id: 'repo-fork-fail',
        ownerId: 'user-2',
        name: 'fork-fail',
        description: 'x [forked from Quant-Ecosystem]',
        forkCount: 0,
        starCount: 0,
        storagePathUrl: null,
        branches: [{ name: 'main', commitSha: '1111111111111111111111111111111111111111' }],
      });

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/forks',
        payload: { name: 'fork-fail' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('repo-fork-fail');
      // Honest: the fork exists but its git storage is not ready — no
      // fabricated path, no silent success.
      expect(body.data.storageReady).toBe(false);
      const updateCalls = prisma.repository.update.mock.calls.filter(
        (c: any) => c[0]?.where?.id === 'repo-fork-fail',
      );
      expect(updateCalls.length).toBeGreaterThanOrEqual(1);
      expect(updateCalls[updateCalls.length - 1][0].data.storagePathUrl).toBeNull();
    });

    it('GET /repos/:id/forks lists forks of the repository', async () => {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/forks',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('POST /repos/:id/forks rejects with 409 REPO_NAME_EXISTS when fork name already exists in account', async () => {
      const app = await buildApp('user-2');
      prisma.repository.findFirst.mockResolvedValueOnce({ id: 'existing-repo-id' } as never);

      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/forks',
        payload: { name: 'Quant-Ecosystem' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('REPO_NAME_EXISTS');
    });

    it('POST /repos/:id/forks rejects unauthenticated requests with 401', async () => {
      const app = await buildApp(null);
      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/forks',
        payload: {},
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Canonical /api/repos Alias (Task G06)', () => {
    it('GET /api/repos lists accessible repositories identically to /repos', async () => {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'GET',
        url: '/api/repos',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0].id).toBe('repo-1');
    });

    it('GET /api/repos/:id fetches repository details via canonical alias', async () => {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'GET',
        url: '/api/repos/repo-1',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('repo-1');
    });
  });

  describe('PR Inline Diff Line-by-Line Code Review Comments (Tasks G11 & G14)', () => {
    it('POST /repos/:id/pulls/:number/comments creates an inline comment on a diff line', async () => {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/comments',
        payload: {
          filePath: 'src/index.ts',
          line: 42,
          side: 'RIGHT',
          body: 'Consider extracting this helper into a separate module.',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.filePath).toBe('src/index.ts');
      expect(body.data.line).toBe(42);
      expect(body.data.body).toBe('Consider extracting this helper into a separate module.');
    });

    it('GET /repos/:id/pulls/:number/comments returns all comments on PR diff', async () => {
      const app = await buildApp('user-1');
      await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/comments',
        payload: {
          filePath: 'src/index.ts',
          line: 42,
          side: 'RIGHT',
          body: 'Consider extracting this helper into a separate module.',
        },
      });
      const res = await app.inject({
        method: 'GET',
        url: '/repos/repo-1/pulls/1/comments',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data[0].filePath).toBe('src/index.ts');
    });

    it('DELETE /repos/:id/pulls/:number/comments/:commentId removes comment', async () => {
      const app = await buildApp('user-1');
      const postRes = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/comments',
        payload: {
          filePath: 'lib/auth.ts',
          line: 15,
          body: 'Temporary review note.',
        },
      });
      const commentId = postRes.json().data.id;

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/repos/repo-1/pulls/1/comments/${commentId}`,
      });

      expect(delRes.statusCode).toBe(200);
      expect(delRes.json()).toEqual({ success: true, data: { deleted: true } });
    });
  });

  describe('PR commentsCount honesty (P1: never an invented zero)', () => {
    beforeEach(() => {
      resetRepoStores();
    });

    async function postComment(app: any, body: string) {
      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/comments',
        payload: { filePath: 'src/index.ts', line: 42, side: 'RIGHT', body },
      });
      expect(res.statusCode).toBe(201);
    }

    it('GET /repos/:id/pulls reports the real review-comment count per PR, not a hardcoded 0', async () => {
      const app = await buildApp('user-1');
      await postComment(app, 'First review note.');
      await postComment(app, 'Second review note.');

      const res = await app.inject({ method: 'GET', url: '/repos/repo-1/pulls' });
      expect(res.statusCode).toBe(200);
      const pr = res.json().data[0];
      // Two real comments exist on this PR — the count must be derived from
      // the comments table, not the old hardcoded 0.
      expect(pr.commentsCount).toBe(2);
    });

    it('GET /repos/:id/pulls reports a genuine 0 only when the PR has no comments', async () => {
      const app = await buildApp('user-1');
      const res = await app.inject({ method: 'GET', url: '/repos/repo-1/pulls' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].commentsCount).toBe(0);
    });

    it('GET /repos/:id/pulls/:number reports the real review-comment count', async () => {
      const app = await buildApp('user-1');
      await postComment(app, 'Detail-page review note.');

      const res = await app.inject({ method: 'GET', url: '/repos/repo-1/pulls/1' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.commentsCount).toBe(1);
    });

    it('POST /repos/:id/pulls/:number/merge reports the real review-comment count', async () => {
      await ensureMergeFixture();
      try {
        const app = await buildApp('user-1');
        await postComment(app, 'Pre-merge review note.');

        const res = await app.inject({ method: 'POST', url: '/repos/repo-1/pulls/1/merge' });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.commentsCount).toBe(1);
      } finally {
        await destroyMergeFixture();
      }
    });

    it('GET /repos/:id/pulls counts reviewComment rows when the Prisma model is available', async () => {
      const app = await buildApp('user-1');
      // Simulate the production client where reviewComment exists: the route
      // must derive the count from reviewComment.count, not invent it.
      const rows = [
        { id: 'c1', prId: 'pr-1' },
        { id: 'c2', prId: 'pr-1' },
        { id: 'c3', prId: 'pr-2' },
      ];
      (prisma as any).reviewComment = {
        count: vi
          .fn()
          .mockImplementation(
            async ({ where }: any) => rows.filter((r) => r.prId === where?.prId).length,
          ),
      };

      const res = await app.inject({ method: 'GET', url: '/repos/repo-1/pulls' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].commentsCount).toBe(2);
      expect((prisma as any).reviewComment.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { prId: 'pr-1' } }),
      );
    });
  });

  // Clean up the throwaway bare-git fixture used by the merge-honesty tests.
  afterAll(() => destroyMergeFixture());
});

describe('PR merge diff-stats honesty (P1: merge response never invents zeros)', () => {
  beforeEach(() => {
    resetRepoStores();
  });

  it('POST /repos/:id/pulls/:number/merge reports null diff stats, not hardcoded zeros', async () => {
    // The merge endpoint now fails honestly (501 REPO_STORAGE_UNAVAILABLE)
    // when no bare repo is on disk — #1081 discipline. These #960/#1078
    // honesty assertions need the real throwaway bare-git fixture.
    await ensureMergeFixture();
    try {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/merge',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.state).toBe('merged');
      // The merge path runs merge-tree/commit-tree but never measures numstat,
      // so the honest answer is explicit unknown (null) — the #960 discipline.
      // Hardcoded 0/0/0 would fabricate measured stats that were never computed.
      expect(body.data.additions).toBeNull();
      expect(body.data.deletions).toBeNull();
      expect(body.data.changedFiles).toBeNull();
    } finally {
      await destroyMergeFixture();
    }
  });

  it('POST /repos/:id/pulls/:number/merge still returns the real mergeCommitSha', async () => {
    await ensureMergeFixture();
    try {
      const app = await buildApp('user-1');
      const res = await app.inject({
        method: 'POST',
        url: '/repos/repo-1/pulls/1/merge',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.mergeCommitSha).toEqual(expect.any(String));
      expect(body.data.mergeCommitSha.length).toBeGreaterThan(0);
    } finally {
      await destroyMergeFixture();
    }
  });
});

describe('QuantGit Security Endpoints Honesty (no security-scan theater)', () => {
  beforeEach(() => {
    resetRepoStores();
  });

  it('GET /repos/:id/security/alerts returns honest empty lists and never seeds fabricated findings', async () => {
    const app = await buildApp();

    const first = await app.inject({ method: 'GET', url: '/repos/repo-1/security/alerts' });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();
    expect(firstBody.success).toBe(true);
    expect(firstBody.data.scanAvailable).toBe(false);
    expect(firstBody.data.note).toContain('not wired up');
    expect(firstBody.data.dependabot).toEqual([]);
    expect(firstBody.data.secrets).toEqual([]);
    expect(firstBody.data.codeql).toEqual([]);

    // A second hit must not conjure alerts either — no first-hit seeding.
    const second = await app.inject({ method: 'GET', url: '/repos/repo-1/security/alerts' });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json();
    expect(secondBody.data.dependabot).toEqual([]);
    expect(secondBody.data.secrets).toEqual([]);
    expect(secondBody.data.codeql).toEqual([]);

    const raw = JSON.stringify(secondBody);
    expect(raw).not.toContain('sec-0');
    expect(raw).not.toContain('secret-1');
    expect(raw).not.toContain('codeql-1');
  });

  it('POST /repos/:id/security/scan is honest: scanAvailable false, zeroed counts, no fake duration', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/scan',
      payload: { scanType: 'all' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.scanAvailable).toBe(false);
    expect(body.data.scannedFiles).toBe(0);
    expect(body.data.scannedCommits).toBe(0);
    expect(body.data.scanDurationMs).toBe(0);
    expect(body.data.findings).toEqual({ dependabot: 0, secrets: 0, codeql: 0 });
    expect(body.data.message).toContain('not wired up');
  });

  it('POST /repos/:id/security/scan does not fabricate the old hardcoded 48/14/124 numbers', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/scan',
      payload: { scanType: 'secrets' },
    });
    const body = res.json();
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('48 files and 14 commits analyzed');
    expect(body.data.scannedFiles).not.toBe(48);
    expect(body.data.scannedCommits).not.toBe(14);
    expect(body.data.scanDurationMs).not.toBe(124);
  });

  it('revoking a nonexistent secret alert fails with 404 instead of touching fabricated data', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/secrets/secret-1/revoke',
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST fix-pr for an unknown dependabot alert returns 404 and invents nothing', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/dependabot/does-not-exist/fix-pr',
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ALERT_NOT_FOUND');
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('prId');
    expect(raw.toLowerCase()).not.toContain('generated');
  });

  it('POST fix-pr for a real alert honestly refuses with 501 instead of inventing a PR number', async () => {
    const app = await buildApp();
    const alert: BackendSecurityAlert = {
      id: 'dep-1',
      package: 'express',
      severity: 'critical',
      cve: 'CVE-2026-3849',
      cvss: 9.8,
      title: 'express vulnerable to template injection',
      cweTitle: 'CWE-94',
      vulnerableRange: '< 4.18.2',
      patchedVersion: '4.18.2',
      state: 'open',
      createdAt: '2026-10-12T00:00:00.000Z',
    };
    seedSecurityAlertsForTests('repo-1', [alert]);

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/dependabot/dep-1/fix-pr',
    });
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FIX_PR_NOT_SUPPORTED');
    expect(body.error.message).toContain('not wired up yet');
    expect(body.error.message).toContain('No PR was created');
    expect(body.error.details).toMatchObject({
      alertId: 'dep-1',
      package: 'express',
      patchedVersion: '4.18.2',
    });

    // No invented PR number anywhere in the response — and no success claim.
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/"prId"/);
    expect(raw.toLowerCase()).not.toContain('generated');

    // The refusal must not stamp a fabricated fixPrId onto the alert row.
    const alerts = await app.inject({ method: 'GET', url: '/repos/repo-1/security/alerts' });
    const row = alerts.json().data.dependabot.find((a: { id: string }) => a.id === 'dep-1');
    expect(row).toBeDefined();
    expect(row.fixPrId).toBeUndefined();
  });

  it('POST codeql fix for an unknown alert returns 404 and invents nothing', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/codeql/does-not-exist/fix',
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ALERT_NOT_FOUND');
    const raw = JSON.stringify(body);
    expect(raw.toLowerCase()).not.toContain('patch applied');
    expect(raw.toLowerCase()).not.toContain('fixed');
  });

  it('POST codeql fix for a real alert honestly refuses with 501 instead of claiming a patch', async () => {
    const app = await buildApp();
    const alert: BackendCodeqlAlert = {
      id: 'codeql-1',
      ruleId: 'js/sql-injection',
      ruleName: 'SQL Injection',
      severity: 'high',
      filePath: 'src/db.ts',
      lineStart: 42,
      lineEnd: 44,
      description: 'Unescaped user input in SQL query',
      codeSnippet: 'query(`SELECT * FROM users WHERE id = ${id}`)',
      recommendedFix: 'Use parameterized queries',
      state: 'open',
    };
    seedCodeqlAlertsForTests('repo-1', [alert]);

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/codeql/codeql-1/fix',
    });
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CODEQL_FIX_NOT_SUPPORTED');
    expect(body.error.message).toContain('not wired up yet');
    expect(body.error.message).toContain('No code was changed');
    expect(body.error.details).toMatchObject({
      alertId: 'codeql-1',
      ruleId: 'js/sql-injection',
      ruleName: 'SQL Injection',
      filePath: 'src/db.ts',
    });

    // No invented success claim anywhere in the response.
    const raw = JSON.stringify(body);
    expect(raw.toLowerCase()).not.toContain('patch applied');

    // The refusal must not flip the alert row to 'fixed' — no false state.
    const alerts = await app.inject({ method: 'GET', url: '/repos/repo-1/security/alerts' });
    const row = alerts.json().data.codeql.find((a: { id: string }) => a.id === 'codeql-1');
    expect(row).toBeDefined();
    expect(row.state).toBe('open');
  });
});

describe('GET /repos/:id/security/alerts (fix/qm-securitytab-alerts-wired server list contract)', () => {
  beforeEach(() => {
    resetRepoStores();
  });

  it('returns the stored secrets and codeql lists that the SecurityTab renders', async () => {
    const app = await buildApp();
    const secret: BackendSecretAlert = {
      id: 'sec-1',
      secretType: 'AWS Access Key',
      maskedSecret: 'AKIA••••••••••••XYZ1',
      filePath: '.env',
      lineNumber: 12,
      detectedAt: '2026-10-13T10:20:00.000Z',
      status: 'active',
    };
    const codeql: BackendCodeqlAlert = {
      id: 'codeql-1',
      ruleId: 'js/sql-injection',
      ruleName: 'SQL Injection',
      severity: 'high',
      filePath: 'src/db.ts',
      lineStart: 42,
      lineEnd: 44,
      description: 'Unescaped user input in SQL query',
      codeSnippet: 'query(`SELECT * FROM users WHERE id = ${id}`)',
      recommendedFix: 'Use parameterized queries',
      state: 'open',
    };
    seedSecretAlertsForTests('repo-1', [secret]);
    seedCodeqlAlertsForTests('repo-1', [codeql]);

    const res = await app.inject({ method: 'GET', url: '/repos/repo-1/security/alerts' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    // The tab reads data.secrets / data.codeql — both must round-trip.
    expect(data.secrets).toHaveLength(1);
    expect(data.secrets[0]).toMatchObject({
      id: 'sec-1',
      secretType: 'AWS Access Key',
      maskedSecret: 'AKIA••••••••••••XYZ1',
      filePath: '.env',
      status: 'active',
    });
    expect(data.codeql).toHaveLength(1);
    expect(data.codeql[0]).toMatchObject({
      id: 'codeql-1',
      ruleId: 'js/sql-injection',
      ruleName: 'SQL Injection',
      severity: 'high',
      state: 'open',
    });
    // The summary the tab badges render counts the stored rows.
    expect(data.summary.openSecretsCount).toBe(1);
    expect(data.summary.openSastCount).toBe(1);
  });

  it('returns empty lists — never fabricated rows — when nothing is stored', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/repos/repo-1/security/alerts' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.secrets).toEqual([]);
    expect(data.codeql).toEqual([]);
    expect(data.summary.openSecretsCount).toBe(0);
    expect(data.summary.openSastCount).toBe(0);
  });
});

describe('POST /repos/:id/security/policy (QM-SCREEN-013 P1 real persistence)', () => {
  beforeEach(() => {
    resetRepoStores();
  });

  it('saves the policy for the owner and reports it back via GET alerts', async () => {
    const app = await buildApp();

    const save = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/policy',
      payload: { policy: '# Custom Policy\n\nReport to sec@example.test.' },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().success).toBe(true);

    const alerts = await app.inject({ method: 'GET', url: '/repos/repo-1/security/alerts' });
    expect(alerts.statusCode).toBe(200);
    expect(alerts.json().data.securityPolicy).toBe('# Custom Policy\n\nReport to sec@example.test.');
  });

  it('reports branchRules and securityPolicy as null when nothing was saved (no seeded defaults)', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/repos/repo-1/security/alerts' });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.branchRules).toBeNull();
    expect(data.securityPolicy).toBeNull();
  });

  it('rejects a non-owner with 403', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/policy',
      headers: { 'x-user-id': 'user-2' },
      payload: { policy: '# Evil Policy' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects an empty policy with 400', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/policy',
      payload: { policy: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires authentication with 401', async () => {
    const app = await buildApp(null);

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/policy',
      payload: { policy: '# Policy' },
    });
    expect(res.statusCode).toBe(401);
  });
});
