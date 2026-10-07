import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Orchestrator } from '@quant/agent-runtime';
import { createAppError } from '@quant/server-core';

// Layer 2 type augmentation (mirrors prisma.ts / auth.ts): expose the decorated
// agent-runtime engine on the Fastify instance so routes are typed everywhere.
// The decoration itself is performed in buildApp() (per-app lane).
declare module 'fastify' {
  interface FastifyInstance {
    agentRuntime: Orchestrator;
  }
}

const executeTaskSchema = z.object({
  task: z.string().min(1).max(10000),
});

const taskParamsSchema = z.object({
  id: z.string().min(1),
});

/**
 * agent-runtime seam routes (per-app lane), registered under the `/agents`
 * prefix in quantai's buildApp(). Namespaced under `/runtime/*` so they coexist
 * with the existing agent-marketplace routes already mounted at `/agents`.
 *
 * The global auth hook installed by createApp() already protects every
 * non-public path, so these routes can read `request.auth` directly. The
 * task-executing mutation additionally declares a fine-grained scope.
 */
export default async function agentRuntimeRoutes(fastify: FastifyInstance) {
  // POST /agents/runtime/tasks — decompose + execute an agent task via the engine
  fastify.post(
    '/runtime/tasks',
    {
      preHandler: fastify.requireAuth({ scopes: ['agents:execute'] }),
    },
    async (request, reply) => {
      const parsed = executeTaskSchema.safeParse(request.body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const result = await fastify.agentRuntime.executeTask(parsed.data.task);
      return reply.status(201).send({ success: true, data: result });
    },
  );

  // GET /agents/runtime/tasks/:id — fetch the status of a previously started task
  fastify.get('/runtime/tasks/:id', async (request, reply) => {
    const parsed = taskParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw parsed.error;
    }

    const task = fastify.agentRuntime.getTaskStatus(parsed.data.id);
    if (!task) {
      throw createAppError('Task not found', 404, 'NOT_FOUND');
    }

    return reply.send({ success: true, data: task });
  });

  // GET /agents/runtime/agents — list the agent workers currently registered with the runtime
  fastify.get('/runtime/agents', async (_request, reply) => {
    const agents = fastify.agentRuntime.getRunningAgents().map((worker) => ({ id: worker.id }));
    return reply.send({ success: true, data: { agents } });
  });
}
