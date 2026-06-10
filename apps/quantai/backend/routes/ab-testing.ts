import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { abTesting } from '@quant/ab-testing';

export default async function abTestingRoutes(fastify: FastifyInstance) {
  fastify.post('/experiments', async (request, reply) => {
    const experiment = abTesting.createExperiment(request.body as any);
    return reply.send(experiment);
  });

  fastify.post('/experiments/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    abTesting.startExperiment(id);
    return reply.send({ success: true });
  });

  fastify.get('/experiments/:id/variant', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request.query as any).userId;

    const variant = abTesting.getVariant(id, userId);
    return reply.send({ variant });
  });

  fastify.post('/results', async (request, reply) => {
    const { experimentId, variantId, metrics } = request.body as any;
    abTesting.recordResult(experimentId, variantId, metrics);
    return reply.send({ success: true });
  });
}
