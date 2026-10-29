// ============================================================================
// QuantAI — Projects Workspace Context & Memory Isolation Fastify Routes
// Task W39-A04: Enterprise Boundaries ('Default memory' vs 'Project-only memory')
//
// Endpoints:
// - GET    /projects/:projectId/memory
// - PATCH  /projects/:projectId/memory/mode
// - PATCH  /projects/:projectId/memory/instructions
// - POST   /projects/:projectId/memory/entries
// - DELETE /projects/:projectId/memory/entries/:entryId
// - POST   /projects/:projectId/memory/entries/:entryId/pin
// - GET    /projects/:projectId/memory/query
//
// Ownership (quantai-project-memory-ownership): every endpoint requires
// request.auth.userId (401 when absent) and passes it to the service, so
// only the owner sees a row. A foreign projectId returns 404 (never a leak,
// never an existence signal beyond what the caller already knows).
// Auto-create is owner-bound only — there is no anonymous
// default-workspace creation.
// ============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ProjectMemoryService, type ProjectMemoryMode } from '../services/project-memory.service';

const defaultService = new ProjectMemoryService();

const memoryModeSchema = z
  .object({
    mode: z.enum(['DEFAULT', 'PROJECT_ISOLATED']).optional(),
    memoryMode: z.enum(['DEFAULT', 'PROJECT_ISOLATED']).optional(),
  })
  .refine((data) => data.mode !== undefined || data.memoryMode !== undefined, {
    message: "Either 'mode' or 'memoryMode' must be provided",
  });

const customInstructionsSchema = z.object({
  customInstructions: z.string().max(10000),
});

