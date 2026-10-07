import type { FastifyInstance } from 'fastify';
import { analytics } from '@quant/agentic';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.get('/agents/top', async (request, reply) => {
    const top = analytics.getTopAgents(5);
    return reply.send(top);
  });

  fastify.get('/agents/:id/stats', async (request, reply) => {
    const { id } = request.params as { id: string };
    const stats = analytics.getAgentStats(id);

    if (!stats) {
      return reply.code(404).send({ error: 'No stats found' });
    }

    return reply.send({
      ...stats,
      successRate: analytics.getSuccessRate(id),
    });
  });
}
