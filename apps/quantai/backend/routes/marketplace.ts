import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { marketplace } from '@quant/agentic';

export default async function marketplaceRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const agents = await marketplace.getAllAgents();
    return reply.send(agents);
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = await marketplace.getAgent(id);

    if (!agent) {
      throw createAppError('Agent not found', 404, 'NOT_FOUND');
    }

    return reply.send(agent);
  });

  fastify.post('/:id/install', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    const { id } = request.params as { id: string };

    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const success = await marketplace.installAgent(userId, id);
    return reply.send({ success });
  });
}
