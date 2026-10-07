import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { autoScaler } from '@quant/scaling';

export default async function scalingRoutes(fastify: FastifyInstance) {
  fastify.get('/policies', async (request, reply) => {
    // Return all scaling policies
    return reply.send({
      policies: ['quantai', 'quantchat', 'quantmail'],
      message: 'Scaling policies endpoint ready',
    });
  });

  fastify.post('/evaluate', async (request, reply) => {
    const { service, metrics } = request.body as any;

    try {
      const target = await autoScaler.evaluateScaling(service, metrics);
      return reply.send({ service, targetReplicas: target });
    } catch (error: any) {
      throw createAppError(error.message, 500, 'SCALING_ERROR');
    }
  });

  fastify.get('/status/:service', async (request, reply) => {
    const { service } = request.params as { service: string };
    const replicas = autoScaler.getCurrentReplicas(service);
    const policy = autoScaler.getPolicy(service);

    return reply.send({ service, currentReplicas: replicas, policy });
  });
}
