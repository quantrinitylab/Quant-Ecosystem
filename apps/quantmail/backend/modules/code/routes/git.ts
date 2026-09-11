import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { PrismaClient } from '@prisma/client';
import { GitService } from '../services/git.service';
import { RepoStorageService } from '../services/git-transport/repo-storage.service';

function getUserId(request: unknown): string {
  const req = request as { auth?: { userId?: string } };
  const userId = req.auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

const CreateRepoSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'INTERNAL']).default('PUBLIC'),
  defaultBranch: z.string().default('main'),
});

const UpdateRepoSchema = z.object({
  description: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'INTERNAL']).optional(),
  defaultBranch: z.string().optional(),
});

const PushRefsSchema = z.object({
  refs: z
    .array(
      z.object({
        ref: z.string().min(1),
        newSha: z.string().min(1),
        oldSha: z.string().optional(),
        prId: z.string().optional(),
      }),
    )
    .min(1),
});

export default async function gitRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma?: PrismaClient }).prisma ?? null;
  if (!prisma) {
    throw new Error('PrismaClient is not available. Register the prisma plugin before git routes.');
  }
  const gitService = new GitService(prisma);
  const repoStorage = new RepoStorageService();

  // POST /repos - create repo
  fastify.post('/repos', async (request, reply) => {
    const userId = getUserId(request);
    const body = CreateRepoSchema.parse(request.body);

    const repo = await prisma.repository.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        visibility: body.visibility,
        defaultBranch: body.defaultBranch,
        ownerId: userId,
      },
    });

    await repoStorage.initBareRepo(repo.ownerId, repo.name);

    return reply.send({ success: true, data: repo });
  });

  // GET /repos/:owner/:name - get repo
  fastify.get<{ Params: { owner: string; name: string } }>(
    '/repos/:owner/:name',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      return reply.send({ success: true, data: repo });
    },
  );

  // DELETE /repos/:owner/:name - delete repo
  fastify.delete<{ Params: { owner: string; name: string } }>(
    '/repos/:owner/:name',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      if (repo.ownerId !== userId) {
        throw createAppError('Not authorized to delete this repository', 403, 'FORBIDDEN');
      }

      await prisma.repository.delete({ where: { id: repo.id } });
      await repoStorage.deleteRepo(owner, name);

      return reply.send({ success: true, data: { deleted: true } });
    },
  );

  // PATCH /repos/:owner/:name - update repo
  fastify.patch<{ Params: { owner: string; name: string } }>(
    '/repos/:owner/:name',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const body = UpdateRepoSchema.parse(request.body);

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      if (repo.ownerId !== userId) {
        throw createAppError('Not authorized to update this repository', 403, 'FORBIDDEN');
      }

      const updated = await prisma.repository.update({
        where: { id: repo.id },
        data: body,
      });

      return reply.send({ success: true, data: updated });
    },
  );

  // GET /repos/:owner/:name/branches - list branches
  fastify.get<{ Params: { owner: string; name: string } }>(
    '/repos/:owner/:name/branches',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const branches = await prisma.branch.findMany({
        where: { repoId: repo.id },
        orderBy: { name: 'asc' },
      });

      return reply.send({ success: true, data: branches });
    },
  );

  // POST /repos/:owner/:name/push - advance refs (write-scope + branch protection)
  fastify.post<{ Params: { owner: string; name: string } }>(
    '/repos/:owner/:name/push',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const body = PushRefsSchema.parse(request.body);

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      // pushRefs enforces the write-scope gate (403 if the caller lacks write
      // scope) and evaluates branch protection before any protected ref
      // advances (Requirement 6.3).
      const result = await gitService.pushRefs(userId, repo.id, body.refs);

      return reply.send({ success: true, data: result });
    },
  );
}
