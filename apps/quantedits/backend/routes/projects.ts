import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ProjectService } from '../services/project.service';

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['video', 'image', 'audio']),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(['video', 'image', 'audio']).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

// Singleton project service (in-memory)
const projectService = new ProjectService();

export default async function projectsRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = createProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const project = await projectService.createProject({ ...parseResult.data, userId });

    return reply.status(201).send({ success: true, data: project });
  });

  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const result = await projectService.listProjects(userId, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const project = await projectService.getProject(request.params.id);

    return reply.send({ success: true, data: project });
  });

  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const project = await projectService.updateProject(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: project });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const project = await projectService.deleteProject(request.params.id, userId);

    return reply.send({ success: true, data: project });
  });

  fastify.post<{ Params: { id: string } }>('/:id/duplicate', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const project = await projectService.duplicateProject(request.params.id, userId);

    return reply.status(201).send({ success: true, data: project });
  });
}
