import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { PrismaClient } from '@prisma/client';
import {
  PullRequestService,
  CreatePRInputSchema,
  MergePRInputSchema,
} from '../services/pr.service';
import { MergeEligibilityService } from '../services/merge-eligibility.service';
import { AiReviewBotService } from '../services/ai-review-bot.service';
import { ReviewService } from '../services/review.service';
import { GitInspectService } from '../services/git-transport/git-inspect.service';
import { RepoStorageService } from '../services/git-transport/repo-storage.service';

function getUserId(request: unknown): string {
  const req = request as { auth?: { userId?: string } };
  const userId = req.auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

type ReadableRepository = {
  id: string;
  ownerId: string;
  name: string;
  visibility: string;
};

/**
 * Mirror of the canonical loadReadableRepo visibility gate (backend/routes/repos.ts):
 * private repositories are invisible (404) to anyone who is neither the owner
 * nor a collaborator. Returns 404 instead of 403 so non-authorized callers
 * cannot even learn that a private repository exists. Same gate as the CI-runs
 * fix (#1183) and the issues-router fix (#1267).
 */
async function isRepoCollaborator(
  prisma: PrismaClient,
  repoId: string,
  userId: string,
): Promise<boolean> {
  const client = prisma as unknown as {
    repositoryCollaborator?: {
      findFirst(args: unknown): Promise<{ role?: string } | null>;
    };
  };
  if (!client.repositoryCollaborator) return false;
  try {
    const row = await client.repositoryCollaborator.findFirst({
      where: { repoId, userId },
    });
    return row !== null;
  } catch {
    // Generated client predates the collaborators table: treat as no grant.
    return false;
  }
}

async function loadReadableRepository(
  prisma: PrismaClient,
  request: unknown,
  owner: string,
  name: string,
): Promise<ReadableRepository> {
  const userId = getUserId(request);
  const repo = await prisma.repository.findFirst({
    where: { ownerId: owner, name, deletedAt: null },
    select: { id: true, ownerId: true, name: true, visibility: true },
  });
  if (!repo) {
    throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
  }
  if (repo.ownerId !== userId && String(repo.visibility).toUpperCase() === 'PRIVATE') {
    const collaborator = await isRepoCollaborator(prisma, repo.id, userId);
    if (!collaborator) {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }
  }
  return {
    id: repo.id,
    ownerId: repo.ownerId,
    name: repo.name,
    visibility: String(repo.visibility),
  };
}

const ListPRsQuerySchema = z.object({
  status: z.enum(['OPEN', 'MERGED', 'CLOSED', 'DRAFT']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export default async function pullRequestRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma?: PrismaClient }).prisma ?? null;
  if (!prisma) {
    throw new Error(
      'PrismaClient is not available. Register the prisma plugin before pull request routes.',
    );
  }
  const prService = new PullRequestService(prisma);
  const mergeEligibilityService = new MergeEligibilityService(prisma);
  const reviewService = new ReviewService(prisma);
  const gitInspect = new GitInspectService();
  const repoStorage = new RepoStorageService();
  const aiReviewBot = new AiReviewBotService(prisma, reviewService, gitInspect, repoStorage);

  // POST / - create PR
  fastify.post<{ Params: { owner: string; name: string } }>(
    '/:owner/:name/pulls',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const body = CreatePRInputSchema.parse({
        ...(request.body as Record<string, unknown>),
        repoId: repo.id,
        authorId: userId,
      });

      const result = await prService.createPR(body);
      return reply.send({ success: true, data: result });
    },
  );

  // GET / - list PRs
  fastify.get<{ Params: { owner: string; name: string } }>(
    '/:owner/:name/pulls',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const query = ListPRsQuerySchema.parse(request.query);

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const result = await prService.listPRs(repo.id, {
        status: query.status,
      });

      return reply.send({ success: true, data: result });
    },
  );

  // GET /:number - get PR
  fastify.get<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/pulls/:number',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const prNumber = parseInt(request.params.number, 10);

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const result = await prService.getPR(repo.id, prNumber);
      return reply.send({ success: true, data: result });
    },
  );

  // GET /:number/merge-eligibility - evaluate merge decision (CI + protection + reviews)
  fastify.get<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/pulls/:number/merge-eligibility',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const prNumber = parseInt(request.params.number, 10);

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const pr = await prService.getPR(repo.id, prNumber);
      const decision = await mergeEligibilityService.evaluateMergeEligibility(pr.id);

      return reply.send({ success: true, data: decision });
    },
  );

  // POST /:number/merge - merge PR
  fastify.post<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/pulls/:number/merge',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const prNumber = parseInt(request.params.number, 10);

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const body = MergePRInputSchema.parse(request.body);
      const result = await prService.mergePR(repo.id, prNumber, body);
      return reply.send({ success: true, data: result });
    },
  );

  // POST /:number/close - close PR
  fastify.post<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/pulls/:number/close',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const prNumber = parseInt(request.params.number, 10);

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const result = await prService.closePR(repo.id, prNumber);
      return reply.send({ success: true, data: result });
    },
  );

  // GET /:number/diff - get diff
  fastify.get<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/pulls/:number/diff',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const prNumber = parseInt(request.params.number, 10);

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const result = await prService.getDiff(repo.id, prNumber);
      return reply.send({ success: true, data: result });
    },
  );

  // POST /:number/ai-review - generate automated AI review and lint suggestions (Task CH-05)
  fastify.post<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/pulls/:number/ai-review',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const prNumber = parseInt(request.params.number, 10);

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const report = await aiReviewBot.reviewPullRequest(repo.id, prNumber, userId);
      return reply.send({ success: true, data: report });
    },
  );
}
