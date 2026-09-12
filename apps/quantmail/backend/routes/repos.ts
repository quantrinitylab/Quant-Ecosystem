// ============================================================================
// QuantMail — Repositories route (GitHub-inside-your-inbox).
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const repoNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Use letters, numbers, dot, dash or underscore')
  .refine((name) => !name.toLowerCase().endsWith('.git'), {
    message: 'Repository name cannot be .git or end in .git',
  });

const createRepoSchema = z.object({
  name: repoNameSchema,
  description: z.string().max(500).optional(),
  visibility: z.enum(['public', 'private', 'internal']).optional(),
  initReadme: z.boolean().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  visibility: z.enum(['public', 'private', 'internal']).optional(),
});

type RepoRow = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  visibility: string;
  defaultBranch: string;
  storagePathUrl: string | null;
  starCount: number;
  forkCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function toDto(r: RepoRow, ownerHandle?: string) {
  const slug = ownerHandle ? `${ownerHandle}/${r.name}` : r.name;
  const appUrl = (process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://quantmail.in').replace(/\/$/, '');
  return {
    id: r.id,
    ownerId: r.ownerId,
    name: r.name,
    fullName: slug,
    description: r.description ?? '',
    visibility: String(r.visibility).toLowerCase(),
    defaultBranch: r.defaultBranch,
    language: '',
    languages: {},
    stars: r.starCount,
    forks: r.forkCount,
    openIssues: 0,
    size: 0,
    isTemplate: false,
    isFork: false,
    topics: [] as string[],
    cloneUrl: `${appUrl}/api/code/gitd/repos/${encodeURIComponent(
      r.ownerId,
    )}/${encodeURIComponent(r.name)}.git`,
    sshUrl: `git@quantmail.in:${slug}.git`,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma: unknown }).prisma;
}

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

