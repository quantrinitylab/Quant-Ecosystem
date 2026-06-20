import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { SessionService } from '../services/session.service';

const createSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  model: z.string().optional(),
  systemPrompt: z.string().max(10000).optional(),
});

const updateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  model: z.string().optional(),
  systemPrompt: z.string().max(10000).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const searchSchema = z.object({
  q: z.string().min(1).max(200),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function sessionsRoutes(fastify: FastifyInstance) {
  // GET /sessions/search - Full-text search across the user's conversations
  fastify.get('/search', async (request, reply) => {
    const queryResult = searchSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { q, page, pageSize } = queryResult.data;
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SessionService(prisma as never);
    const result = await service.searchSessions(userId, q, { page, pageSize });

    return reply.send({ success: true, data: result });
  });

  // POST /sessions - Create a session
  fastify.post('/', async (request, reply) => {
    const parseResult = createSessionSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SessionService(prisma as never);
    const session = await service.createSession(userId, parseResult.data);

    return reply.status(201).send({ success: true, data: session });
  });

  // GET /sessions - List sessions
  fastify.get('/', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SessionService(prisma as never);
    const result = await service.listSessions(userId, queryResult.data);

    return reply.send({ success: true, data: result });
  });

  // GET /sessions/:id - Get a session
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SessionService(prisma as never);
    const session = await service.getSession(request.params.id, userId);

    return reply.send({ success: true, data: session });
  });

  // PUT /sessions/:id - Update a session
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parseResult = updateSessionSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SessionService(prisma as never);
    const session = await service.updateSession(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: session });
  });

  // DELETE /sessions/:id - Delete a session
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SessionService(prisma as never);
    const session = await service.deleteSession(request.params.id, userId);

    return reply.send({ success: true, data: session });
  });

  // POST /sessions/:id/archive - Archive a session
  fastify.post<{ Params: { id: string } }>('/:id/archive', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SessionService(prisma as never);
    const session = await service.archiveSession(request.params.id, userId);

    return reply.send({ success: true, data: session });
  });

  // POST /sessions/:id/pin - Toggle pin
  fastify.post<{ Params: { id: string } }>('/:id/pin', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new SessionService(prisma as never);
    const session = await service.pinSession(request.params.id, userId);

    return reply.send({ success: true, data: session });
  });
}
