import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { IdeasService, IDEA_STATUSES, type IdeaStatus } from '../services/quanty-ideas.service';

const emojiSchema = z.string().min(1).max(32);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  emoji: emojiSchema.optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  emoji: emojiSchema.optional(),
});

const statusParamSchema = z.object({
  status: z.enum(['new', 'saved', 'dismissed']),
});

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

/**
 * Quanty Ideas routes (mounted under /quanty/ideas).
 * Proactive idea cards: the agent proposes, the user saves or dismisses.
 * All responses are real persisted rows — never fabricated.
 */
export default async function quantyIdeasRoutes(fastify: FastifyInstance) {
  function getService(): IdeasService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    return new IdeasService(prisma as never);
  }

  // GET /quanty/ideas?status=new — list the current user's ideas (newest first)
  fastify.get('/', async (request, reply) => {
    const userId = getUserId(request);
    const query = request.query as { status?: string };
    let status: IdeaStatus | undefined;
    if (query.status !== undefined) {
      const parsed = statusParamSchema.safeParse({ status: query.status });
      if (!parsed.success) {
        throw createAppError('Invalid status filter. Use new, saved, or dismissed.', 400, 'INVALID_STATUS');
      }
      status = parsed.data.status;
    }
    const data = await getService().list(userId, status);
    return reply.send({ success: true, data });
  });

  // GET /quanty/ideas/:id — fetch a single idea
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().get(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  // POST /quanty/ideas — propose/create an idea (status starts as "new")
  fastify.post('/', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = getUserId(request);
    const data = await getService().create(userId, parsed.data);
    return reply.status(201).send({ success: true, data });
  });

  // PUT /quanty/ideas/:id — edit title/description/emoji
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = getUserId(request);
    const data = await getService().update(request.params.id, userId, parsed.data);
    return reply.send({ success: true, data });
  });

  // POST /quanty/ideas/:id/save — move to saved
  fastify.post<{ Params: { id: string } }>('/:id/save', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().setStatus(request.params.id, userId, 'saved');
    return reply.send({ success: true, data });
  });

  // POST /quanty/ideas/:id/dismiss — move to dismissed
  fastify.post<{ Params: { id: string } }>('/:id/dismiss', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().setStatus(request.params.id, userId, 'dismissed');
    return reply.send({ success: true, data });
  });

  // POST /quanty/ideas/:id/restore — move back to new
  fastify.post<{ Params: { id: string } }>('/:id/restore', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().setStatus(request.params.id, userId, 'new');
    return reply.send({ success: true, data });
  });

  // DELETE /quanty/ideas/:id — permanently delete
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getUserId(request);
    await getService().remove(request.params.id, userId);
    return reply.send({ success: true });
  });
}

export { IDEA_STATUSES };