export default async function reposRoutes(fastify: FastifyInstance) {
  function inspectionPort() {
    if (!fastify.repositoryInspection) {
      throw createAppError('Repository inspection is unavailable', 503, 'INSPECTION_UNAVAILABLE');
    }
    return fastify.repositoryInspection;
  }

  function provisioningPort() {
    if (!fastify.repositoryProvisioning) {
      throw createAppError('Repository storage is unavailable', 503, 'STORAGE_UNAVAILABLE');
    }
    return fastify.repositoryProvisioning;
  }
  fastify.get('/', async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? 30;
    const where: Record<string, unknown> = { ownerId: userId, deletedAt: null };
    if (parsed.data.visibility) where.visibility = parsed.data.visibility.toUpperCase();
    const [rows, total] = await Promise.all([
      prisma.repository.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.repository.count({ where }),
    ]);
    return reply.send({
      success: true,
      data: (rows as RepoRow[]).map((row) => toDto(row)),
      metadata: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  });

  fastify.post('/', async (request, reply) => {
    const parsed = createRepoSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const existing = await prisma.repository.findFirst({
      where: { ownerId: userId, name: parsed.data.name, deletedAt: null },
    });
    if (existing) {
      throw createAppError('A repository with this name already exists', 409, 'REPO_EXISTS');
    }

    const created = (await prisma.repository.create({
      data: {
        ownerId: userId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        visibility: (parsed.data.visibility ?? 'private').toUpperCase(),
        defaultBranch: 'main',
        storagePathUrl: null,
        branches: { create: { name: 'main', commitSha: '' } },
      },
    })) as RepoRow;

    try {
      const { storagePath } = await provisioningPort().provision({
        owner: created.ownerId,
        name: created.name,
      });

      const provisioned = (await prisma.repository.update({
        where: { id: created.id },
        data: { storagePathUrl: storagePath },
      })) as RepoRow;

      return reply.status(201).send({ success: true, data: toDto(provisioned) });
    } catch (error) {
      await prisma.repository.delete({ where: { id: created.id } });
      request.log.error({ err: error, repoId: created.id }, 'repository provisioning failed');
      if ((error as { code?: string }).code === 'REPOSITORY_STORAGE_CONFLICT') {
        throw error;
      }
      throw createAppError(
        'Repository storage could not be provisioned',
        503,
        'STORAGE_UNAVAILABLE',
      );
    }
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const repo = (await prisma.repository.findUnique({ where: { id: request.params.id } })) as
      | (RepoRow & { deletedAt?: Date | null })
      | null;
    if (!repo || repo.deletedAt)
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    if (repo.ownerId !== userId && String(repo.visibility).toUpperCase() === 'PRIVATE') {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }
    return reply.send({ success: true, data: toDto(repo) });
  });

  async function loadReadableRepo(request: unknown, id: string): Promise<RepoRow> {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const repo = (await prisma.repository.findUnique({ where: { id } })) as
      | (RepoRow & { deletedAt?: Date | null })
      | null;
    if (!repo || repo.deletedAt)
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    if (repo.ownerId !== userId && String(repo.visibility).toUpperCase() === 'PRIVATE') {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }
    return repo;
  }

  fastify.get<{ Params: { id: string } }>('/:id/branches', async (request, reply) => {
    const repo = await loadReadableRepo(request, request.params.id);
    const prisma = getPrisma(fastify);
    const rows = (await prisma.branch.findMany({
      where: { repoId: request.params.id },
      orderBy: { name: 'asc' },
    })) as Array<{ name: string; commitSha: string; isProtected: boolean }>;
    return reply.send({
      success: true,
      data: rows.map((branch) => ({
        name: branch.name,
        sha: branch.commitSha,
        isDefault: branch.name === repo.defaultBranch,
        isProtected: branch.isProtected,
        protection: branch.isProtected ? 'require_reviews' : 'none',
        aheadBy: 0,
        behindBy: 0,
      })),
    });
  });

  fastify.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    '/:id/pulls',
    async (request, reply) => {
      await loadReadableRepo(request, request.params.id);
      const prisma = getPrisma(fastify);
      const where: Record<string, unknown> = { repoId: request.params.id };
      if (request.query.status) where.status = request.query.status.toUpperCase();
      const rows = (await prisma.pullRequest.findMany({
        where,
        include: { author: { select: { username: true, displayName: true } } },
        orderBy: { number: 'desc' },
      })) as Array<{
        id: string;
        number: number;
        title: string;
        status: string;
        sourceBranch: string;
        targetBranch: string;
        author?: { username: string; displayName: string | null } | null;
      }>;
      return reply.send({
        success: true,
        data: rows.map((pull) => ({
          id: pull.id,
          number: pull.number,
          title: pull.title,
          status: pull.status.toLowerCase(),
          sourceBranch: pull.sourceBranch,
          targetBranch: pull.targetBranch,
          author: {
            name: pull.author?.displayName ?? pull.author?.username ?? '',
            username: pull.author?.username ?? '',
          },
        })),
      });
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    '/:id/issues',
    async (request, reply) => {
      await loadReadableRepo(request, request.params.id);
      const prisma = getPrisma(fastify);
      const where: Record<string, unknown> = { repoId: request.params.id };
      if (request.query.status) where.status = request.query.status.toUpperCase();
      const rows = (await prisma.issue.findMany({ where, orderBy: { number: 'desc' } })) as Array<{
        id: string;
        number: number;
        title: string;
        status: string;
      }>;
      return reply.send({
        success: true,
        data: rows.map((issue) => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          status: issue.status.toLowerCase(),
        })),
      });
    },
  );

  fastify.get<{
    Params: { id: string };
    Querystring: { ref?: string; limit?: string; skip?: string };
  }>('/:id/commits', async (request, reply) => {
    const repo = await loadReadableRepo(request, request.params.id);
    const limit = Math.max(1, Math.min(100, Number(request.query.limit) || 30));
    const skip = Math.max(0, Number(request.query.skip) || 0);
    const commits = await inspectionPort().listCommits({
      owner: repo.ownerId,
      name: repo.name,
      ref: request.query.ref ?? repo.defaultBranch ?? 'HEAD',
      limit,
      skip,
    });
    return reply.send({
      success: true,
      data: commits,
      metadata: { total: commits.length, page: Math.floor(skip / limit) + 1, pageSize: limit },
    });
  });

  fastify.get<{ Params: { id: string }; Querystring: { ref?: string; path?: string } }>(
    '/:id/tree',
    async (request, reply) => {
      const repo = await loadReadableRepo(request, request.params.id);
      const tree = await inspectionPort().listTree({
        owner: repo.ownerId,
        name: repo.name,
        ref: request.query.ref ?? repo.defaultBranch ?? 'HEAD',
        path: request.query.path,
      });
      return reply.send({ success: true, data: tree });
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { path?: string; ref?: string } }>(
    '/:id/file',
    async (request, reply) => {
      const repo = await loadReadableRepo(request, request.params.id);
      const path = request.query.path;
      if (!path) throw createAppError('File path is required', 400, 'FILE_PATH_REQUIRED');
      const blob = await inspectionPort().readBlob({
        owner: repo.ownerId,
        name: repo.name,
        ref: request.query.ref ?? repo.defaultBranch ?? 'HEAD',
        path,
      });
      return reply.send({ success: true, data: blob });
    },
  );

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const repo = (await prisma.repository.findUnique({
      where: { id: request.params.id },
    })) as RepoRow | null;
    if (!repo) throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    if (repo.ownerId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');
    const deletedAt = new Date();
    const tombstoneName = `${repo.name}-deleted-${deletedAt.getTime()}`;
    const { storagePath } = await provisioningPort().archive({
      owner: repo.ownerId,
      name: repo.name,
      tombstoneName,
    });
    try {
      await prisma.repository.update({
        where: { id: request.params.id },
        data: {
          deletedAt,
          name: tombstoneName,
          storagePathUrl: storagePath ?? repo.storagePathUrl,
        },
      });
    } catch (error) {
      if (storagePath) {
        await provisioningPort().archive({
          owner: repo.ownerId,
          name: tombstoneName,
          tombstoneName: repo.name,
        });
      }
      throw error;
    }
    // Astra GT-12: soft delete preserves the on-disk bare repository for recovery.
    return reply.send({ success: true, data: { message: 'Repository deleted' } });
  });
}
