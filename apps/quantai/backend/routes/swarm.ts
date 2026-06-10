import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AgentSwarm } from '@quant/agentic';

const formSwarmSchema = z.object({
  name: z.string(),
  agents: z.array(z.string()).min(2),
  goal: z.string().min(1),
});

export default async function swarmRoutes(fastify: FastifyInstance) {
  const swarmEngine = new AgentSwarm(null as any); // In production, inject orchestrator

  fastify.post('/', async (request, reply) => {
    const parseResult = formSwarmSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    try {
      const swarm = await swarmEngine.formSwarm(
        parseResult.data.name,
        parseResult.data.agents,
        parseResult.data.goal,
      );
      return reply.send(swarm);
    } catch (error: any) {
      throw createAppError(error.message, 500, 'SWARM_ERROR');
    }
  });

  fastify.post('/:id/activate', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await swarmEngine.activateSwarm(id);
      return reply.send(result);
    } catch (error: any) {
      throw createAppError(error.message, 500, 'SWARM_ERROR');
    }
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const swarm = swarmEngine.getSwarm(id);

    if (!swarm) {
      return reply.code(404).send({ error: 'Swarm not found' });
    }

    return reply.send(swarm);
  });
}
