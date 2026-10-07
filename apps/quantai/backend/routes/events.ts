import type { FastifyInstance } from 'fastify';
import { createAppError } from '@quant/server-core';
import { eventPipeline } from '@quant/events';

export default async function eventsRoutes(fastify: FastifyInstance) {
  fastify.post('/publish', async (request, reply) => {
    const event = request.body as any;

    try {
      const eventId = await eventPipeline.publish(event);
      return reply.send({ eventId });
    } catch (error: any) {
      throw createAppError(error.message, 500, 'EVENT_ERROR');
    }
  });

  fastify.get('/stats', async (request, reply) => {
    const stats = eventPipeline.getStats();
    return reply.send(stats);
  });

  fastify.get('/dead-letter', async (request, reply) => {
    const queue = eventPipeline.getDeadLetterQueue();
    return reply.send(queue);
  });
}