const createEntrySchema = z.object({
  content: z.string().min(1, 'Memory content cannot be empty'),
  category: z.string().optional().default('general'),
  isPinned: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const queryParamSchema = z.object({
  q: z.string().optional(),
  autoCreate: z.enum(['true', 'false']).optional(),
  workspaceId: z.string().optional(),
});

function getService(fastify: FastifyInstance): ProjectMemoryService {
  const decorated = (fastify as unknown as { projectMemoryService?: ProjectMemoryService })
    .projectMemoryService;
  return decorated ?? defaultService;
}

/**
 * Resolve the authenticated userId for the request. Same cast shape as
 * ask.ts's requireUserId: the auth plugin decorates request.auth with the
 * verified userId. Throws 401 when absent — every endpoint calls this
 * FIRST, before any body parsing or service access.
 */
function requireUserId(request: FastifyRequest): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function projectMemoryRoutes(fastify: FastifyInstance) {
  const prefix = fastify.prefix || '';
  // Support both prefix mounting (e.g. app.register(routes, { prefix: '/projects' }))
  // and root mounting (app.register(routes))
  const base = prefix.includes('projects') ? '/:projectId/memory' : '/projects/:projectId/memory';

  // GET /projects/:projectId/memory — retrieve project memory workspace context
  fastify.get<{
    Params: { projectId: string };
    Querystring: { autoCreate?: string; workspaceId?: string };
  }>(base, async (request, reply) => {
    const userId = requireUserId(request);
    const { projectId } = request.params;
    const query = request.query;
    const service = getService(fastify);

    let memory = service.getProjectMemory(projectId, userId);
    if (!memory) {
      if (query.autoCreate === 'false') {
        throw createAppError(
          `Project memory for project '${projectId}' not found`,
          404,
          'NOT_FOUND',
        );
      }
      // Distinguish "foreign row" from "new row": auto-create only when the
      // project does not exist at all. A foreign row must 404, never 500
      // on the duplicate-create path.
      if (service.exists(projectId)) {
        throw createAppError(
          `Project memory for project '${projectId}' not found`,
          404,
          'NOT_FOUND',
        );
      }
      // Default to auto-creating workspace memory context for seamless DX
      const workspaceId = query.workspaceId || 'default-workspace';
      memory = service.createProjectMemory({
        projectId,
        workspaceId,
        memoryMode: 'DEFAULT',
        customInstructions: '',
        ownerId: userId,
      });
    }

    return reply.send({
      success: true,
      data: memory,
    });
  });

  // PATCH /projects/:projectId/memory/mode — switch memory mode ('DEFAULT' vs 'PROJECT_ISOLATED')
  fastify.patch<{
    Params: { projectId: string };
    Body: unknown;
  }>(`${base}/mode`, async (request, reply) => {
    const userId = requireUserId(request);
    const { projectId } = request.params;
    const parsed = memoryModeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.issues[0]?.message || 'Invalid memory mode payload',
        400,
        'BAD_REQUEST',
      );
    }

    const mode = (parsed.data.mode ?? parsed.data.memoryMode) as ProjectMemoryMode;
    const service = getService(fastify);

    let memory = service.getProjectMemory(projectId, userId);
    if (!memory) {
      if (service.exists(projectId)) {
        throw createAppError(
          `Project memory for project '${projectId}' not found`,
          404,
          'NOT_FOUND',
        );
      }
      memory = service.createProjectMemory({
        projectId,
        workspaceId: 'default-workspace',
        memoryMode: mode,
        customInstructions: '',
        ownerId: userId,
      });
      return reply.send({ success: true, data: memory });
    }

    const updated = service.updateMemoryMode(projectId, mode, userId);
    return reply.send({
      success: true,
      data: updated,
    });
  });

  // PATCH /projects/:projectId/memory/instructions — update custom instructions
  fastify.patch<{
    Params: { projectId: string };
    Body: unknown;
  }>(`${base}/instructions`, async (request, reply) => {
    const userId = requireUserId(request);
    const { projectId } = request.params;
    const parsed = customInstructionsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.issues[0]?.message || 'Invalid instructions payload',
        400,
        'BAD_REQUEST',
      );
    }

    const service = getService(fastify);
    let memory = service.getProjectMemory(projectId, userId);
    if (!memory) {
      if (service.exists(projectId)) {
        throw createAppError(
          `Project memory for project '${projectId}' not found`,
          404,
          'NOT_FOUND',
        );
      }
      memory = service.createProjectMemory({
        projectId,
        workspaceId: 'default-workspace',
        memoryMode: 'DEFAULT',
        customInstructions: parsed.data.customInstructions,
        ownerId: userId,
      });
      return reply.send({ success: true, data: memory });
    }

    const updated = service.updateCustomInstructions(projectId, parsed.data.customInstructions, userId);
    return reply.send({
      success: true,
      data: updated,
    });
  });

  // POST /projects/:projectId/memory/entries — add memory entry
  fastify.post<{
    Params: { projectId: string };
    Body: unknown;
  }>(`${base}/entries`, async (request, reply) => {
    const userId = requireUserId(request);
    const { projectId } = request.params;
    const parsed = createEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.issues[0]?.message || 'Invalid memory entry payload',
        400,
        'BAD_REQUEST',
      );
    }

    const service = getService(fastify);
    let memory = service.getProjectMemory(projectId, userId);
    if (!memory) {
      if (service.exists(projectId)) {
        throw createAppError(
          `Project memory for project '${projectId}' not found`,
          404,
          'NOT_FOUND',
        );
      }
      memory = service.createProjectMemory({
        projectId,
        workspaceId: 'default-workspace',
        memoryMode: 'DEFAULT',
        ownerId: userId,
      });
    }

    const entry = service.addMemoryEntry(
      projectId,
      {
        content: parsed.data.content,
        category: parsed.data.category,
        isPinned: parsed.data.isPinned,
        metadata: parsed.data.metadata,
      },
      userId,
    );

    return reply.status(201).send({
      success: true,
      data: entry,
    });
  });

  // DELETE /projects/:projectId/memory/entries/:entryId — remove memory entry
  fastify.delete<{
    Params: { projectId: string; entryId: string };
  }>(`${base}/entries/:entryId`, async (request, reply) => {
    const userId = requireUserId(request);
    const { projectId, entryId } = request.params;
    const service = getService(fastify);

    const memory = service.getProjectMemory(projectId, userId);
    if (!memory) {
      throw createAppError(`Project memory for project '${projectId}' not found`, 404, 'NOT_FOUND');
    }

    const removed = service.removeMemoryEntry(projectId, entryId, userId);
    if (!removed) {
      throw createAppError(
        `Memory entry '${entryId}' not found in project '${projectId}'`,
        404,
        'NOT_FOUND',
      );
    }

    return reply.send({
      success: true,
      data: { removed: true, entryId },
    });
  });

  // POST /projects/:projectId/memory/entries/:entryId/pin — toggle pin on entry
  fastify.post<{
    Params: { projectId: string; entryId: string };
  }>(`${base}/entries/:entryId/pin`, async (request, reply) => {
    const userId = requireUserId(request);
    const { projectId, entryId } = request.params;
    const service = getService(fastify);

    const memory = service.getProjectMemory(projectId, userId);
    if (!memory) {
      throw createAppError(`Project memory for project '${projectId}' not found`, 404, 'NOT_FOUND');
    }

    try {
      const updated = service.togglePin(projectId, entryId, userId);
      return reply.send({
        success: true,
        data: updated,
      });
    } catch {
      throw createAppError(
        `Memory entry '${entryId}' not found in project '${projectId}'`,
        404,
        'NOT_FOUND',
      );
    }
  });

  // GET /projects/:projectId/memory/query — query memories with isolation boundaries
  fastify.get<{
    Params: { projectId: string };
    Querystring: { q?: string };
  }>(`${base}/query`, async (request, reply) => {
    const userId = requireUserId(request);
    const { projectId } = request.params;
    const { q = '' } = request.query;
    const service = getService(fastify);

    // A foreign (existing but not owned) project 404s instead of leaking
    // other DEFAULT projects' entries via the cross-project fallback. A
    // missing project keeps HEAD behavior: the service's fallback result
    // (the caller's own visible DEFAULT entries) with 200.
    if (service.exists(projectId) && !service.getProjectMemory(projectId, userId)) {
      throw createAppError(`Project memory for project '${projectId}' not found`, 404, 'NOT_FOUND');
    }

    const entries = service.queryMemories(q, projectId, userId);
    return reply.send({
      success: true,
      data: entries,
    });
  });
}
