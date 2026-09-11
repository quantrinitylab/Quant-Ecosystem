import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { PrismaClient, Repository } from '@prisma/client';
import { GitService } from '../services/git.service';
import { GitInspectService, RepoStorageService } from '../services/git-transport';

type RepositoryAccess = Pick<Repository, 'ownerId' | 'name' | 'visibility'>;

function getOptionalUserId(request: unknown): string | undefined {
  return (request as { auth?: { userId?: string } }).auth?.userId;
}

function getUserId(request: unknown): string {
  const userId = getOptionalUserId(request);
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function requireReadAccess(request: unknown, repo: RepositoryAccess): void {
  const visibility = String(repo.visibility).toUpperCase();
  if (visibility === 'PUBLIC') return;
  const userId = getOptionalUserId(request);
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  if (repo.ownerId !== userId) {
    throw createAppError('Read access required', 403, 'FORBIDDEN');
  }
}

const RepoNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Use letters, numbers, dot, dash or underscore')
  .refine((name) => !name.toLowerCase().endsWith('.git'), {
    message: 'Repository name cannot be .git or end in .git',
  });

const CreateRepoSchema = z.object({
  name: RepoNameSchema,
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

const CommitQuerySchema = z.object({
  ref: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

export default async function gitRoutes(fastify: FastifyInstance) {
  const rawPrisma = (fastify as unknown as { prisma?: PrismaClient }).prisma;
  if (!rawPrisma) {
    throw new Error('PrismaClient is not available. Register the prisma plugin before git routes.');
  }
  const prisma: PrismaClient = rawPrisma;
  const gitService = new GitService(prisma);
  const repoStorage = new RepoStorageService();
  const gitInspectService = new GitInspectService(repoStorage);

  async function loadReadableRepository(
    request: unknown,
    owner: string,
    name: string,
  ): Promise<Repository> {
    const repo = await prisma.repository.findFirst({
      where: { ownerId: owner, name, deletedAt: null },
    });
    if (!repo) {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }
    requireReadAccess(request, repo);
    return repo;
  }

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

  fastify.get<{ Params: { owner: string; name: string } }>(
    '/repos/:owner/:name',
    async (request, reply) => {
      getUserId(request);
      const { owner, name } = request.params;
      const repo = await prisma.repository.findFirst({ where: { ownerId: owner, name } });
      if (!repo) throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      return reply.send({ success: true, data: repo });
    },
  );

  fastify.delete<{ Params: { owner: string; name: string } }>(
    '/repos/:owner/:name',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const repo = await prisma.repository.findFirst({ where: { ownerId: owner, name } });
      if (!repo) throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      if (repo.ownerId !== userId) {
        throw createAppError('Not authorized to delete this repository', 403, 'FORBIDDEN');
      }
      await prisma.repository.delete({ where: { id: repo.id } });
      await repoStorage.deleteRepo(owner, name);
      return reply.send({ success: true, data: { deleted: true } });
    },
  );

  fastify.patch<{ Params: { owner: string; name: string } }>(
    '/repos/:owner/:name',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const body = UpdateRepoSchema.parse(request.body);
      const repo = await prisma.repository.findFirst({ where: { ownerId: owner, name } });
      if (!repo) throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      if (repo.ownerId !== userId) {
        throw createAppError('Not authorized to update this repository', 403, 'FORBIDDEN');
      }
      const updated = await prisma.repository.update({ where: { id: repo.id }, data: body });
      return reply.send({ success: true, data: updated });
    },
  );

  fastify.get<{ Params: { owner: string; name: string } }>(
    '/repos/:owner/:name/branches',
    async (request, reply) => {
      getUserId(request);
      const { owner, name } = request.params;
      const repo = await prisma.repository.findFirst({ where: { ownerId: owner, name } });
      if (!repo) throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      const branches = await prisma.branch.findMany({
        where: { repoId: repo.id },
        orderBy: { name: 'asc' },
      });
      return reply.send({ success: true, data: branches });
    },
  );

  fastify.post<{ Params: { owner: string; name: string } }>(
    '/repos/:owner/:name/push',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const body = PushRefsSchema.parse(request.body);
      const repo = await prisma.repository.findFirst({ where: { ownerId: owner, name } });
      if (!repo) throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      const result = await gitService.pushRefs(userId, repo.id, body.refs);
      return reply.send({ success: true, data: result });
    },
  );

  fastify.get<{ Params: { owner: string; name: string; ref: string } }>(
    '/repos/:owner/:name/tree/:ref',
    async (request, reply) => {
      const { owner, name, ref } = request.params;
      await loadReadableRepository(request, owner, name);
      const tree = await gitInspectService.getTree(owner, name, ref);
      return reply.send({ success: true, data: tree });
    },
  );

  fastify.get<{ Params: { owner: string; name: string; ref: string; '*': string } }>(
    '/repos/:owner/:name/tree/:ref/*',
    async (request, reply) => {
      const { owner, name, ref } = request.params;
      await loadReadableRepository(request, owner, name);
      const tree = await gitInspectService.getTree(owner, name, ref, request.params['*']);
      return reply.send({ success: true, data: tree });
    },
  );

  fastify.get<{ Params: { owner: string; name: string; ref: string; '*': string } }>(
    '/repos/:owner/:name/blob/:ref/*',
    async (request, reply) => {
      const { owner, name, ref } = request.params;
      await loadReadableRepository(request, owner, name);
      const blob = await gitInspectService.getBlob(owner, name, ref, request.params['*']);
      return reply.send({ success: true, data: blob });
    },
  );

  fastify.get<{
    Params: { owner: string; name: string };
    Querystring: { ref?: string; limit?: string | number; skip?: string | number };
  }>('/repos/:owner/:name/commits', async (request, reply) => {
    const query = CommitQuerySchema.parse(request.query);
    const { owner, name } = request.params;
    await loadReadableRepository(request, owner, name);
    const commits = await gitInspectService.getCommits(owner, name, query.ref ?? 'HEAD', {
      limit: query.limit,
      skip: query.skip,
    });
    return reply.send({ success: true, data: commits });
  });

  fastify.get<{ Params: { owner: string; name: string; base: string; head: string } }>(
    '/repos/:owner/:name/compare/:base...:head',
    async (request, reply) => {
      const { owner, name, base, head } = request.params;
      await loadReadableRepository(request, owner, name);
      const diff = await gitInspectService.getDiff(owner, name, base, head);
      return reply.send({ success: true, data: diff });
    },
  );
}
