// ============================================================================
// QuantAI — Fastify Routes: Projects Workspace Context & Memory Isolation
// Task W39-A04: Enterprise Boundaries ('Default memory' vs 'Project-only memory')
// ============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  ProjectContextService,
  ProjectBoundaryViolationError,
  type RetentionPolicy,
  type SensitivityLevel,
  type ComplianceStandard,
  type MemoryCategory,
} from '../services/project-context.service';

const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  customInstructions: z.string().max(10000).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  inheritDefaultMemory: z.boolean().optional(),
  retentionPolicy: z
    .enum(['indefinite', '30_days', '90_days', '1_year', 'purge_on_close'])
    .optional(),
  sensitivityLevel: z
    .enum(['public', 'internal', 'confidential', 'restricted', 'secret'])
    .optional(),
  complianceTags: z
    .array(z.enum(['SOC2', 'HIPAA', 'GDPR', 'FINRA', 'ISO27001', 'PROPRIETARY']))
    .optional(),
  dataResidency: z.enum(['in-region-only', 'global']).optional(),
  exportRestrictions: z.enum(['allowed', 'restricted', 'blocked']).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  customInstructions: z.string().max(10000).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  inheritDefaultMemory: z.boolean().optional(),
  retentionPolicy: z
    .enum(['indefinite', '30_days', '90_days', '1_year', 'purge_on_close'])
    .optional(),
  sensitivityLevel: z
    .enum(['public', 'internal', 'confidential', 'restricted', 'secret'])
    .optional(),
  complianceTags: z
    .array(z.enum(['SOC2', 'HIPAA', 'GDPR', 'FINRA', 'ISO27001', 'PROPRIETARY']))
    .optional(),
  exportRestrictions: z.enum(['allowed', 'restricted', 'blocked']).optional(),
});

const recordMemorySchema = z.object({
  content: z.string().min(1).max(20000),
  category: z
    .enum(['preference', 'instruction', 'fact', 'code_snippet', 'architecture', 'decision'])
    .optional(),
  source: z.string().optional(),
  sourceApp: z.string().optional(),
  sensitivity: z.enum(['public', 'internal', 'confidential', 'restricted', 'secret']).optional(),
  tags: z.array(z.string()).optional(),
  retentionDays: z.number().int().positive().optional(),
});

const addFileSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
  mimeType: z.string(),
  contentSnippet: z.string().max(50000).optional(),
});

const listProjectsQuerySchema = z.object({
  sensitivity: z.enum(['public', 'internal', 'confidential', 'restricted', 'secret']).optional(),
  retention: z.enum(['indefinite', '30_days', '90_days', '1_year', 'purge_on_close']).optional(),
  search: z.string().optional(),
});

const getContextQuerySchema = z.object({
  category: z
    .enum(['preference', 'instruction', 'fact', 'code_snippet', 'architecture', 'decision'])
    .optional(),
  search: z.string().optional(),
});

