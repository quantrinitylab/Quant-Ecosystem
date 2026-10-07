import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { mlPipeline } from '@quant/ml';

export default async function mlRoutes(fastify: FastifyInstance) {
  fastify.get('/models', async (request, reply) => {
    const models = mlPipeline.listModels();
    return reply.send(models);
  });

  fastify.post('/train', async (request, reply) => {
    const { modelName, dataset } = request.body as any;

    try {
      const job = await mlPipeline.startTraining(modelName, dataset);
      return reply.send(job);
    } catch (error: any) {
      throw createAppError(error.message, 500, 'ML_ERROR');
    }
  });

  fastify.get('/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = mlPipeline.getJob(id);

    if (!job) {
      return reply.code(404).send({ error: 'Job not found' });
    }

    return reply.send(job);
  });
}
