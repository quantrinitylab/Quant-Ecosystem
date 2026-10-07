import type { FastifyInstance } from 'fastify';
import { healthMonitor } from '@quant/agentic';

export default async function agentHealthRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const health = healthMonitor.getAllHealth();
    return reply.send(health);
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const health = healthMonitor.getHealth(id);

    if (!health) {
      return reply.code(404).send({ error: 'No health data found' });
    }

    return reply.send(health);
  });
}
