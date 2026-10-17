import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { PrismaClient } from '@prisma/client';
import {
  ReviewService,
  SubmitReviewInputSchema,
  AddCommentInputSchema,
} from '../services/review.service';

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
 * cannot even learn that a private repository exists. Same gate as the issues
 * and CI-runs fixes.
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

const SubmitReviewBodySchema = z.object({
  status: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED']),
  body: z.string().optional(),
});

const AddCommentBodySchema = z.object({
  filePath: z.string(),
  line: z.number().int().positive(),
  body: z.string().min(1),
});

export default async function reviewRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma?: PrismaClient }).prisma ?? null;
  if (!prisma) {
    throw new Error(
      'PrismaClient is not available. Register the prisma plugin before review routes.',
    );
  }
  const reviewService = new ReviewService(prisma);

  // POST / - submit review
  fastify.post<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/pulls/:number/reviews',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const prNumber = parseInt(request.params.number, 10);

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const pr = await prisma.pullRequest.findUnique({
        where: { repoId_number: { repoId: repo.id, number: prNumber } },
      });

      if (!pr) {
        throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
      }

      const body = SubmitReviewBodySchema.parse(request.body);
      const result = await reviewService.submitReview({
        prId: pr.id,
        reviewerId: userId,
        status: body.status,
        body: body.body,
      });

      return reply.send({ success: true, data: result });
    },
  );

  // POST /comments - add comment
  fastify.post<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/pulls/:number/comments',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const prNumber = parseInt(request.params.number, 10);

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const pr = await prisma.pullRequest.findUnique({
        where: { repoId_number: { repoId: repo.id, number: prNumber } },
      });

      if (!pr) {
        throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
      }

      const body = AddCommentBodySchema.parse(request.body);
      const result = await reviewService.addComment({
        prId: pr.id,
        authorId: userId,
        filePath: body.filePath,
        line: body.line,
        body: body.body,
      });

      return reply.send({ success: true, data: result });
    },
  );

  // GET /:prId - list reviews for PR
  fastify.get<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/pulls/:number/reviews',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const prNumber = parseInt(request.params.number, 10);

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const pr = await prisma.pullRequest.findUnique({
        where: { repoId_number: { repoId: repo.id, number: prNumber } },
      });

      if (!pr) {
        throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
      }

      const result = await reviewService.listReviews(pr.id);
      return reply.send({ success: true, data: result });
    },
  );
}
