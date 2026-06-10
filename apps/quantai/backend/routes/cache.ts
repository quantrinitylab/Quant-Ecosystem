import type { FastifyInstance } from 'fastify';
import { cacheManager } from '@quant/cache';

export default async function cacheRoutes(fastify: FastifyInstance) {
  fastify.get('/stats', async (request, reply) => {
    const stats = cacheManager.getStats();
    return reply.send(stats);
  });

  fastify.post('/clear', async (request, reply) => {
    await cacheManager.clear();
    return reply.send({ success: true });
  });

  fastify.delete('/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const deleted = await cacheManager.delete(key);
    return reply.send({ success: deleted });
  });
}
