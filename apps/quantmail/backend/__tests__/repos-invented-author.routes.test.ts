// @vitest-environment node
// ============================================================================
// /repos — invented-author fallback regression tests (fix/qm-quantgit-invented-author).
//
// A missing PR/issue author relation must surface as author: null — never as
// an invented "user" string. The frontend renders null as 'Unknown', never as
// the viewing user's name.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
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
  storagePathUrl: null,
  starCount: 0,
  forkCount: 0,
  isArchived: false,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  deletedAt: null,
};

const PR_WITHOUT_AUTHOR = {
  id: 'pr-1',
  number: 7,
  title: 'fix: orphaned author row',
  body: '',
  status: 'OPEN',
  sourceBranch: 'fix/orphan',
  targetBranch: 'main',
  createdAt: new Date('2026-09-02T00:00:00.000Z'),
  author: null,
  _count: { reviewComments: 2 },
};

const PR_WITH_AUTHOR = {
  ...PR_WITHOUT_AUTHOR,
  id: 'pr-2',
  number: 8,
  author: { username: 'kundan', displayName: 'Kundan Singh' },
};

const ISSUE_WITHOUT_AUTHOR = {
  id: 'issue-1',
  repoId: 'repo-1',
  number: 1,
  title: 'Issue with orphaned author row',
  body: '',
  authorId: 'user-1',
  status: 'OPEN',
  labels: [],
  assignees: [],
  createdAt: new Date('2026-09-02T00:00:00.000Z'),
  updatedAt: new Date('2026-09-02T00:00:00.000Z'),
  closedAt: null,
  author: null,
  _count: { comments: 1 },
};

let prisma: any;

async function buildApp() {
  prisma = {
    repository: {
      findUnique: vi.fn().mockResolvedValue(MOCK_REPO),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    pullRequest: {
      findMany: vi.fn().mockResolvedValue([PR_WITHOUT_AUTHOR]),
    },
    issue: {
      findMany: vi.fn().mockResolvedValue([ISSUE_WITHOUT_AUTHOR]),
    },
  };
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-1' };
  });
  await app.register(reposRoutes, { prefix: '/repos' });
  await app.ready();
  return app;
}

describe('QuantGit invented-author fallbacks', () => {
  beforeEach(() => {
    resetRepoStores();
  });

  afterAll(async () => {
    // Apps are closed per-test below via app.close().
  });

  it('GET /repos/:id/pulls returns author null (not "user") when the author relation is missing', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/repos/repo-1/pulls' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].author).toBeNull();
      expect(body.data[0].author).not.toBe('user');
    } finally {
      await app.close();
    }
  });

  it('GET /repos/:id/pulls still passes a real author username through unchanged', async () => {
    const app = await buildApp();
    prisma.pullRequest.findMany.mockResolvedValueOnce([PR_WITH_AUTHOR]);
    try {
      const res = await app.inject({ method: 'GET', url: '/repos/repo-1/pulls' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].author).toBe('kundan');
    } finally {
      await app.close();
    }
  });

  it('GET /repos/:id/issues returns author null (not "user") when the author relation is missing', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/repos/repo-1/issues' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].author).toBeNull();
      expect(body.data[0].author).not.toBe('user');
    } finally {
      await app.close();
    }
  });
});
