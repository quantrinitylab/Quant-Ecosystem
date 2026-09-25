// ============================================================================
// QuantAI — Fastify Routes: Projects Workspace Context & Memory Isolation
// ============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  projectService as defaultService,
  type ProjectService,
  type MemoryIsolationMode,
} from '../services/project.service';

const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(200),
  description: z.string().max(2000).optional(),
  customInstructions: z.string().max(20000).optional(),
  memoryIsolationMode: z.enum(['PROJECT_ONLY', 'UNIFIED']).optional(),
  pinnedFiles: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        size: z.number().nonnegative().optional(),
        mimeType: z.string().optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  customInstructions: z.string().max(20000).optional(),
  memoryIsolationMode: z.enum(['PROJECT_ONLY', 'UNIFIED']).optional(),
});

const addPinnedFileSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  size: z.number().nonnegative().optional(),
  mimeType: z.string().optional(),
  content: z.string().optional(),
});

function getAuthenticatedUserId(request: FastifyRequest): string {
  const auth = (request as unknown as { auth?: { userId?: string } }).auth;
  if (auth?.userId) {
    return auth.userId;
  }
  const user = (request as unknown as { user?: { id?: string } }).user;
  if (user?.id) {
    return user.id;
  }
  const headerUser = request.headers['x-user-id'];
  if (typeof headerUser === 'string' && headerUser.trim()) {
    return headerUser.trim();
  }
  throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
}

function getService(fastify: FastifyInstance): ProjectService {
  return (
    (fastify as unknown as { projectService?: ProjectService }).projectService ?? defaultService
  );
}

export default async function projectsRoutes(fastify: FastifyInstance) {
  // GET /projects - List user projects
  fastify.get('/', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const service = getService(fastify);
    const projects = await service.listProjects(userId);
    return reply.send({ success: true, data: projects });
  });

  // POST /projects - Create a new project workspace
  fastify.post('/', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid project data',
        400,
        'VALIDATION_ERROR',
      );
    }

    const service = getService(fastify);
    try {
      const project = await service.createProject(userId, parsed.data);
      return reply.status(201).send({ success: true, data: project });
    } catch (err) {
      throw createAppError((err as Error).message, 400, 'PROJECT_CREATION_FAILED');
    }
  });

  // GET /projects/:id - Get project details
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const service = getService(fastify);
    const project = await service.getProject(userId, request.params.id);
    if (!project) {
      throw createAppError(`Project ${request.params.id} not found`, 404, 'NOT_FOUND');
    }
    return reply.send({ success: true, data: project });
  });

  // PATCH /projects/:id - Update project metadata or memory settings
  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const parsed = updateProjectSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid update data',
        400,
        'VALIDATION_ERROR',
      );
    }

    const service = getService(fastify);
    try {
      const updated = await service.updateProject(userId, request.params.id, parsed.data);
      return reply.send({ success: true, data: updated });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw createAppError(msg, 404, 'NOT_FOUND');
      }
      throw createAppError(msg, 400, 'UPDATE_FAILED');
    }
  });

  // DELETE /projects/:id - Delete a project workspace
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const service = getService(fastify);
    const deleted = await service.deleteProject(userId, request.params.id);
    if (!deleted) {
      throw createAppError(`Project ${request.params.id} not found`, 404, 'NOT_FOUND');
    }
    return reply.send({ success: true, data: { deleted: true } });
  });

  // POST /projects/:id/files - Attach a pinned context file
  fastify.post<{ Params: { id: string } }>('/:id/files', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const parsed = addPinnedFileSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError(
        parsed.error.errors[0]?.message || 'Invalid file data',
        400,
        'VALIDATION_ERROR',
      );
    }

    const service = getService(fastify);
    try {
      const updated = await service.addPinnedFile(userId, request.params.id, parsed.data);
      return reply.status(201).send({ success: true, data: updated });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw createAppError(msg, 404, 'NOT_FOUND');
      }
      throw createAppError(msg, 400, 'FILE_ATTACH_FAILED');
    }
  });

  // DELETE /projects/:id/files/:fileId - Remove pinned file from project
  fastify.delete<{ Params: { id: string; fileId: string } }>(
    '/:id/files/:fileId',
    async (request, reply) => {
      const userId = getAuthenticatedUserId(request);
      const service = getService(fastify);
      try {
        const updated = await service.removePinnedFile(
          userId,
          request.params.id,
          request.params.fileId,
        );
        return reply.send({ success: true, data: updated });
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('not found')) {
          throw createAppError(msg, 404, 'NOT_FOUND');
        }
        throw createAppError(msg, 400, 'FILE_REMOVE_FAILED');
      }
    },
  );

  // GET /projects/:id/context - Get context prompt for system prompt injection
  fastify.get<{ Params: { id: string } }>('/:id/context', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const service = getService(fastify);
    const promptContext = await service.getProjectContextPrompt(userId, request.params.id);
    if (!promptContext) {
      throw createAppError(`Project ${request.params.id} not found`, 404, 'NOT_FOUND');
    }
    return reply.send({ success: true, data: promptContext });
  });
}
