// ============================================================================
// QuantMail — Repositories route (GitHub-inside-your-inbox).
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError, RepositoryHeadConflictError } from '@quant/server-core';

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

const createIssueSchema = z.object({
  title: z.string().min(1).max(255),
  body: z.string().max(10000).optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
});

const createIssueCommentSchema = z
  .object({
    body: z.string().trim().min(1, 'Comment body is required').max(10_000),
  })
  .strict();

const issueCommentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const createPrSchema = z.object({
  title: z.string().min(1).max(255),
  body: z.string().max(10000).optional(),
  sourceBranch: z.string().min(1).max(100),
  targetBranch: z.string().min(1).max(100).optional(),
});

const updateRepoSchema = z.object({
  name: repoNameSchema.optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(['public', 'private', 'internal']).optional(),
  defaultBranch: z.string().min(1).max(100).optional(),
});

const createBranchSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9/_.-]+$/, 'Invalid branch name'),
  sha: z
    .string()
    .regex(/^[0-9a-f]{40}$/i, 'sha must be a 40-char SHA')
    .transform((value) => value.toLowerCase())
    .optional(),
});

const MAX_AUTHORED_FILE_BYTES = 2 * 1024 * 1024;

const repositoryFilePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine((value) => !value.startsWith('/') && !value.includes('\\') && !value.includes('\0'), {
    message: 'Path must be repository-relative',
  })
  .refine(
    (value) =>
      value.split('/').every((segment) => segment !== '' && segment !== '..' && segment !== '.git'),
    {
      message: 'Path contains a forbidden segment',
    },
  );

const repositoryBranchSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._/-]+$/, 'Invalid branch name')
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.endsWith('/') &&
      !value.includes('..') &&
      !value.includes('//') &&
      !value.includes('@{') &&
      !value.endsWith('.lock'),
    {
      message: 'Invalid branch name',
    },
  );

const commitFileSchema = z
  .object({
    path: repositoryFilePathSchema,
    branch: repositoryBranchSchema,
    content: z
      .string()
      .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_AUTHORED_FILE_BYTES, {
        message: 'File exceeds the 2 MiB authoring limit',
      }),
    message: z.string().trim().min(1).max(500),
    parentSha: z
      .string()
      .regex(/^[0-9a-f]{40}$/i, 'parentSha must be a 40-char SHA')
      .transform((value) => value.toLowerCase())
      .nullable(),
  })
  .strict();

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
  branches?: Array<{
    name: string;
    commitSha: string;
    isProtected: boolean;
  }>;
};

