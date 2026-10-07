import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { cdnManager } from '@quant/cdn';

export default async function cdnRoutes(fastify: FastifyInstance) {
  fastify.post('/purge', async (request, reply) => {
    const { urls } = request.body as any;

    try {
      const result = await cdnManager.purgeCache(urls);
      return reply.send(result);
    } catch (error: any) {
      throw createAppError(error.message, 500, 'CDN_ERROR');
    }
  });

  fastify.post('/purge-all', async (request, reply) => {
    try {
      const result = await cdnManager.purgeAll();
      return reply.send(result);
    } catch (error: any) {
      throw createAppError(error.message, 500, 'CDN_ERROR');
    }
  });

  fastify.get('/url', async (request, reply) => {
    const { url } = request.query as any;
    const cdnUrl = cdnManager.getCDNUrl(url);
    return reply.send({ cdnUrl });
  });
}
