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
 * fix (#1183).
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

      const repo = await loadReadableRepository(prisma, request, owner, name);

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

      const repo = await loadReadableRepository(prisma, request, owner, name);

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

      const repo = await loadReadableRepository(prisma, request, owner, name);

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

      const repo = await loadReadableRepository(prisma, request, owner, name);

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

      const repo = await loadReadableRepository(prisma, request, owner, name);

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

      const repo = await loadReadableRepository(prisma, request, owner, name);

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

      const repo = await loadReadableRepository(prisma, request, owner, name);

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

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const result = await issueService.reopenIssue(repo.id, issueNumber);
      return reply.send({ success: true, data: result });
    },
  );
}
