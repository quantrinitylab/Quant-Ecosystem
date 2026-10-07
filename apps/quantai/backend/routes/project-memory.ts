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
  metadata: z.record(z.unknown()).optional(),
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
    const { projectId } = request.params;
    const query = request.query;
    const service = getService(fastify);

    let memory = service.getProjectMemory(projectId);
    if (!memory) {
      if (query.autoCreate === 'false') {
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
    const { projectId } = request.params;
    const parsed = memoryModeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid memory mode payload',
        400,
        'BAD_REQUEST',
      );
    }

    const mode = (parsed.data.mode ?? parsed.data.memoryMode) as ProjectMemoryMode;
    const service = getService(fastify);

    let memory = service.getProjectMemory(projectId);
    if (!memory) {
      memory = service.createProjectMemory({
        projectId,
        workspaceId: 'default-workspace',
        memoryMode: mode,
        customInstructions: '',
      });
      return reply.send({ success: true, data: memory });
    }

    const updated = service.updateMemoryMode(projectId, mode);
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
    const { projectId } = request.params;
    const parsed = customInstructionsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid instructions payload',
        400,
        'BAD_REQUEST',
      );
    }

    const service = getService(fastify);
    let memory = service.getProjectMemory(projectId);
    if (!memory) {
      memory = service.createProjectMemory({
        projectId,
        workspaceId: 'default-workspace',
        memoryMode: 'DEFAULT',
        customInstructions: parsed.data.customInstructions,
      });
      return reply.send({ success: true, data: memory });
    }

    const updated = service.updateCustomInstructions(projectId, parsed.data.customInstructions);
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
    const { projectId } = request.params;
    const parsed = createEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid memory entry payload',
        400,
        'BAD_REQUEST',
      );
    }

    const service = getService(fastify);
    let memory = service.getProjectMemory(projectId);
    if (!memory) {
      memory = service.createProjectMemory({
        projectId,
        workspaceId: 'default-workspace',
        memoryMode: 'DEFAULT',
      });
    }

    const entry = service.addMemoryEntry(projectId, {
      content: parsed.data.content,
      category: parsed.data.category,
      isPinned: parsed.data.isPinned,
      metadata: parsed.data.metadata,
    });

    return reply.status(201).send({
      success: true,
      data: entry,
    });
  });

  // DELETE /projects/:projectId/memory/entries/:entryId — remove memory entry
  fastify.delete<{
    Params: { projectId: string; entryId: string };
  }>(`${base}/entries/:entryId`, async (request, reply) => {
    const { projectId, entryId } = request.params;
    const service = getService(fastify);

    const memory = service.getProjectMemory(projectId);
    if (!memory) {
      throw createAppError(`Project memory for project '${projectId}' not found`, 404, 'NOT_FOUND');
    }

    const removed = service.removeMemoryEntry(projectId, entryId);
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
    const { projectId, entryId } = request.params;
    const service = getService(fastify);

    const memory = service.getProjectMemory(projectId);
    if (!memory) {
      throw createAppError(`Project memory for project '${projectId}' not found`, 404, 'NOT_FOUND');
    }

    try {
      const updated = service.togglePin(projectId, entryId);
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
    const { projectId } = request.params;
    const { q = '' } = request.query;
    const service = getService(fastify);

    const entries = service.queryMemories(q, projectId);
    return reply.send({
      success: true,
      data: entries,
    });
  });
}
