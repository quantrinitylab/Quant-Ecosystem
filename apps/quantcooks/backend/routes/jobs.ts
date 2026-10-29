// ============================================================================
// QuantCooks CP-1 — the /jobs REST surface (§2.4): unified job reads over
// EditJob for every surface (poll/list/cancel). Thin over JobService;
// owner scoping lives in the service (404, never 403 — §5.5). The
// legacy per-kind endpoints (/export/:id etc.) remain the compatibility
// surface for their existing UIs.
// ============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createAppError } from '@quant/server-core';
import { JobService } from '../tools/jobs';
import { resolveStoragePort } from './storage-port';

// Same local helper every route module carries (request.auth is populated
// by server-core's auth plugin): the caller's user id or a 401.
function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function jobsRoutes(fastify: FastifyInstance) {
  async function getJobs(): Promise<JobService> {
    const decorated = (fastify as unknown as { jobService?: JobService }).jobService;
    if (decorated) return decorated;
    const storage = await resolveStoragePort(fastify);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new JobService((fastify as any).prisma, storage);
  }

  fastify.get('/', async (request: FastifyRequest) => {
    const userId = requireUserId(request);
    const jobs = await getJobs();
    const query = request.query as {
      projectId?: string;
      kind?: string;
      status?: string;
    };
    const filters: { projectId?: string; kind?: string; status?: string } = {};
    if (query.projectId) filters.projectId = query.projectId;
    if (query.kind) filters.kind = query.kind;
    if (query.status) filters.status = query.status;
    return { jobs: await jobs.listJobs(userId, filters) };
  });

  fastify.get('/:id', async (request: FastifyRequest) => {
    const userId = requireUserId(request);
    const jobs = await getJobs();
    const { id } = request.params as { id: string };
    return { job: await jobs.getJob(id, userId) };
  });

  fastify.post('/:id/cancel', async (request: FastifyRequest) => {
    const userId = requireUserId(request);
    const jobs = await getJobs();
    const { id } = request.params as { id: string };
    return { job: await jobs.cancelJob(id, userId) };
  });
}
