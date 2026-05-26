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

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

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

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

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

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

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
