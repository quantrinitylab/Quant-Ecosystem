import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SwarmOrchestrator } from '@quant/agent-swarm';
import { createAppError } from '@quant/server-core';

// Layer 2 type augmentation (mirrors prisma.ts / auth.ts): expose the decorated
// agent-swarm engine on the Fastify instance so routes are typed everywhere.
// The decoration itself is performed in buildApp() (per-app lane). The swarm
// orchestrator coordinates the multi-agent breakdown of a goal that the
// agent-runtime Orchestrator (dependsOn) executes, so it is constructed after
// agentRuntime in buildApp().
declare module 'fastify' {
  interface FastifyInstance {
    agentSwarm: SwarmOrchestrator;
  }
}

const budgetSchema = z.object({
  maxTimeMs: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
  maxCostCents: z.number().int().nonnegative(),
});

const createGoalSchema = z.object({
  description: z.string().min(1).max(10000),
  budget: budgetSchema,
  subGoals: z.array(z.string().min(1)).optional(),
});

const goalParamsSchema = z.object({
  id: z.string().min(1),
});

/**
 * agent-swarm seam routes (per-app lane), registered under the `/agents/swarm`
 * prefix in quantai's buildApp(). The global auth hook installed by createApp()
 * protects every path here; the goal-creating mutation additionally declares the
 * `agents:execute` scope (consistent with the agent-runtime seam).
 */
export default async function agentSwarmRoutes(fastify: FastifyInstance) {
  // POST /agents/swarm/goals — create a swarm goal and (optionally) decompose it
  fastify.post(
    '/goals',
    {
      preHandler: fastify.requireAuth({ scopes: ['agents:execute'] }),
    },
    async (request: any, reply) => {
      const parsed = createGoalSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const userId = request.auth?.userId || request.user?.id || request.user?.sub;
      const tenantId = request.auth?.tenantId || request.user?.tenantId;

      const goal = fastify.agentSwarm.createGoal(parsed.data.description, parsed.data.budget, {
        userId,
        tenantId,
      });
      if (parsed.data.subGoals && parsed.data.subGoals.length > 0) {
        fastify.agentSwarm.decompose(goal.id, parsed.data.subGoals);
      }

      const created = fastify.agentSwarm.getGoal(goal.id) ?? goal;
      return reply.status(201).send({ success: true, data: created });
    },
  );

  // GET /agents/swarm/goals/:id — fetch a goal and its sub-goal tree
  fastify.get(
    '/goals/:id',
    {
      preHandler: fastify.requireAuth(),
    },
    async (request: any, reply) => {
      const parsed = goalParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }

      const userId = request.auth?.userId || request.user?.id || request.user?.sub;
      const goal = fastify.agentSwarm.getGoal(parsed.data.id);
      if (!goal) {
        throw createAppError('Goal not found', 404, 'NOT_FOUND');
      }

      if (!goal.userId || goal.userId !== userId) {
        throw createAppError('Forbidden', 403, 'FORBIDDEN');
      }

      return reply.send({ success: true, data: goal });
    },
  );

  // GET /agents/swarm/goals/:id/progress — completion/failure roll-up for a goal
  fastify.get(
    '/goals/:id/progress',
    {
      preHandler: fastify.requireAuth(),
    },
    async (request: any, reply) => {
      const parsed = goalParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }

      const userId = request.auth?.userId || request.user?.id || request.user?.sub;
      const goal = fastify.agentSwarm.getGoal(parsed.data.id);
      if (!goal) {
        throw createAppError('Goal not found', 404, 'NOT_FOUND');
      }

      if (!goal.userId || goal.userId !== userId) {
        throw createAppError('Forbidden', 403, 'FORBIDDEN');
      }

      const progress = fastify.agentSwarm.getProgress(parsed.data.id);
      return reply.send({ success: true, data: progress });
    },
  );
}
