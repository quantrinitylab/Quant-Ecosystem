import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { PrismaClient } from '@prisma/client';
import {
  PullRequestService,
  CreatePRInputSchema,
  MergePRInputSchema,
} from '../services/pr.service';

function getUserId(request: unknown): string {
  const req = request as { auth?: { userId?: string } };
  const userId = req.auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
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

  // POST / - create PR
  fastify.post<{ Params: { owner: string; name: string } }>(
    '/:owner/:name/pulls',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const body = CreatePRInputSchema.parse({
        ...request.body,
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

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

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

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const result = await prService.getPR(repo.id, prNumber);
      return reply.send({ success: true, data: result });
    },
  );

  // POST /:number/merge - merge PR
  fastify.post<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/pulls/:number/merge',
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

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

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

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const result = await prService.getDiff(repo.id, prNumber);
      return reply.send({ success: true, data: result });
    },
  );
}
