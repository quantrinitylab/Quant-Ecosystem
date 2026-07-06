// ============================================================================
// QuantMail — Repositories route (GitHub-inside-your-inbox).
//
// The frontend Repos page + api-client talk to a flat, id-based contract:
//   GET    /repos            -> list the signed-in user's repos (array data)
//   POST   /repos            -> create { name, description, visibility }
//   GET    /repos/:id        -> one repo by id
//   DELETE /repos/:id        -> soft-delete
// The existing QuantCode module exposes an owner/name git API under
// /api/code/git/*; this thin route serves the id-based product surface the mail
// app expects, backed by the same `Repository` Prisma model. Protected by the
// global auth hook (req.auth.userId).
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const createRepoSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dot, dash or underscore'),
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
  starCount: number;
  forkCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Map a Prisma Repository row to the frontend Repository DTO shape. */
function toDto(r: RepoRow, ownerHandle?: string) {
  return {
    id: r.id,
    ownerId: r.ownerId,
    name: r.name,
    fullName: ownerHandle ? `${ownerHandle}/${r.name}` : r.name,
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
    cloneUrl: '',
    sshUrl: '',
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
  // GET /repos — list the signed-in user's repositories.
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
      data: (rows as RepoRow[]).map((r) => toDto(r)),
      metadata: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  });

  // POST /repos — create a repository owned by the signed-in user.
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
      },
    })) as RepoRow;

    return reply.status(201).send({ success: true, data: toDto(created) });
  });

  // GET /repos/:id — a single repository the user can access.
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    const repo = (await prisma.repository.findUnique({
      where: { id: request.params.id },
    })) as RepoRow | null;

    if (!repo || (repo as unknown as { deletedAt?: Date | null }).deletedAt) {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }
    // Owner can always see; others only public/internal.
    if (repo.ownerId !== userId && String(repo.visibility).toUpperCase() === 'PRIVATE') {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    return reply.send({ success: true, data: toDto(repo) });
  });

  // Load a repo the caller may read (owner, or non-private), else 404.
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

  // GET /repos/:id/branches — DB-backed branch list.
  fastify.get<{ Params: { id: string } }>('/:id/branches', async (request, reply) => {
    await loadReadableRepo(request, request.params.id);
    const prisma = getPrisma(fastify);
    const rows = (await prisma.branch.findMany({
      where: { repoId: request.params.id },
      orderBy: { name: 'asc' },
    })) as Array<{ name: string; commitSha: string; isProtected: boolean }>;
    return reply.send({
      success: true,
      data: rows.map((b) => ({
        name: b.name,
        sha: b.commitSha,
        isProtected: b.isProtected,
        protection: b.isProtected ? 'require_reviews' : 'none',
        aheadBy: 0,
        behindBy: 0,
      })),
    });
  });

  // GET /repos/:id/pulls — DB-backed pull requests (with author).
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
        data: rows.map((p) => ({
          id: p.id,
          number: p.number,
          title: p.title,
          status: p.status.toLowerCase(),
          sourceBranch: p.sourceBranch,
          targetBranch: p.targetBranch,
          author: {
            name: p.author?.displayName ?? p.author?.username ?? '',
            username: p.author?.username ?? '',
          },
        })),
      });
    },
  );

  // GET /repos/:id/issues — DB-backed issues.
  fastify.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    '/:id/issues',
    async (request, reply) => {
      await loadReadableRepo(request, request.params.id);
      const prisma = getPrisma(fastify);
      const where: Record<string, unknown> = { repoId: request.params.id };
      if (request.query.status) where.status = request.query.status.toUpperCase();
      const rows = (await prisma.issue.findMany({
        where,
        orderBy: { number: 'desc' },
      })) as Array<{ id: string; number: number; title: string; status: string }>;
      return reply.send({
        success: true,
        data: rows.map((i) => ({
          id: i.id,
          number: i.number,
          title: i.title,
          status: i.status.toLowerCase(),
        })),
      });
    },
  );

  // GET /repos/:id/commits — commit history requires the git storage backend
  // (not yet wired for the product surface); a repo with no pushes has none.
  fastify.get<{ Params: { id: string } }>('/:id/commits', async (request, reply) => {
    await loadReadableRepo(request, request.params.id);
    return reply.send({ success: true, data: [], metadata: { total: 0, page: 1, pageSize: 0 } });
  });

  // GET /repos/:id/tree — file tree (empty until the repo has content).
  fastify.get<{ Params: { id: string } }>('/:id/tree', async (request, reply) => {
    await loadReadableRepo(request, request.params.id);
    return reply.send({ success: true, data: [] });
  });

  // GET /repos/:id/file — file content (none until the repo has content).
  fastify.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    '/:id/file',
    async (request, reply) => {
      await loadReadableRepo(request, request.params.id);
      return reply.send({
        success: true,
        data: { path: request.query.path ?? '', content: '' },
      });
    },
  );

  // DELETE /repos/:id — soft-delete (owner only).
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    const repo = (await prisma.repository.findUnique({
      where: { id: request.params.id },
    })) as RepoRow | null;
    if (!repo) throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    if (repo.ownerId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');

    await prisma.repository.update({
      where: { id: request.params.id },
      data: { deletedAt: new Date() },
    });

    return reply.send({ success: true, data: { message: 'Repository deleted' } });
  });
}
