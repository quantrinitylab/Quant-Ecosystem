import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { PrismaClient } from '@prisma/client';
import { IssueService, CreateIssueInputSchema } from '../services/issue.service';

function getUserId(request: unknown): string {
  const req = request as { auth?: { userId?: string } };
  const userId = req.auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

const CreateIssueBodySchema = z.object({
  title: z.string().min(1).max(256),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
});

const UpdateIssueBodySchema = z.object({
  title: z.string().min(1).max(256).optional(),
  body: z.string().optional(),
});

const ListIssuesQuerySchema = z.object({
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  labels: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const SetLabelsBodySchema = z.object({
  labels: z.array(z.string()),
});

const SetAssigneesBodySchema = z.object({
  assignees: z.array(z.string()),
});

export default async function issueRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma?: PrismaClient }).prisma ?? null;
  if (!prisma) {
    throw new Error(
      'PrismaClient is not available. Register the prisma plugin before issue routes.',
    );
  }
  const issueService = new IssueService(prisma);

  // POST / - create issue
  fastify.post<{ Params: { owner: string; name: string } }>(
    '/:owner/:name/issues',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const body = CreateIssueBodySchema.parse(request.body);
      const result = await issueService.createIssue({
        repoId: repo.id,
        title: body.title,
        body: body.body,
        authorId: userId,
        labels: body.labels,
        assignees: body.assignees,
      });

      return reply.send({ success: true, data: result });
    },
  );

  // GET / - list issues
  fastify.get<{ Params: { owner: string; name: string } }>(
    '/:owner/:name/issues',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const query = ListIssuesQuerySchema.parse(request.query);

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const result = await issueService.listIssues(repo.id, {
        status: query.status,
        labels: query.labels ? query.labels.split(',') : undefined,
      });

      return reply.send({ success: true, data: result });
    },
  );

  // GET /:number - get issue
  fastify.get<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/issues/:number',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const issueNumber = parseInt(request.params.number, 10);

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const result = await issueService.getIssue(repo.id, issueNumber);
      return reply.send({ success: true, data: result });
    },
  );

  // PATCH /:number - update issue
  fastify.patch<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/issues/:number',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const issueNumber = parseInt(request.params.number, 10);
      const body = UpdateIssueBodySchema.parse(request.body);

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const issue = await prisma.issue.findUnique({
        where: { repoId_number: { repoId: repo.id, number: issueNumber } },
      });

      if (!issue) {
        throw createAppError('Issue not found', 404, 'ISSUE_NOT_FOUND');
      }

      const updated = await prisma.issue.update({
        where: { id: issue.id },
        data: body,
      });

      return reply.send({ success: true, data: updated });
    },
  );

  // POST /:number/labels - set labels
  fastify.post<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/issues/:number/labels',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const issueNumber = parseInt(request.params.number, 10);
      const body = SetLabelsBodySchema.parse(request.body);

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const result = await issueService.labelIssue(repo.id, issueNumber, body.labels);
      return reply.send({ success: true, data: result });
    },
  );

  // POST /:number/assignees - set assignees
  fastify.post<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/issues/:number/assignees',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const issueNumber = parseInt(request.params.number, 10);
      const body = SetAssigneesBodySchema.parse(request.body);

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const result = await issueService.assignIssue(repo.id, issueNumber, body.assignees);
      return reply.send({ success: true, data: result });
    },
  );

  // POST /:number/close - close issue
  fastify.post<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/issues/:number/close',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const issueNumber = parseInt(request.params.number, 10);

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const result = await issueService.closeIssue(repo.id, issueNumber);
      return reply.send({ success: true, data: result });
    },
  );

  // POST /:number/reopen - reopen issue
  fastify.post<{ Params: { owner: string; name: string; number: string } }>(
    '/:owner/:name/issues/:number/reopen',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const issueNumber = parseInt(request.params.number, 10);

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const result = await issueService.reopenIssue(repo.id, issueNumber);
      return reply.send({ success: true, data: result });
    },
  );
}
