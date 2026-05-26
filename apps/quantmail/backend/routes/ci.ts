import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { PrismaClient } from '@prisma/client';

function getUserId(request: unknown): string {
  const req = request as { auth?: { userId?: string } };
  const userId = req.auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

const ListRunsQuerySchema = z.object({
  branch: z.string().optional(),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export default async function ciRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma?: PrismaClient }).prisma ?? null;
  if (!prisma) {
    throw new Error('PrismaClient is not available. Register the prisma plugin before CI routes.');
  }

  // GET /runs - list CI runs
  fastify.get<{ Params: { owner: string; name: string } }>(
    '/:owner/:name/ci/runs',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const query = ListRunsQuerySchema.parse(request.query);

      const repo = await prisma.repository.findFirst({
        where: { ownerId: owner, name },
      });

      if (!repo) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }

      const where: Record<string, unknown> = { repoId: repo.id };
      if (query.branch) where.branch = query.branch;
      if (query.status) where.status = query.status;

      const runs = await prisma.ciRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });

      return reply.send({ success: true, data: runs });
    },
  );

  // GET /runs/:runId - get specific run
  fastify.get<{ Params: { owner: string; name: string; runId: string } }>(
    '/:owner/:name/ci/runs/:runId',
    async (request, reply) => {
      const userId = getUserId(request);
      const { runId } = request.params;

      const run = await prisma.ciRun.findUnique({
        where: { id: runId },
      });

      if (!run) {
        throw createAppError('CI run not found', 404, 'CI_RUN_NOT_FOUND');
      }

      return reply.send({ success: true, data: run });
    },
  );

  // GET /runs/:runId/jobs - list jobs for run
  fastify.get<{ Params: { owner: string; name: string; runId: string } }>(
    '/:owner/:name/ci/runs/:runId/jobs',
    async (request, reply) => {
      const userId = getUserId(request);
      const { runId } = request.params;

      const run = await prisma.ciRun.findUnique({
        where: { id: runId },
      });

      if (!run) {
        throw createAppError('CI run not found', 404, 'CI_RUN_NOT_FOUND');
      }

      const jobs = await prisma.ciJob.findMany({
        where: { runId },
        orderBy: { createdAt: 'asc' },
      });

      return reply.send({ success: true, data: jobs });
    },
  );

  // GET /runs/:runId/jobs/:jobId/logs - get job logs
  fastify.get<{
    Params: { owner: string; name: string; runId: string; jobId: string };
  }>('/:owner/:name/ci/runs/:runId/jobs/:jobId/logs', async (request, reply) => {
    const userId = getUserId(request);
    const { jobId } = request.params;

    const job = await prisma.ciJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw createAppError('CI job not found', 404, 'CI_JOB_NOT_FOUND');
    }

    const logs = job.logs
      ? job.logs.split('\n').map((line, index) => ({
          line: index + 1,
          content: line,
        }))
      : [];

    return reply.send({ success: true, data: logs });
  });

  // POST /runs/:runId/retry - retry a failed run
  fastify.post<{ Params: { owner: string; name: string; runId: string } }>(
    '/:owner/:name/ci/runs/:runId/retry',
    async (request, reply) => {
      const userId = getUserId(request);
      const { runId } = request.params;

      const run = await prisma.ciRun.findUnique({
        where: { id: runId },
      });

      if (!run) {
        throw createAppError('CI run not found', 404, 'CI_RUN_NOT_FOUND');
      }

      if (run.status !== 'FAILED') {
        throw createAppError('Only failed runs can be retried', 409, 'RUN_NOT_FAILED');
      }

      const retried = await prisma.ciRun.update({
        where: { id: runId },
        data: { status: 'PENDING', startedAt: null, completedAt: null },
      });

      return reply.send({ success: true, data: retried });
    },
  );
}