export default async function projectContextRoutes(fastify: FastifyInstance) {
  function getService(): ProjectContextService {
    let service = (fastify as unknown as { projectContextService?: ProjectContextService })
      .projectContextService;
    if (!service) {
      service = new ProjectContextService();
      (
        fastify as unknown as { projectContextService: ProjectContextService }
      ).projectContextService = service;
    }
    return service;
  }

  function getAuthenticatedUserId(request: FastifyRequest): string {
    const auth = (request as unknown as { auth?: { userId?: string } }).auth;
    if (!auth?.userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    return auth.userId;
  }

  // --------------------------------------------------------------------------
  // POST /projects - Create a new project workspace
  // --------------------------------------------------------------------------
  fastify.post('/', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const parseResult = createProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors[0]?.message || 'Invalid project data',
        400,
        'VALIDATION_ERROR',
      );
    }

    try {
      const project = getService().createProject(userId, parseResult.data as any);
      return reply.status(201).send({ success: true, data: project });
    } catch (err) {
      const msg = (err as Error).message;
      throw createAppError(msg, 400, 'PROJECT_CREATION_FAILED');
    }
  });

  // --------------------------------------------------------------------------
  // GET /projects - List user's project workspaces
  // --------------------------------------------------------------------------
  fastify.get('/', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const queryResult = listProjectsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const projects = getService().listProjects(
      userId,
      queryResult.data as {
        sensitivity?: SensitivityLevel;
        retention?: RetentionPolicy;
        search?: string;
      },
    );

    return reply.send({ success: true, data: projects });
  });

  // --------------------------------------------------------------------------
  // GET /projects/:projectId - Get details of a project workspace
  // --------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string } }>('/:projectId', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const project = getService().getProject(request.params.projectId, userId);
    if (!project) {
      throw createAppError(`Project ${request.params.projectId} not found`, 404, 'NOT_FOUND');
    }

    return reply.send({ success: true, data: project });
  });

  // --------------------------------------------------------------------------
  // PATCH /projects/:projectId - Update project workspace settings
  // --------------------------------------------------------------------------
  fastify.patch<{ Params: { projectId: string } }>('/:projectId', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const parseResult = updateProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    try {
      const updated = getService().updateProject(
        request.params.projectId,
        userId,
        parseResult.data as any,
      );
      return reply.send({ success: true, data: updated });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw createAppError(msg, 404, 'NOT_FOUND');
      }
      throw createAppError(msg, 400, 'PROJECT_UPDATE_FAILED');
    }
  });

  // --------------------------------------------------------------------------
  // DELETE /projects/:projectId - Delete project workspace and its context
  // --------------------------------------------------------------------------
  fastify.delete<{ Params: { projectId: string } }>('/:projectId', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const deleted = getService().deleteProject(request.params.projectId, userId);
    if (!deleted) {
      throw createAppError(`Project ${request.params.projectId} not found`, 404, 'NOT_FOUND');
    }

    return reply.send({ success: true, data: { message: 'Project deleted' } });
  });

  // --------------------------------------------------------------------------
  // POST /projects/:projectId/memories - Record memory isolated to this project
  // --------------------------------------------------------------------------
  fastify.post<{ Params: { projectId: string } }>(
    '/:projectId/memories',
    async (request, reply) => {
      const userId = getAuthenticatedUserId(request);
      const parseResult = recordMemorySchema.safeParse(request.body);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      try {
        const memory = getService().recordProjectMemory(
          request.params.projectId,
          userId,
          parseResult.data as any,
        );
        return reply.status(201).send({ success: true, data: memory });
      } catch (err) {
        if (err instanceof ProjectBoundaryViolationError) {
          throw createAppError(err.message, 403, 'PROJECT_BOUNDARY_VIOLATION');
        }
        const msg = (err as Error).message;
        if (msg.includes('not found')) {
          throw createAppError(msg, 404, 'NOT_FOUND');
        }
        throw createAppError(msg, 400, 'MEMORY_RECORDING_FAILED');
      }
    },
  );

  // --------------------------------------------------------------------------
  // GET /projects/:projectId/context - Retrieve isolated project context
  // --------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string } }>('/:projectId/context', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const queryResult = getContextQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    try {
      const context = getService().retrieveProjectContext(
        request.params.projectId,
        userId,
        queryResult.data as { category?: MemoryCategory; search?: string },
      );
      return reply.send({ success: true, data: context });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw createAppError(msg, 404, 'NOT_FOUND');
      }
      throw createAppError(msg, 400, 'CONTEXT_RETRIEVAL_FAILED');
    }
  });

  // --------------------------------------------------------------------------
  // DELETE /projects/:projectId/memories - Purge all memories in this project
  // --------------------------------------------------------------------------
  fastify.delete<{ Params: { projectId: string } }>(
    '/:projectId/memories',
    async (request, reply) => {
      const userId = getAuthenticatedUserId(request);
      try {
        const result = getService().purgeProjectMemory(request.params.projectId, userId);
        return reply.send({ success: true, data: result });
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('not found')) {
          throw createAppError(msg, 404, 'NOT_FOUND');
        }
        throw createAppError(msg, 400, 'PURGE_FAILED');
      }
    },
  );

  // --------------------------------------------------------------------------
  // POST /projects/:projectId/files - Attach file to project workspace
  // --------------------------------------------------------------------------
  fastify.post<{ Params: { projectId: string } }>('/:projectId/files', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const parseResult = addFileSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    try {
      const file = getService().addProjectFile(request.params.projectId, userId, parseResult.data);
      return reply.status(201).send({ success: true, data: file });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw createAppError(msg, 404, 'NOT_FOUND');
      }
      throw createAppError(msg, 400, 'FILE_ATTACHMENT_FAILED');
    }
  });

  // --------------------------------------------------------------------------
  // GET /projects/:projectId/files - List files attached to project workspace
  // --------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string } }>('/:projectId/files', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    try {
      const files = getService().listProjectFiles(request.params.projectId, userId);
      return reply.send({ success: true, data: files });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw createAppError(msg, 404, 'NOT_FOUND');
      }
      throw createAppError(msg, 400, 'FILE_LIST_FAILED');
    }
  });

  // --------------------------------------------------------------------------
  // DELETE /projects/:projectId/files/:fileId - Remove file from project
  // --------------------------------------------------------------------------
  fastify.delete<{ Params: { projectId: string; fileId: string } }>(
    '/:projectId/files/:fileId',
    async (request, reply) => {
      const userId = getAuthenticatedUserId(request);
      const deleted = getService().deleteProjectFile(
        request.params.projectId,
        request.params.fileId,
        userId,
      );
      if (!deleted) {
        throw createAppError(`File ${request.params.fileId} not found`, 404, 'NOT_FOUND');
      }
      return reply.send({ success: true, data: { message: 'File deleted' } });
    },
  );

  // --------------------------------------------------------------------------
  // GET /projects/:projectId/export - Export project context & memories
  // --------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string } }>('/:projectId/export', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    try {
      const exported = getService().exportProjectContext(request.params.projectId, userId);
      return reply.send({ success: true, data: exported });
    } catch (err) {
      const e = err as unknown as { statusCode?: number; code?: string; message: string };
      if (e.statusCode === 403 || e.code === 'EXPORT_RESTRICTED') {
        throw createAppError(e.message, 403, 'EXPORT_RESTRICTED');
      }
      if (e.message.includes('not found')) {
        throw createAppError(e.message, 404, 'NOT_FOUND');
      }
      throw createAppError(e.message, 400, 'EXPORT_FAILED');
    }
  });

  // --------------------------------------------------------------------------
  // GET /projects/:projectId/audit - Audit memory isolation and leak detection
  // --------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string } }>('/:projectId/audit', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    try {
      const audit = getService().verifyMemoryIsolation(userId, request.params.projectId);
      return reply.send({ success: true, data: audit });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw createAppError(msg, 404, 'NOT_FOUND');
      }
      throw createAppError(msg, 400, 'AUDIT_FAILED');
    }
  });
}
