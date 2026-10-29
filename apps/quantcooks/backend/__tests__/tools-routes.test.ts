// ============================================================================
// CP-1 — the /tools + /jobs REST surface (§13.9): list/detail/quote/
// invoke/jobs over the registry seam, HTTP status discipline (201 for
// job-creating invokes, 200 for sync), the auth wall, and error-code
// passthrough. Mounted on a bare Fastify instance exactly like the other
// route suites (decorated registry/jobService seams win, as in tests for
// the production wiring's injected ports).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { isAppError } from '@quant/server-core';
import { ZodError } from 'zod';
import toolsRoutes from '../routes/tools';
import jobsRoutes from '../routes/jobs';
import { createToolsTestRig, USER, type ToolsTestRig } from './tools-test-rig';

async function buildApp(rig: ToolsTestRig, userId: string | null) {
  const app = Fastify();
  app.decorate('toolRegistry', rig.registry);
  app.decorate('jobService', rig.deps.jobs);
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', statusCode: 400 },
      });
    }
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal error',
        statusCode: 500,
      },
    });
  });
  if (userId !== null) {
    app.addHook('onRequest', async (request) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId };
    });
  }
  await app.register(toolsRoutes, { prefix: '/tools' });
  await app.register(jobsRoutes, { prefix: '/jobs' });
  await app.ready();
  return app;
}

describe('tools + jobs routes (CP-1)', () => {
  let rig: ToolsTestRig;
  let app: FastifyInstance;

  beforeEach(async () => {
    rig = createToolsTestRig();
    app = await buildApp(rig, USER);
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /tools lists all 58 with availability', async () => {
    const res = await app.inject({ method: 'GET', url: '/tools' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { tools: { name: string; availability: string }[] };
    expect(body.tools).toHaveLength(58);
    const twin = body.tools.find((t) => t.name === 'quantcooks.render_effects');
    expect(twin?.availability).toBe('not_configured');
  });

  it('GET /tools/openapi.json serves the generated document', async () => {
    const res = await app.inject({ method: 'GET', url: '/tools/openapi.json' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { openapi: string; 'x-quantcooks-tools': unknown[] };
    expect(body.openapi).toBe('3.1.0');
    expect(body['x-quantcooks-tools']).toHaveLength(58);
  });

  it('GET /tools/:name returns detail; unknown name → 404 TOOL_NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: '/tools/quantcooks.export_project' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { name: string; inputSchema: { type: string } };
    expect(body.name).toBe('quantcooks.export_project');
    expect(body.inputSchema.type).toBe('object');

    const missing = await app.inject({ method: 'GET', url: '/tools/quantcooks.nope' });
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as { error: { code: string } }).error.code).toBe('TOOL_NOT_FOUND');
  });

  it('POST /tools/:name/quote composes a quote without executing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tools/quantcooks.suggest_titles/quote',
      payload: { description: 'A biryani film' },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { credits: number }).credits).toBe(1);
  });

  it('POST invoke: sync tool → 200; job-creating tool → 201 with the job', async () => {
    const sync = await app.inject({
      method: 'POST',
      url: '/tools/quantcooks.list_projects/invoke',
      payload: { params: {} },
    });
    expect(sync.statusCode).toBe(200);

    const asyncRes = await app.inject({
      method: 'POST',
      url: '/tools/quantcooks.export_project/invoke',
      payload: { params: { projectId: 'p1' } },
    });
    expect(asyncRes.statusCode).toBe(201);
    const job = (asyncRes.json() as { job: { id: string; status: string } }).job;
    expect(job.status).toBe('QUEUED');

    const status = await app.inject({ method: 'GET', url: `/jobs/${job.id}` });
    expect(status.statusCode).toBe(200);
    expect((status.json() as { job: { id: string } }).job.id).toBe(job.id);
  });

  it('POST /jobs/:id/cancel cancels a QUEUED job; a second cancel → CANNOT_CANCEL_JOB', async () => {
    const invoked = await app.inject({
      method: 'POST',
      url: '/tools/quantcooks.export_project/invoke',
      payload: { params: { projectId: 'p1' } },
    });
    const jobId = (invoked.json() as { job: { id: string } }).job.id;

    const cancelled = await app.inject({ method: 'POST', url: `/jobs/${jobId}/cancel` });
    expect(cancelled.statusCode).toBe(200);
    expect((cancelled.json() as { job: { error: string | null } }).job.error).toBe('USER_CANCELLED');

    const again = await app.inject({ method: 'POST', url: `/jobs/${jobId}/cancel` });
    expect(again.statusCode).toBe(400);
    expect((again.json() as { error: { code: string } }).error.code).toBe('CANNOT_CANCEL_JOB');
  });

  it('GET /jobs lists the caller’s jobs with filters', async () => {
    await app.inject({
      method: 'POST',
      url: '/tools/quantcooks.export_project/invoke',
      payload: { params: { projectId: 'p1' } },
    });
    const res = await app.inject({ method: 'GET', url: '/jobs?kind=EXPORT' });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { jobs: unknown[] }).jobs).toHaveLength(1);
    const filtered = await app.inject({ method: 'GET', url: '/jobs?kind=IMAGE_GEN' });
    expect((filtered.json() as { jobs: unknown[] }).jobs).toHaveLength(0);
  });

  it('Tier B invoke through REST refuses with its named code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tools/quantcooks.generate_dish_image/invoke',
      payload: { params: { prompt: 'a thali' } },
    });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { error: { code: string } }).error.code).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('unauthenticated requests hit the auth wall (401 UNAUTHORIZED)', async () => {
    const anon = await buildApp(rig, null);
    const res = await anon.inject({ method: 'GET', url: '/jobs' });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
    const invoke = await anon.inject({
      method: 'POST',
      url: '/tools/quantcooks.list_projects/invoke',
      payload: { params: {} },
    });
    expect(invoke.statusCode).toBe(401);
    await anon.close();
  });
});
