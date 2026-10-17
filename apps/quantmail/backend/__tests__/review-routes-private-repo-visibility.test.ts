// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import reviewRoutes from '../modules/code/routes/reviews';

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
  number: 7,
  title: 'Secret PR title',
};

const PRIVATE_REVIEW = {
  id: 'review-1',
  prId: 'pr-1',
  reviewerId: 'owner-1',
  status: 'APPROVED' as const,
  body: 'Secret review body',
};

type PrismaStub = {
  repository: { findFirst: ReturnType<typeof vi.fn> };
  repositoryCollaborator: { findFirst: ReturnType<typeof vi.fn> };
  pullRequest: { findUnique: ReturnType<typeof vi.fn> };
  review: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  reviewComment: { create: ReturnType<typeof vi.fn> };
};

function makePrisma(): PrismaStub {
  return {
    repository: { findFirst: vi.fn() },
    repositoryCollaborator: { findFirst: vi.fn(async () => null) },
    pullRequest: {
      findUnique: vi.fn(async () => ({ ...PRIVATE_PR })),
    },
    review: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ ...PRIVATE_REVIEW, ...args.data })),
      findMany: vi.fn(async () => [PRIVATE_REVIEW]),
    },
    reviewComment: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'comment-1', ...args.data })),
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
  await app.register(reviewRoutes);
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

const SUBMIT_URL = '/owner-1/secret-project/pulls/7/reviews';
const COMMENT_URL = '/owner-1/secret-project/pulls/7/comments';

describe('Review routes: private-repository visibility gate', () => {
  it('rejects anonymous requests with 401 UNAUTHORIZED', async () => {
    const prisma = makePrisma();
    const app = await buildApp(undefined, prisma);

    const res = await app.inject({ method: 'GET', url: SUBMIT_URL });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 (not 200, not 403) for a non-owner listing reviews on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({ method: 'GET', url: SUBMIT_URL });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    // The review listing must never be reached for a private repo the caller
    // cannot read: no review data should leak.
    expect(prisma.review.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-owner submitting a review on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'POST',
      url: SUBMIT_URL,
      payload: { status: 'APPROVED', body: 'Trying to post' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-owner adding a review comment on a private repo', async () => {
    const prisma = makePrisma();
    privateRepoNoGrant(prisma);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'POST',
      url: COMMENT_URL,
      payload: { filePath: 'src/index.ts', line: 42, body: 'Trying to post' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
    expect(prisma.reviewComment.create).not.toHaveBeenCalled();
  });

  it('lets the owner submit, comment and list reviews on a private repo', async () => {
    const prisma = makePrisma();
    const app = await buildApp('owner-1', prisma);

    privateRepoOwner(prisma);
    const submit = await app.inject({
      method: 'POST',
      url: SUBMIT_URL,
      payload: { status: 'APPROVED', body: 'LGTM' },
    });
    expect(submit.statusCode).toBe(200);
    expect(prisma.review.create).toHaveBeenCalled();

    privateRepoOwner(prisma);
    const comment = await app.inject({
      method: 'POST',
      url: COMMENT_URL,
      payload: { filePath: 'src/index.ts', line: 42, body: 'Nit: rename this' },
    });
    expect(comment.statusCode).toBe(200);
    expect(prisma.reviewComment.create).toHaveBeenCalled();

    privateRepoOwner(prisma);
    const list = await app.inject({ method: 'GET', url: SUBMIT_URL });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual([PRIVATE_REVIEW]);
  });

  it('lets a collaborator list and submit reviews on a private repo', async () => {
    const prisma = makePrisma();
    const app = await buildApp('user-3', prisma);

    privateRepoCollaborator(prisma);
    const list = await app.inject({ method: 'GET', url: SUBMIT_URL });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual([PRIVATE_REVIEW]);

    privateRepoCollaborator(prisma);
    const submit = await app.inject({
      method: 'POST',
      url: SUBMIT_URL,
      payload: { status: 'COMMENTED', body: 'Looks fine' },
    });
    expect(submit.statusCode).toBe(200);
    expect(prisma.review.create).toHaveBeenCalled();
  });

  it('lets any authenticated user list and submit reviews on a public repo', async () => {
    const prisma = makePrisma();
    const app = await buildApp('user-2', prisma);

    prisma.repository.findFirst.mockResolvedValueOnce({ ...PUBLIC_REPO });
    prisma.review.findMany.mockResolvedValueOnce([]);
    const list = await app.inject({
      method: 'GET',
      url: '/owner-1/open-project/pulls/7/reviews',
    });
    expect(list.statusCode).toBe(200);

    prisma.repository.findFirst.mockResolvedValueOnce({ ...PUBLIC_REPO });
    const submit = await app.inject({
      method: 'POST',
      url: '/owner-1/open-project/pulls/7/reviews',
      payload: { status: 'APPROVED' },
    });
    expect(submit.statusCode).toBe(200);
    expect(prisma.review.create).toHaveBeenCalled();
  });

  it('returns 404 REPO_NOT_FOUND for a repo path that does not exist', async () => {
    const prisma = makePrisma();
    prisma.repository.findFirst.mockResolvedValueOnce(null);
    const app = await buildApp('user-2', prisma);

    const res = await app.inject({
      method: 'GET',
      url: '/owner-1/no-such-repo/pulls/7/reviews',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('REPO_NOT_FOUND');
  });
});
