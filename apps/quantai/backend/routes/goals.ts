import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { QuantyGoalsService, GOAL_CATEGORIES, GOAL_STATUSES } from '../services/goals.service';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(GOAL_CATEGORIES).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.enum(GOAL_CATEGORIES).optional(),
});

const proposeSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(GOAL_CATEGORIES).optional(),
  source: z.string().max(500).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(GOAL_STATUSES).optional(),
});

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

/**
 * Quanty goals routes (mounted under /goals). User-facing goals:
 * Tracking section (status=tracking) + Goals section (status=done).
 * Agent proposals are recorded as pending and NEVER auto-applied.
 */
export default async function goalRoutes(fastify: FastifyInstance) {
  function getService(): QuantyGoalsService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    return new QuantyGoalsService(prisma as never);
  }

  // GET /goals?status=tracking|done — list the current user's goals
  fastify.get('/', async (request, reply) => {
    const userId = getUserId(request);
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;
    const data = await getService().listGoals(userId, parsed.data.status);
    return reply.send({ success: true, data });
  });

  // GET /goals/proposals — pending agent-proposed goals (must be defined
  // before /:id so "proposals" isn't captured as an id)
  fastify.get('/proposals', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().listProposals(userId, 'pending');
    return reply.send({ success: true, data });
  });

  // POST /goals/proposals — agent proposes a goal (stays pending)
  fastify.post('/proposals', async (request, reply) => {
    const parsed = proposeSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = getUserId(request);
    const data = await getService().proposeGoal(userId, parsed.data);
    return reply.status(201).send({ success: true, data });
  });

  // POST /goals/proposals/:id/accept — user accepts → real goal created
  fastify.post<{ Params: { id: string } }>('/proposals/:id/accept', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().acceptProposal(userId, request.params.id);
    return reply.send({ success: true, data });
  });

  // POST /goals/proposals/:id/dismiss — user dismisses, no goal created
  fastify.post<{ Params: { id: string } }>('/proposals/:id/dismiss', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().dismissProposal(userId, request.params.id);
    return reply.send({ success: true, data });
  });

  // POST /goals — create a new goal
  fastify.post('/', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = getUserId(request);
    const data = await getService().createGoal(userId, parsed.data);
    return reply.status(201).send({ success: true, data });
  });

  // PATCH /goals/:id — update title/description/category
  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = getUserId(request);
    const data = await getService().updateGoal(userId, request.params.id, parsed.data);
    return reply.send({ success: true, data });
  });

  // POST /goals/:id/complete — mark done (sets completedAt)
  fastify.post<{ Params: { id: string } }>('/:id/complete', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().completeGoal(userId, request.params.id);
    return reply.send({ success: true, data });
  });

  // POST /goals/:id/reopen — back to tracking
  fastify.post<{ Params: { id: string } }>('/:id/reopen', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().reopenGoal(userId, request.params.id);
    return reply.send({ success: true, data });
  });

  // DELETE /goals/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getUserId(request);
    await getService().deleteGoal(userId, request.params.id);
    return reply.send({ success: true });
  });
}