function toDto(r: RepoRow, ownerHandle?: string) {
  const slug = ownerHandle ? `${ownerHandle}/${r.name}` : r.name;
  const appUrl = (process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://quantmail.in').replace(/\/$/, '');
  const defaultBranchRow = (r as any).branches?.find(
    (branch: any) => branch.name === r.defaultBranch,
  );
  const latestCommitSha = defaultBranchRow?.commitSha ?? '';

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
    watching: 0,
    openIssues: 0,
    size: 0,
    isTemplate: false,
    isFork: false,
    topics: [],
    latestCommit: latestCommitSha ? `Commit ${latestCommitSha.slice(0, 7)}` : '',
    latestCommitSha,
    latestCommitTime: '',
    checksStatus: 'none',
    license: '',
    website: '',
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

  function mutationPort() {
    if (!fastify.repositoryMutation) {
      throw createAppError(
        'Repository mutation storage is unavailable',
        503,
        'REPOSITORY_MUTATION_UNAVAILABLE',
      );
    }

    return fastify.repositoryMutation;
  }
  fastify.get('/', async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? 30;

    if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_REPO_SEEDING === 'true') {
      try {
        const totalExisting = await prisma.repository.count({
          where: { deletedAt: null },
        });

        if (totalExisting === 0) {
          const seedRepos = [
            {
              name: 'Quant-Ecosystem',
              description:
                'The unified ecosystem monorepo — 10 apps, 1 identity, shared AI operating system.',
              visibility: 'PUBLIC',
              defaultBranch: 'main',
              starCount: 342,
              forkCount: 48,
            },
            {
              name: 'quantmail-core',
              description:
                'High-performance email client with offline sync, Bayesian spam filtering, and SES/SMTP pipeline.',
              visibility: 'PUBLIC',
              defaultBranch: 'main',
              starCount: 128,
              forkCount: 19,
            },
            {
              name: 'quantchat-meet',
              description:
                'Real-time messaging, WebRTC calling via LiveKit, SFU gateway, and voice bot alarms.',
              visibility: 'PUBLIC',
              defaultBranch: 'main',
              starCount: 95,
              forkCount: 12,
            },
            {
              name: 'quant-mobile-android',
              description:
                'Capacitor launcher shell & native Android SDK bridges for the entire Quant platform.',
              visibility: 'PUBLIC',
              defaultBranch: 'main',
              starCount: 76,
              forkCount: 8,
            },
          ];

          for (const seedRepo of seedRepos) {
            await prisma.repository
              .create({
                data: {
                  ownerId: userId,
                  name: seedRepo.name,
                  description: seedRepo.description,
                  visibility: seedRepo.visibility as any,
                  defaultBranch: seedRepo.defaultBranch,
                  starCount: seedRepo.starCount,
                  forkCount: seedRepo.forkCount,
                },
              })
              .catch(() => {});
          }
        }
      } catch {
        // Development-only sample seeding must not prevent repository listing.
      }
    }

    const where: Record<string, unknown> = {
      OR: [{ ownerId: userId }, { visibility: 'PUBLIC' }],
      deletedAt: null,
    };
    if (parsed.data.visibility) where.visibility = parsed.data.visibility.toUpperCase();
    const [rows, total] = await Promise.all([
      prisma.repository.findMany({
        where,
        include: { branches: true },
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
        visibility: (parsed.data.visibility ?? 'private').toUpperCase() as any,
        defaultBranch: 'main',
        storagePathUrl: null,
      },
    })) as RepoRow;

    let storagePath: string | null = null;
    if (fastify.repositoryProvisioning) {
      try {
        const res = await fastify.repositoryProvisioning.provision({
          owner: created.ownerId,
          name: created.name,
        });
        storagePath = res.storagePath;
      } catch (storageErr) {
        request.log.warn(
          { err: storageErr, repoId: created.id },
          'repository storage provisioning notice',
        );
      }
    }

    if (parsed.data.initReadme && fastify.repositoryMutation) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { username: true, displayName: true, email: true },
        });
        const commit = await fastify.repositoryMutation.commitFile({
          owner: userId,
          name: created.name,
          branch: 'main',
          path: 'README.md',
          content: `# ${created.name}\n\n${created.description || 'Repository created on QuantGit.'}\n`,
          message: 'Initial commit: README.md',
          expectedHeadSha: null,
          author: {
            name: user?.displayName || user?.username || 'Quanty',
            email: user?.email || `${userId}@quantmail.in`,
          },
        });
        await prisma.branch.create({
          data: { repoId: created.id, name: 'main', commitSha: commit.commitSha },
        });
      } catch (readmeErr) {
        request.log.warn({ err: readmeErr }, 'repository initial README commit notice');
      }
    }

    const provisioned = (await prisma.repository.update({
      where: { id: created.id },
      data: { storagePathUrl: storagePath },
      include: { branches: true },
    })) as RepoRow;

    return reply.status(201).send({ success: true, data: toDto(provisioned) });
  });

  async function loadReadableRepo(request: unknown, idOrName: string): Promise<RepoRow> {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    let repo = (await prisma.repository.findUnique({
      where: { id: idOrName },
      include: { branches: true },
    })) as (RepoRow & { deletedAt?: Date | null }) | null;
    if (!repo) {
      repo = (await prisma.repository.findFirst({
        where: { name: idOrName, ownerId: userId, deletedAt: null },
        include: { branches: true },
      })) as (RepoRow & { deletedAt?: Date | null }) | null;
    }
    if (!repo) {
      repo = (await prisma.repository.findFirst({
        where: {
          name: idOrName,
          visibility: { in: ['PUBLIC', 'INTERNAL'] },
          deletedAt: null,
        },
        include: { branches: true },
      })) as (RepoRow & { deletedAt?: Date | null }) | null;
    }
    if (!repo || repo.deletedAt)
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    if (repo.ownerId !== userId && String(repo.visibility).toUpperCase() === 'PRIVATE') {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }
    return repo;
  }

  async function loadWritableRepo(request: unknown, idOrName: string): Promise<RepoRow> {
    const userId = requireUserId(request);
    const repo = await loadReadableRepo(request, idOrName);
    if (repo.ownerId !== userId) {
      throw createAppError(
        'You do not have write permission for this repository',
        403,
        'FORBIDDEN',
      );
    }
    return repo;
  }

  /*
   * PATCH is canonical. POST is a compatibility alias for autonomous clients
   * that expose only create-style tool calls.
   */
  fastify.route<{
    Params: { id: string };
    Body: z.infer<typeof commitFileSchema>;
  }>({
    method: ['PATCH', 'POST'],
    url: '/:id/file',
    handler: async (request, reply) => {
      /*
       * Authorize before parsing or touching repository storage. This keeps
       * missing/private repositories indistinguishable to unauthorized users.
       */
      const repo = await loadWritableRepo(request, request.params.id);
      const userId = requireUserId(request);

      if (
        !request.body ||
        typeof request.body !== 'object' ||
        !Object.prototype.hasOwnProperty.call(request.body, 'parentSha')
      ) {
        throw createAppError(
          'parentSha is required and must be a 40-character SHA or null',
          400,
          'PARENT_SHA_REQUIRED',
        );
      }

      const parsed = commitFileSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const prisma = getPrisma(fastify);
      const targetBranch = parsed.data.branch;

      /*
       * Non-default branches must be represented in the Branch table.
       * The default branch is allowed to be absent because a newly provisioned
       * bare repository may not have received its first commit yet.
       */
      const branchRecord = await prisma.branch.findUnique({
        where: {
          repoId_name: {
            repoId: repo.id,
            name: targetBranch,
          },
        },
      });

      if (!branchRecord && targetBranch !== repo.defaultBranch) {
        throw createAppError('Branch not found', 404, 'BRANCH_NOT_FOUND');
      }

      if (branchRecord?.isProtected) {
        throw createAppError('Cannot commit to protected branch', 403, 'BRANCH_PROTECTED');
      }

      /*
       * The actual bare-repository ref is authoritative. Branch.commitSha is a
       * query/index projection that is updated after the Git CAS succeeds.
       */
      const currentHeadSha = await mutationPort().getBranchHead({
        owner: repo.ownerId,
        name: repo.name,
        branch: targetBranch,
      });

      const expectedHeadSha = parsed.data.parentSha?.toLowerCase() ?? null;
      const normalizedCurrentHeadSha = currentHeadSha?.toLowerCase() ?? null;

      if (expectedHeadSha !== normalizedCurrentHeadSha) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'STALE_PARENT_SHA',
            message: 'The branch head changed. Reload the file before committing.',
          },
          currentHeadSha: normalizedCurrentHeadSha,
        });
      }

      const author = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          username: true,
          displayName: true,
          email: true,
        },
      });

      if (!author) {
        throw createAppError('Authenticated user not found', 401, 'UNAUTHORIZED');
      }

      let committed: {
        commitSha: string;
        blobSha: string;
        previousHeadSha: string | null;
        path: string;
        branch: string;
      };

      try {
        committed = await mutationPort().commitFile({
          owner: repo.ownerId,
          name: repo.name,
          branch: targetBranch,
          path: parsed.data.path,
          content: parsed.data.content,
          message: parsed.data.message,
          expectedHeadSha,
          author: {
            name: author.displayName || author.username,
            email: author.email,
          },
        });
      } catch (error) {
        /*
         * Covers the race where the branch changes after getBranchHead but
         * before update-ref. The mutation service performs the final atomic CAS.
         */
        if (error instanceof RepositoryHeadConflictError) {
          return reply.status(409).send({
            success: false,
            error: {
              code: 'STALE_PARENT_SHA',
              message: 'The branch head changed. Reload the file before committing.',
            },
            currentHeadSha: error.currentHeadSha,
          });
        }

        throw error;
      }

      try {
        await prisma.$transaction(async (transaction: any) => {
          await transaction.branch.upsert({
            where: {
              repoId_name: {
                repoId: repo.id,
                name: targetBranch,
              },
            },
            update: {
              commitSha: committed.commitSha,
            },
            create: {
              repoId: repo.id,
              name: targetBranch,
              commitSha: committed.commitSha,
            },
          });

          /*
           * The current schema has no dedicated Commit model. CiRun is the
           * existing durable commit event and CI dispatch record.
           */
          await transaction.ciRun.create({
            data: {
              repoId: repo.id,
              branch: targetBranch,
              commitSha: committed.commitSha,
              status: 'PENDING',
              triggeredBy: author.username,
            },
          });
        });
      } catch (databaseError) {
        /*
         * Git and PostgreSQL cannot share a transaction. Compensate the ref
         * update if branch metadata / CI event persistence fails.
         */
        try {
          await mutationPort().rollbackCommit({
            owner: repo.ownerId,
            name: repo.name,
            branch: targetBranch,
            expectedCurrentSha: committed.commitSha,
            restoreHeadSha: committed.previousHeadSha,
          });
        } catch (rollbackError) {
          request.log.error(
            {
              err: rollbackError,
              repoId: repo.id,
              commitSha: committed.commitSha,
            },
            'failed to compensate Git ref after database transaction failure',
          );
        }

        throw databaseError;
      }

      return reply.status(200).send({
        success: true,
        data: {
          commitSha: committed.commitSha,
          blobSha: committed.blobSha,
          path: committed.path,
          branch: targetBranch,
          message: parsed.data.message,
        },
      });
    },
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const repo = await loadReadableRepo(request, request.params.id);
    return reply.send({ success: true, data: toDto(repo) });
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const repo = await loadWritableRepo(request, request.params.id);
    const parsed = updateRepoSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name && parsed.data.name !== repo.name) {
      const existing = await prisma.repository.findFirst({
        where: { ownerId: userId, name: parsed.data.name, deletedAt: null },
      });
      if (existing && existing.id !== repo.id) {
        throw createAppError('A repository with this name already exists', 409, 'REPO_EXISTS');
      }
      updateData.name = parsed.data.name;
    }
    if (parsed.data.description !== undefined) {
      updateData.description = parsed.data.description;
    }
    if (parsed.data.visibility) {
      updateData.visibility = parsed.data.visibility.toUpperCase();
    }
    if (parsed.data.defaultBranch) {
      updateData.defaultBranch = parsed.data.defaultBranch;
    }

    const updated = (await prisma.repository.update({
      where: { id: repo.id },
      data: updateData,
      include: { branches: true },
    })) as RepoRow;

    return reply.send({ success: true, data: toDto(updated) });
  });

  fastify.post<{ Params: { id: string } }>('/:id/star', async (request, reply) => {
    const repo = await loadReadableRepo(request, request.params.id);
    const prisma = getPrisma(fastify);
    const updated = await prisma.repository.update({
      where: { id: repo.id },
      data: { starCount: { increment: 1 } },
    });
    return reply.send({
      success: true,
      data: { id: updated.id, stars: updated.starCount },
    });
  });

  fastify.delete<{ Params: { id: string } }>('/:id/star', async (request, reply) => {
    const repo = await loadReadableRepo(request, request.params.id);
    const prisma = getPrisma(fastify);
    const updated = await prisma.repository.update({
      where: { id: repo.id },
      data: { starCount: Math.max(0, repo.starCount - 1) },
    });
    return reply.send({
      success: true,
      data: { id: updated.id, stars: updated.starCount },
    });
  });

  fastify.get<{ Params: { id: string } }>('/:id/branches', async (request, reply) => {
    const repo = await loadReadableRepo(request, request.params.id);
    const prisma = getPrisma(fastify);
    const rows = (await prisma.branch.findMany({
      where: { repoId: repo.id },
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

  fastify.post<{ Params: { id: string } }>('/:id/branches', async (request, reply) => {
    const repo = await loadWritableRepo(request, request.params.id);
    const parsed = createBranchSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const prisma = getPrisma(fastify);

    const existing = await prisma.branch.findFirst({
      where: { repoId: repo.id, name: parsed.data.name },
    });
    if (existing) {
      throw createAppError('Branch already exists', 409, 'BRANCH_EXISTS');
    }

    let parentCommitSha = parsed.data.sha;

    if (!parentCommitSha) {
      const defaultBranchRow = await prisma.branch.findUnique({
        where: {
          repoId_name: {
            repoId: repo.id,
            name: repo.defaultBranch,
          },
        },
      });

      parentCommitSha =
        defaultBranchRow?.commitSha ??
        (await mutationPort().getBranchHead({
          owner: repo.ownerId,
          name: repo.name,
          branch: repo.defaultBranch,
        })) ??
        undefined;
    }

    if (!parentCommitSha) {
      throw createAppError(
        'Cannot create branch: parent commit SHA not found',
        400,
        'BRANCH_NOT_FOUND',
      );
    }

    parentCommitSha = parentCommitSha.toLowerCase();

    const branch = await prisma.branch.create({
      data: {
        repoId: repo.id,
        name: parsed.data.name,
        commitSha: parentCommitSha,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        name: branch.name,
        sha: branch.commitSha,
        isDefault: branch.name === repo.defaultBranch,
        isProtected: branch.isProtected,
        protection: branch.isProtected ? 'require_reviews' : 'none',
        aheadBy: 0,
        behindBy: 0,
      },
    });
  });

  fastify.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    '/:id/pulls',
    async (request, reply) => {
      const repo = await loadReadableRepo(request, request.params.id);
      const prisma = getPrisma(fastify);
      const where: Record<string, unknown> = { repoId: repo.id };
      if (request.query.status) where.status = request.query.status.toUpperCase();
      const rows = (await prisma.pullRequest.findMany({
        where,
        include: { author: { select: { username: true, displayName: true } } },
        orderBy: { number: 'desc' },
      })) as Array<{
        id: string;
        number: number;
        title: string;
        body: string | null;
        status: string;
        sourceBranch: string;
        targetBranch: string;
        createdAt: Date;
        author?: { username: string; displayName: string | null } | null;
      }>;
      return reply.send({
        success: true,
        data: rows.map((pull) => ({
          id: pull.number,
          number: pull.number,
          title: pull.title,
          body: pull.body ?? '',
          state: pull.status.toLowerCase(),
          status: pull.status.toLowerCase(),
          author: pull.author?.username ?? 'user',
          branchSource: pull.sourceBranch,
          branchTarget: pull.targetBranch,
          checksStatus: 'none',
          commentsCount: 0,
          createdAt: pull.createdAt.toISOString(),
          additions: 0,
          deletions: 0,
          changedFiles: 0,
        })),
      });
    },
  );

  fastify.post<{ Params: { id: string } }>('/:id/pulls', async (request, reply) => {
    const repo = await loadReadableRepo(request, request.params.id);
    const parsed = createPrSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    const latest = await prisma.pullRequest.findFirst({
      where: { repoId: repo.id },
      orderBy: { number: 'desc' },
    });
    const nextNumber = (latest?.number ?? 0) + 1;

    const pr = await prisma.pullRequest.create({
      data: {
        repoId: repo.id,
        number: nextNumber,
        title: parsed.data.title,
        body: parsed.data.body ?? '',
        authorId: userId,
        sourceBranch: parsed.data.sourceBranch,
        targetBranch: parsed.data.targetBranch ?? repo.defaultBranch ?? 'main',
        status: 'OPEN',
      },
      include: {
        author: { select: { username: true, displayName: true } },
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: pr.number,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.status.toLowerCase(),
        status: pr.status.toLowerCase(),
        author: pr.author?.username ?? 'user',
        branchSource: pr.sourceBranch,
        branchTarget: pr.targetBranch,
        checksStatus: 'none',
        commentsCount: 0,
        createdAt: pr.createdAt.toISOString(),
        additions: 0,
        deletions: 0,
        changedFiles: 0,
      },
    });
  });

  fastify.post<{ Params: { id: string; number: string } }>(
    '/:id/pulls/:number/merge',
    async (request, reply) => {
      const repo = await loadWritableRepo(request, request.params.id);
      const num = parseInt(request.params.number, 10);
      if (isNaN(num)) throw createAppError('Invalid PR number', 400, 'INVALID_NUMBER');
      const prisma = getPrisma(fastify);

      const pr = await prisma.pullRequest.findFirst({
        where: { repoId: repo.id, number: num },
        include: { author: { select: { username: true, displayName: true } } },
      });
      if (!pr) throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');

      const merged = await prisma.pullRequest.update({
        where: { id: pr.id },
        data: {
          status: 'MERGED',
          mergedAt: new Date(),
        },
        include: { author: { select: { username: true, displayName: true } } },
      });

      return reply.send({
        success: true,
        data: {
          id: merged.number,
          number: merged.number,
          title: merged.title,
          body: merged.body ?? '',
          state: 'merged',
          status: 'merged',
          author: merged.author?.username ?? 'user',
          branchSource: merged.sourceBranch,
          branchTarget: merged.targetBranch,
          checksStatus: 'none',
          commentsCount: 0,
          createdAt: merged.createdAt.toISOString(),
          mergedAt: merged.mergedAt?.toISOString(),
          additions: 0,
          deletions: 0,
          changedFiles: 0,
        },
      });
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    '/:id/issues',
    async (request, reply) => {
      const repo = await loadReadableRepo(request, request.params.id);
      const prisma = getPrisma(fastify);
      const where: Record<string, unknown> = { repoId: repo.id };
      if (request.query.status) where.status = request.query.status.toUpperCase();
      const rows = (await prisma.issue.findMany({
        where,
        include: {
          author: { select: { username: true, displayName: true } },
          _count: { select: { comments: true } },
        },
        orderBy: { number: 'desc' },
      })) as Array<{
        id: string;
        number: number;
        title: string;
        body: string | null;
        status: string;
        labels: unknown;
        createdAt: Date;
        author?: { username: string; displayName: string | null } | null;
        _count?: { comments: number };
      }>;
      return reply.send({
        success: true,
        data: rows.map((issue) => {
          let rawLabels: any[] = [];
          if (Array.isArray(issue.labels)) {
            rawLabels = issue.labels;
          } else if (typeof issue.labels === 'string') {
            try {
              rawLabels = JSON.parse(issue.labels);
            } catch {
              rawLabels = [];
            }
          }
          return {
            id: issue.number,
            number: issue.number,
            title: issue.title,
            body: issue.body ?? '',
            state: issue.status.toLowerCase(),
            status: issue.status.toLowerCase(),
            author: issue.author?.username ?? 'user',
            labels: rawLabels.map((lbl: any) =>
              typeof lbl === 'string'
                ? { name: lbl, color: lbl === 'bug' ? '#D73A4A' : '#1D76DB' }
                : lbl,
            ),
            commentsCount: issue._count?.comments ?? 0,
            createdAt: issue.createdAt.toISOString(),
            assignee: ((issue as any).assignees as string[])?.[0] ?? null,
          };
        }),
      });
    },
  );

  fastify.post<{ Params: { id: string } }>('/:id/issues', async (request, reply) => {
    const repo = await loadReadableRepo(request, request.params.id);
    const parsed = createIssueSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    const latest = await prisma.issue.findFirst({
      where: { repoId: repo.id },
      orderBy: { number: 'desc' },
    });
    const nextNumber = (latest?.number ?? 0) + 1;

    const issue = await prisma.issue.create({
      data: {
        repoId: repo.id,
        number: nextNumber,
        title: parsed.data.title,
        body: parsed.data.body ?? '',
        authorId: userId,
        labels: parsed.data.labels ?? [],
        assignees: parsed.data.assignees ?? [],
        status: 'OPEN',
      },
      include: {
        author: { select: { username: true, displayName: true } },
      },
    });

    const labelsList = Array.isArray(issue.labels)
      ? (issue.labels as string[]).map((name) => ({
          name,
          color: name === 'bug' ? '#D73A4A' : '#1D76DB',
        }))
      : [];

    return reply.status(201).send({
      success: true,
      data: {
        id: issue.number,
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.status.toLowerCase(),
        status: issue.status.toLowerCase(),
        author: issue.author?.username ?? 'user',
        labels: labelsList,
        commentsCount: 0,
        createdAt: issue.createdAt.toISOString(),
        assignee: ((issue as any).assignees as string[])?.[0] ?? null,
      },
    });
  });

  fastify.post<{ Params: { id: string; number: string } }>(
    '/:id/issues/:number/toggle',
    async (request, reply) => {
      const userId = requireUserId(request);
      const repo = await loadReadableRepo(request, request.params.id);
      const num = parseInt(request.params.number, 10);
      if (isNaN(num)) throw createAppError('Invalid issue number', 400, 'INVALID_NUMBER');
      const prisma = getPrisma(fastify);
      const issue = await prisma.issue.findFirst({
        where: { repoId: repo.id, number: num },
      });
      if (!issue) throw createAppError('Issue not found', 404, 'ISSUE_NOT_FOUND');
      if (repo.ownerId !== userId && issue.authorId !== userId) {
        throw createAppError('You do not have permission to modify this issue', 403, 'FORBIDDEN');
      }
      const nextStatus = issue.status === 'OPEN' ? 'CLOSED' : 'OPEN';
      const updated = await prisma.issue.update({
        where: { id: issue.id },
        data: {
          status: nextStatus,
          closedAt: nextStatus === 'CLOSED' ? new Date() : null,
        },
      });
      return reply.send({
        success: true,
        data: {
          id: updated.number,
          number: updated.number,
          state: updated.status.toLowerCase(),
          status: updated.status.toLowerCase(),
        },
      });
    },
  );

  fastify.get<{
    Params: { id: string; number: string };
    Querystring: { page?: string; pageSize?: string };
  }>('/:id/issues/:number/comments', async (request, reply) => {
    const repo = await loadReadableRepo(request, request.params.id);
    const number = Number.parseInt(request.params.number, 10);
    if (!Number.isSafeInteger(number) || number < 1) {
      throw createAppError('Invalid issue number', 400, 'INVALID_NUMBER');
    }

    const parsedQuery = issueCommentsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) throw parsedQuery.error;

    const prisma = getPrisma(fastify);
    const issue = await prisma.issue.findFirst({
      where: { repoId: repo.id, number },
      select: { id: true },
    });
    if (!issue) {
      throw createAppError('Issue not found', 404, 'ISSUE_NOT_FOUND');
    }

    const page = parsedQuery.data.page ?? 1;
    const pageSize = parsedQuery.data.pageSize ?? 30;
    const where = { issueId: issue.id };
    const [comments, total] = await Promise.all([
      prisma.issueComment.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.issueComment.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: comments.map((comment: any) => ({
        id: comment.id,
        issueNumber: number,
        body: comment.body,
        author: comment.author,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
      })),
      metadata: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  });

  fastify.post<{
    Params: { id: string; number: string };
  }>('/:id/issues/:number/comments', async (request, reply) => {
    const repo = await loadReadableRepo(request, request.params.id);
    const number = Number.parseInt(request.params.number, 10);
    if (!Number.isSafeInteger(number) || number < 1) {
      throw createAppError('Invalid issue number', 400, 'INVALID_NUMBER');
    }

    const parsedBody = createIssueCommentSchema.safeParse(request.body);
    if (!parsedBody.success) throw parsedBody.error;

    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const issue = await prisma.issue.findFirst({
      where: { repoId: repo.id, number },
      select: { id: true },
    });
    if (!issue) {
      throw createAppError('Issue not found', 404, 'ISSUE_NOT_FOUND');
    }

    const comment = await prisma.issueComment.create({
      data: {
        issueId: issue.id,
        authorId: userId,
        body: parsedBody.data.body,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: comment.id,
        issueNumber: number,
        body: comment.body,
        author: comment.author,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
      },
    });
  });

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

  fastify.get<{ Params: { id: string } }>('/:id/actions', async (request, reply) => {
    const repo = await loadReadableRepo(request, request.params.id);
    const prisma = getPrisma(fastify);

    let runs = await prisma.ciRun.findMany({
      where: { repoId: repo.id },
      include: { jobs: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    if (
      runs.length === 0 &&
      process.env.NODE_ENV === 'development' &&
      process.env.ENABLE_DEV_REPO_SEEDING === 'true'
    ) {
      // Auto-seed default realistic workflow runs for the repository
      const seeds = [
        {
          branch: repo.defaultBranch || 'main',
          commitSha: '317ed52d',
          status: 'SUCCESS' as const,
          triggeredBy: 'Developer 6',
          jobs: [
            {
              name: 'Validate immutable main release',
              status: 'SUCCESS' as const,
              startedAt: new Date(Date.now() - 300000),
              completedAt: new Date(Date.now() - 296000),
            },
            {
              name: 'Build and deploy quantmail',
              status: 'SUCCESS' as const,
              startedAt: new Date(Date.now() - 295000),
              completedAt: new Date(Date.now() - 4000),
            },
          ],
        },
        {
          branch: repo.defaultBranch || 'main',
          commitSha: 'ea67d137',
          status: 'SUCCESS' as const,
          triggeredBy: 'Sentinel',
          jobs: [
            {
              name: 'Vitest Unit & Integration Suites',
              status: 'SUCCESS' as const,
              startedAt: new Date(Date.now() - 600000),
              completedAt: new Date(Date.now() - 350000),
            },
            {
              name: 'TypeScript Strict Typecheck',
              status: 'SUCCESS' as const,
              startedAt: new Date(Date.now() - 350000),
              completedAt: new Date(Date.now() - 200000),
            },
          ],
        },
        {
          branch: repo.defaultBranch || 'main',
          commitSha: '948e3612',
          status: 'SUCCESS' as const,
          triggeredBy: 'Astra',
          jobs: [
            {
              name: 'Security Audit & CodeQL Advanced',
              status: 'SUCCESS' as const,
              startedAt: new Date(Date.now() - 900000),
              completedAt: new Date(Date.now() - 700000),
            },
          ],
        },
      ];
      for (const s of seeds) {
        await prisma.ciRun.create({
          data: {
            repoId: repo.id,
            branch: s.branch,
            commitSha: s.commitSha,
            status: s.status,
            triggeredBy: s.triggeredBy,
            jobs: {
              create: s.jobs,
            },
          },
        });
      }
      runs = await prisma.ciRun.findMany({
        where: { repoId: repo.id },
        include: { jobs: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
    }

    return reply.send({
      success: true,
      data: runs.map((r: any, idx: number) => ({
        id: r.id,
        number: idx + 1,
        name: r.triggeredBy ? `Build triggered by ${r.triggeredBy}` : `Workflow run #${idx + 1}`,
        workflow: r.jobs?.[0]?.name ? 'CI / Staging Pipeline' : 'All workflows',
        status: String(r.status).toLowerCase(),
        branch: r.branch,
        event: 'push',
        commitSha: r.commitSha,
        duration: '4m 55s',
        timeAgo: 'recently',
        jobs: (r.jobs || []).map((j: any) => ({
          id: j.id,
          name: j.name,
          status: String(j.status).toLowerCase(),
          duration: '2m 10s',
        })),
      })),
    });
  });

  fastify.post<{ Params: { id: string } }>('/:id/actions/trigger', async (request, reply) => {
    const repo = await loadWritableRepo(request, request.params.id);

    if (process.env.NODE_ENV !== 'development' || process.env.ENABLE_DEV_REPO_SEEDING !== 'true') {
      throw createAppError(
        'Synthetic workflow triggering is unavailable in this environment',
        503,
        'CI_TRIGGER_UNAVAILABLE',
      );
    }

    const prisma = getPrisma(fastify);

    const newRun = await prisma.ciRun.create({
      data: {
        repoId: repo.id,
        branch: repo.defaultBranch || 'main',
        commitSha: '317ed52d',
        status: 'RUNNING',
        triggeredBy: 'kundan',
        jobs: {
          create: [
            {
              name: 'Validate immutable main release',
              status: 'SUCCESS',
              startedAt: new Date(),
              completedAt: new Date(),
            },
            {
              name: 'Build and deploy quantmail',
              status: 'RUNNING',
              startedAt: new Date(),
            },
          ],
        },
      },
      include: { jobs: true },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: newRun.id,
        number: 1,
        name: `Manual run on ${newRun.branch}`,
        workflow: 'CI / Staging Pipeline',
        status: 'in_progress',
        branch: newRun.branch,
        event: 'workflow_dispatch',
        commitSha: newRun.commitSha,
        duration: 'in progress',
        timeAgo: 'just now',
        jobs: newRun.jobs.map((j: any) => ({
          id: j.id,
          name: j.name,
          status: String(j.status).toLowerCase(),
          duration: 'running',
        })),
      },
    });
  });

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
