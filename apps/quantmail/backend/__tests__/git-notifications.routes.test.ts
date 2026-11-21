// @vitest-environment node
// ============================================================================
// QuantGit notifications inbox routes — Fastify injection tests.
//
// These prove the two things unit tests cannot: that GET /repos/notifications
// is NOT swallowed by the `/:id` route (Fastify static-beats-param), and
// that POST /:id/pulls/:number/request-review actually creates the PENDING
// Review rows the inbox derives `review_requested` items from.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import reposRoutes, { resetRepoStores } from '../routes/repos';

const MOCK_REPO = {
  id: 'repo-1',
  ownerId: 'user-1',
  name: 'Widgets',
  description: '',
  visibility: 'PUBLIC',
  defaultBranch: 'main',
  branches: [],
  starCount: 0,
  forkCount: 0,
  isArchived: false,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  deletedAt: null,
};

const MOCK_PR = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 42,
  title: 'fix: correct widget alignment',
  body: 'Aligns the widget.',
  authorId: 'teammate-1',
  status: 'OPEN',
  sourceBranch: 'feat/x',
  targetBranch: 'main',
  createdAt: new Date('2026-10-20T10:00:00Z'),
  updatedAt: new Date('2026-10-20T10:00:00Z'),
};

function fakePrisma() {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'user-1', username: 'owner', displayName: 'Owner' }),
      findMany: vi.fn().mockResolvedValue([{ id: 'rev-1', username: 'alice' }]),
    },
    repository: {
      findUnique: vi.fn().mockResolvedValue(MOCK_REPO),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    repositoryCollaborator: { findMany: vi.fn().mockResolvedValue([]) },
    pullRequest: {
      findFirst: vi.fn().mockResolvedValue(MOCK_PR),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    review: {
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        // Inbox derivation: one PENDING row for the signed-in user.
        if (where?.reviewerId === 'user-1' && where?.status === 'PENDING') {
          return [
            {
              id: 'rev-row-1',
              createdAt: new Date('2026-10-22T10:00:00Z'),
              pullRequest: {
                ...MOCK_PR,
                repository: { ...MOCK_REPO, owner: { username: 'owner', displayName: 'Owner' } },
                author: { username: 'teammate', displayName: 'Teammate' },
              },
            },
          ];
        }
        return [];
      }),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'created-1', ...data })),
    },
    issue: { findMany: vi.fn().mockResolvedValue([]) },
    issueComment: { findMany: vi.fn().mockResolvedValue([]) },
    reviewComment: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

let prisma: ReturnType<typeof fakePrisma>;

async function buildApp(userId: string | null = 'user-1') {
  prisma = fakePrisma();
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(reposRoutes, { prefix: '/repos' });
  await app.register(reposRoutes, { prefix: '/api/repos' });
  await app.ready();
  return app;
}

describe('QuantGit notifications inbox routes', () => {
  beforeEach(() => {
    resetRepoStores();
  });

  it('GET /repos/notifications returns the review request (not a repo 404)', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/repos/notifications' });
    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.success).toBe(true);
    expect(json.data.notifications).toHaveLength(1);
    expect(json.data.notifications[0]).toMatchObject({
      number: 42,
      type: 'pr',
      category: 'review_requested',
      unread: true,
    });
    expect(json.data.unreadCount).toBe(1);
  });

  it('GET /api/repos/notifications works through the second mount prefix', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/repos/notifications' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.notifications).toHaveLength(1);
  });

  it('GET /repos/notifications requires auth', async () => {
    const app = await buildApp(null);
    const response = await app.inject({ method: 'GET', url: '/repos/notifications' });
    expect(response.statusCode).toBe(401);
  });

  it('POST /repos/:id/pulls/:number/request-review creates PENDING rows', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/pulls/42/request-review',
      payload: { reviewers: ['alice'] },
    });
    expect(response.statusCode).toBe(201);
    const json = response.json();
    expect(json.success).toBe(true);
    expect(json.data.created).toEqual(['alice']);
    expect(prisma.review.create).toHaveBeenCalledWith({
      data: { prId: 'pr-1', reviewerId: 'rev-1', status: 'PENDING' },
    });
  });

  it('POST request-review rejects an unknown reviewer token honestly', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/pulls/42/request-review',
      payload: { reviewers: ['ghost'] },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.unknown).toEqual(['ghost']);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });
});
