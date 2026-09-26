import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AgentCollaboration } from '@quant/agentic';

const collaborationSchema = z.object({
  agents: z.array(z.string()).min(2),
  goal: z.string().min(1),
});

export default async function collaborationRoutes(fastify: FastifyInstance) {
  // Note: In production, inject the orchestrator
  const collaboration = new AgentCollaboration(null as any);

  fastify.post('/', async (request, reply) => {
    const parseResult = collaborationSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    try {
      const session = await collaboration.startCollaboration(
        parseResult.data.agents,
        parseResult.data.goal,
      );
      return reply.send(session);
    } catch (error: any) {
      throw createAppError(error.message, 500, 'COLLABORATION_ERROR');
    }
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = collaboration.getSession(id);

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    return reply.send(session);
  });
}
