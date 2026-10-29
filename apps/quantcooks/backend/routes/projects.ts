import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ProjectService } from '../services/project.service';

// ============================================================================
// QuantEdits project routes (mounted at /projects).
//
//   POST   /projects                       { name, type } -> 201
//   GET    /projects?page=&pageSize=       caller's projects, paginated
//   GET    /projects/:id
//   PUT    /projects/:id                   { name?, type? }  (owner only)
//   DELETE /projects/:id                   soft delete       (owner only)
//   POST   /projects/:id/duplicate
//   GET    /projects/:id/state             editor state (P0-5)
//   PUT    /projects/:id/state             save editor state, version-gated
//
// All authenticated. Persistence is the Prisma-backed ProjectService over
// the EditProject model (P0-1) — before this rewire the route called
// `prisma.editProject` directly against a model that did not exist, and the
// service holding the real semantics was unwired in-memory dead code.
// ============================================================================

const projectTypeSchema = z.enum(['video', 'image', 'audio']);

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  type: projectTypeSchema,
});

const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    type: projectTypeSchema.optional(),
  })
  .strict();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  type: projectTypeSchema.optional(),
});

// Editor state (P0-5, spec §2.3). Track/clip internals are the editor's own
// schema — validated by count + total size, not field-by-field. The hard
// 2 MiB cap is enforced twice: as the route bodyLimit (Fastify rejects
// before parsing; server-core's handler names it 413 PAYLOAD_TOO_LARGE)
// and as a serialised-size check in the handler for direct service mounts.
const STATE_BODY_LIMIT_BYTES = 2 * 1024 * 1024;

const saveProjectStateSchema = z.object({
  version: z.number().int().min(1),
  timeline: z.object({
    schemaVersion: z.literal(1),
    tracks: z.array(z.unknown()).max(200),
    duration: z.number().min(0).max(86400),
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5', '4:3']),
  }),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function projectsRoutes(fastify: FastifyInstance) {
  const service = new ProjectService((fastify as unknown as { prisma: never }).prisma);

  fastify.post('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const project = await service.createProject({ userId, ...parsed.data });
    return reply.status(201).send({ success: true, data: project });
  });

  fastify.get('/', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;

    const result = await service.listProjects(userId, parsed.data);
    return reply.send({ success: true, data: result });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    requireUserId(request);
    const project = await service.getProject(request.params.id);
    return reply.send({ success: true, data: project });
  });

  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = updateProjectSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const project = await service.updateProject(request.params.id, userId, parsed.data);
    return reply.send({ success: true, data: project });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const project = await service.deleteProject(request.params.id, userId);
    return reply.send({ success: true, data: project });
  });

  fastify.post<{ Params: { id: string } }>('/:id/duplicate', async (request, reply) => {
    const userId = requireUserId(request);
    const project = await service.duplicateProject(request.params.id, userId);
    return reply.status(201).send({ success: true, data: project });
  });

  fastify.get<{ Params: { id: string } }>('/:id/state', async (request, reply) => {
    requireUserId(request);
    const state = await service.getProjectState(request.params.id);
    return reply.send({ success: true, data: state });
  });

  fastify.put<{ Params: { id: string } }>(
    '/:id/state',
    { bodyLimit: STATE_BODY_LIMIT_BYTES },
    async (request, reply) => {
      const userId = requireUserId(request);
      if (
        request.body !== undefined &&
        Buffer.byteLength(JSON.stringify(request.body), 'utf8') > STATE_BODY_LIMIT_BYTES
      ) {
        throw createAppError('Project state payload is too large', 413, 'PAYLOAD_TOO_LARGE');
      }
      const parsed = saveProjectStateSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;

      const state = await service.saveProjectState(request.params.id, userId, parsed.data);
      return reply.send({ success: true, data: state });
    },
  );
}
