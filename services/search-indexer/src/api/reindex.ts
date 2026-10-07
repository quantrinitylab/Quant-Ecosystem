// ============================================================================
// Reindex API - Fastify routes for managing reindex jobs
// ============================================================================

import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ReindexJobManager } from '@quant/search';

const StartReindexParamsSchema = z.object({
  indexName: z.string().min(1),
});

const JobIdParamsSchema = z.object({
  jobId: z.string().min(1),
});

/**
 * Admin API key authentication hook.
 * Checks for X-Admin-Key header matching the ADMIN_API_KEY env var.
 * In development (ADMIN_API_KEY not set), access is allowed with a warning log.
 */
async function adminAuthHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const expectedKey = process.env['ADMIN_API_KEY'];

  if (!expectedKey) {
    // Development mode: allow access but warn
    request.log.warn('ADMIN_API_KEY is not set - reindex API is unprotected (development mode)');
    return;
  }

  const providedKey = request.headers['x-admin-key'];

  if (!providedKey || providedKey !== expectedKey) {
    return reply.status(401).send({ error: 'Unauthorized: invalid or missing X-Admin-Key header' });
  }
}

/**
 * Register reindex routes on a Fastify instance.
 * Uses Fastify plugin encapsulation so the admin auth hook only applies
 * to reindex routes, not to health probes (/healthz, /readyz) on the same instance.
 */
export function registerReindexRoutes(app: FastifyInstance, jobManager: ReindexJobManager): void {
  app.register(async function reindexPlugin(scope) {
    // Apply admin auth only within this scoped plugin
    scope.addHook('onRequest', adminAuthHook);

    // POST /api/v1/reindex/:indexName - Start a new reindex job
    scope.post(
      '/api/v1/reindex/:indexName',
      async (request: FastifyRequest<{ Params: { indexName: string } }>, reply: FastifyReply) => {
        const parsed = StartReindexParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid index name' });
        }
        const job = jobManager.startReindex(parsed.data.indexName);
        return reply.status(201).send(serializeJob(job));
      },
    );

    // GET /api/v1/reindex/jobs - List all reindex jobs
    scope.get('/api/v1/reindex/jobs', async (_request: FastifyRequest, reply: FastifyReply) => {
      const jobs = jobManager.listJobs();
      return reply.status(200).send({ jobs: jobs.map(serializeJob) });
    });

    // GET /api/v1/reindex/jobs/:jobId - Get job status
    scope.get(
      '/api/v1/reindex/jobs/:jobId',
      async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
        const parsed = JobIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid job ID' });
        }
        const job = jobManager.getJobStatus(parsed.data.jobId);
        if (!job) {
          return reply.status(404).send({ error: 'Job not found' });
        }
        return reply.status(200).send(serializeJob(job));
      },
    );

    // DELETE /api/v1/reindex/jobs/:jobId - Cancel a job
    scope.delete(
      '/api/v1/reindex/jobs/:jobId',
      async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
        const parsed = JobIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid job ID' });
        }
        const job = jobManager.cancelJob(parsed.data.jobId);
        if (!job) {
          return reply.status(404).send({ error: 'Job not found' });
        }
        return reply.status(200).send(serializeJob(job));
      },
    );
  });
}

function serializeJob(job: ReturnType<ReindexJobManager['startReindex']>) {
  return {
    id: job.id,
    indexName: job.indexName,
    state: job.state,
    progress: job.progress,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    error: job.error ?? null,
  };
}
