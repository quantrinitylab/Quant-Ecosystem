import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { PrismaClient } from '@prisma/client';
import { TypedQueue, CiRunJobSchema, CI_RUNS_QUEUE_NAME } from '@quant/queue';
import { PipelineService, createQueueCiRunnerPort } from '../services/pipeline.service';
import { ciRedisConnection } from '../services/ci-run-events';

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
 * cannot even learn that a private repository exists.
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

/**
 * Loads the repository (with the visibility gate above) and scopes the CI run
 * to it: run ids from other repositories must never resolve through this path.
 */
async function loadRepoRun(
  prisma: PrismaClient,
  request: unknown,
  owner: string,
  name: string,
  runId: string,
) {
  const repo = await loadReadableRepository(prisma, request, owner, name);
  const run = await prisma.ciRun.findFirst({
    where: { id: runId, repoId: repo.id },
  });
  if (!run) {
    throw createAppError('CI run not found', 404, 'CI_RUN_NOT_FOUND');
  }
  return { repo, run };
}

const ListRunsQuerySchema = z.object({
  branch: z.string().optional(),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const TriggerPipelineSchema = z.object({
  ref: z.string().min(1),
  type: z.enum(['PUSH', 'PULL_REQUEST', 'MANUAL', 'AGENT']).default('MANUAL'),
  commitSha: z.string().optional(),
  prId: z.string().optional(),
  configYaml: z.string().optional(),
  variables: z.record(z.string()).optional(),
});

export default async function ciRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma?: PrismaClient }).prisma ?? null;
  if (!prisma) {
    throw new Error('PrismaClient is not available. Register the prisma plugin before CI routes.');
  }
  // Production wiring (fix/qm-quantgit-ci-runs): the queue-backed ci-runner
  // adapter. Previously this used the default noop adapter, so every triggered
  // run sat PENDING forever and branch-protection status checks could never
  // go green. The CiRun row's status is flipped PENDING -> RUNNING ->
  // SUCCESS|FAILED by the ci-runs queue-events listener started in app.ts.
  const ciRunsQueue = new TypedQueue(CI_RUNS_QUEUE_NAME, CiRunJobSchema, ciRedisConnection());
  // Explicit queue lifecycle (fix/qm-ci-queue-lifecycle-4): the route plugin
  // owns this BullMQ queue, so close it when the Fastify instance closes.
  // Without this, the queue's Redis connection outlives app.close() —
  // orphaning reconnect attempts during teardown (gate red:
  // EnvironmentTeardownError 'Closing rpc while onUserConsoleLog was pending'
  // + Redis reconnect refusals). The guard makes repeated closes a no-op so
  // the queue is closed exactly once per registration.
  let ciRunsQueueClosed = false;
  fastify.addHook('onClose', async () => {
    if (ciRunsQueueClosed) return;
    ciRunsQueueClosed = true;
    await ciRunsQueue.close();
  });
  const pipelineService = new PipelineService(prisma, {
    ciRunner: createQueueCiRunnerPort(ciRunsQueue),
  });

  // GET /runs - list CI runs
  fastify.get<{ Params: { owner: string; name: string } }>(
    '/:owner/:name/ci/runs',
    async (request, reply) => {
      const { owner, name } = request.params;
      const query = ListRunsQuerySchema.parse(request.query);

      const repo = await loadReadableRepository(prisma, request, owner, name);

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

  // POST /runs - trigger a new pipeline run against ci-runner
  fastify.post<{ Params: { owner: string; name: string } }>(
    '/:owner/:name/ci/runs',
    async (request, reply) => {
      const userId = getUserId(request);
      const { owner, name } = request.params;
      const body = TriggerPipelineSchema.parse(request.body);

      const repo = await loadReadableRepository(prisma, request, owner, name);

      const run = await pipelineService.triggerPipeline(repo.id, body.ref, {
        type: body.type,
        commitSha: body.commitSha,
        prId: body.prId,
        triggeredBy: userId,
        configYaml: body.configYaml,
        variables: body.variables,
      });

      return reply.send({ success: true, data: run });
    },
  );

  // GET /runs/:runId/status - report run status + per-job breakdown
  fastify.get<{ Params: { owner: string; name: string; runId: string } }>(
    '/:owner/:name/ci/runs/:runId/status',
    async (request, reply) => {
      const { owner, name, runId } = request.params;

      // Scope the run to the path's repository (visibility-checked above) so a
      // run id from any other repository can never be enumerated through here.
      await loadRepoRun(prisma, request, owner, name, runId);

      const status = await pipelineService.getRunStatus(runId);

      return reply.send({ success: true, data: status });
    },
  );

  // GET /runs/:runId - get specific run
  fastify.get<{ Params: { owner: string; name: string; runId: string } }>(
    '/:owner/:name/ci/runs/:runId',
    async (request, reply) => {
      const { owner, name, runId } = request.params;

      const { run } = await loadRepoRun(prisma, request, owner, name, runId);

      return reply.send({ success: true, data: run });
    },
  );

  // GET /runs/:runId/jobs - list jobs for run
  fastify.get<{ Params: { owner: string; name: string; runId: string } }>(
    '/:owner/:name/ci/runs/:runId/jobs',
    async (request, reply) => {
      const { owner, name, runId } = request.params;

      const { run } = await loadRepoRun(prisma, request, owner, name, runId);

      const jobs = await prisma.ciJob.findMany({
        where: { runId: run.id },
        orderBy: { createdAt: 'asc' },
      });

      return reply.send({ success: true, data: jobs });
    },
  );

  // GET /runs/:runId/jobs/:jobId/logs - get job logs
  fastify.get<{
    Params: { owner: string; name: string; runId: string; jobId: string };
  }>('/:owner/:name/ci/runs/:runId/jobs/:jobId/logs', async (request, reply) => {
    const { owner, name, runId, jobId } = request.params;

    const { run } = await loadRepoRun(prisma, request, owner, name, runId);

    const job = await prisma.ciJob.findFirst({
      where: { id: jobId, runId: run.id },
    });

    if (!job) {
      throw createAppError('CI job not found', 404, 'CI_JOB_NOT_FOUND');
    }

    const logs = job.logs
      ? job.logs.split('\n').map((line: string, index: number) => ({
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
      const { owner, name, runId } = request.params;

      const { run } = await loadRepoRun(prisma, request, owner, name, runId);

      // Scoping + FAILED-gate live in retryRun; it re-dispatches the stored
      // pipeline inputs so the retried run actually executes.
      const retried = await pipelineService.retryRun(run.id);

      return reply.send({ success: true, data: retried });
    },
  );
}
