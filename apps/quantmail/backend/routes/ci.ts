// ============================================================================
// QuantMail — CI/CD product route (/ci/*) for the Pipelines page.
//
// The Pipelines page called /ci/workflows, /ci/builds, /ci/deployments which
// did not exist, so it showed "Failed to load". This route serves that flat
// contract, backed by the CiRun model for builds. There is no workflow-
// definition or deployment model yet, so those return clean empty lists (200)
// — the page renders proper empty states instead of errors. Protected by the
// global auth hook (req.auth.userId).
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma: unknown }).prisma;
}

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

type CiRunRow = {
  id: string;
  repoId: string;
  branch: string;
  commitSha: string;
  status: string;
  triggeredBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

function toBuild(r: CiRunRow, number: number) {
  const duration =
    r.startedAt && r.completedAt
      ? Math.max(0, Math.round((r.completedAt.getTime() - r.startedAt.getTime()) / 1000))
      : undefined;
  return {
    id: r.id,
    number,
    repoId: r.repoId,
    status: r.status.toLowerCase(),
    commitSha: r.commitSha,
    commitMessage: r.commitSha ? r.commitSha.slice(0, 7) : '',
    branch: r.branch,
    author: { name: r.triggeredBy ?? '' },
    duration,
    createdAt: r.createdAt,
  };
}

export default async function ciRoutes(fastify: FastifyInstance) {
  // Resolve the repo ids the caller owns (for scoping builds).
  async function ownedRepoIds(userId: string): Promise<string[]> {
    const prisma = getPrisma(fastify);
    const rows = (await prisma.repository.findMany({
      where: { ownerId: userId, deletedAt: null },
      select: { id: true },
    })) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  // GET /ci/workflows — workflow definitions (feature not yet modelled → empty).
  fastify.get('/ci/workflows', async (request, reply) => {
    requireUserId(request);
    return reply.send({ success: true, data: [] });
  });

  // GET /ci/builds — real CiRun history, scoped to the caller's repos.
  fastify.get<{ Querystring: { repo_id?: string; status?: string; page?: string } }>(
    '/ci/builds',
    async (request, reply) => {
      const userId = requireUserId(request);
      const prisma = getPrisma(fastify);

      const ids = await ownedRepoIds(userId);
      const where: Record<string, unknown> = {};
      if (request.query.repo_id) {
        if (!ids.includes(request.query.repo_id)) {
          return reply.send({
            success: true,
            data: [],
            metadata: { total: 0, page: 1, pageSize: 30 },
          });
        }
        where.repoId = request.query.repo_id;
      } else {
        where.repoId = { in: ids };
      }
      if (request.query.status) where.status = request.query.status.toUpperCase();

      const page = Math.max(1, Number(request.query.page ?? 1) || 1);
      const pageSize = 30;
      const [rows, total] = await Promise.all([
        prisma.ciRun.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.ciRun.count({ where }),
      ]);

      const data = (rows as CiRunRow[]).map((r, i) =>
        toBuild(r, total - (page - 1) * pageSize - i),
      );
      return reply.send({
        success: true,
        data,
        metadata: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      });
    },
  );

  // GET /ci/builds/:id — a single build the caller owns.
  fastify.get<{ Params: { id: string } }>('/ci/builds/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const run = (await prisma.ciRun.findUnique({
      where: { id: request.params.id },
    })) as CiRunRow | null;
    if (!run) throw createAppError('Build not found', 404, 'BUILD_NOT_FOUND');
    const ids = await ownedRepoIds(userId);
    if (!ids.includes(run.repoId)) throw createAppError('Build not found', 404, 'BUILD_NOT_FOUND');
    return reply.send({ success: true, data: toBuild(run, 0) });
  });

  // POST /ci/builds/:id/cancel — cancel a running build (owner only).
  fastify.post<{ Params: { id: string } }>('/ci/builds/:id/cancel', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const run = (await prisma.ciRun.findUnique({
      where: { id: request.params.id },
    })) as CiRunRow | null;
    if (!run) throw createAppError('Build not found', 404, 'BUILD_NOT_FOUND');
    const ids = await ownedRepoIds(userId);
    if (!ids.includes(run.repoId)) throw createAppError('Not authorized', 403, 'FORBIDDEN');

    await prisma.ciRun.update({
      where: { id: request.params.id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    return reply.send({ success: true, data: { message: 'Build cancelled' } });
  });

  // POST /ci/workflows/:id/trigger — with no workflow model, treat :id as a
  // repo id and queue a real CiRun on its default branch (owner only).
  fastify.post<{ Params: { id: string }; Body: { branch?: string } }>(
    '/ci/workflows/:id/trigger',
    async (request, reply) => {
      const userId = requireUserId(request);
      const prisma = getPrisma(fastify);
      const repo = (await prisma.repository.findUnique({ where: { id: request.params.id } })) as {
        id: string;
        ownerId: string;
        defaultBranch: string;
        deletedAt?: Date | null;
      } | null;
      if (!repo || repo.deletedAt)
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      if (repo.ownerId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');

      const run = (await prisma.ciRun.create({
        data: {
          repoId: repo.id,
          branch: request.body?.branch || repo.defaultBranch,
          commitSha: 'HEAD',
          status: 'PENDING',
          triggeredBy: userId,
        },
      })) as { id: string };
      return reply.send({ success: true, data: { buildId: run.id, message: 'Build queued' } });
    },
  );

  // GET /ci/deployments — deployment model not present yet → empty list.
  fastify.get('/ci/deployments', async (request, reply) => {
    requireUserId(request);
    return reply.send({ success: true, data: [] });
  });
}
