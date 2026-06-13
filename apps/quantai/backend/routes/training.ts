import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { training } from '@quant/agentic';

const trainingSchema = z.object({
  agentId: z.string(),
  examples: z.array(
    z.object({
      input: z.string(),
      expectedOutput: z.string(),
    }),
  ),
});

export default async function trainingRoutes(fastify: FastifyInstance) {
  fastify.post('/', async (request, reply) => {
    const parseResult = trainingSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    try {
      const session = await training.startTraining(
        parseResult.data.agentId,
        parseResult.data.examples.map((e) => ({
          ...e,
          agentId: parseResult.data.agentId,
        })),
      );
      return reply.send(session);
    } catch (error: any) {
      throw createAppError(error.message, 500, 'TRAINING_ERROR');
    }
  });

  fastify.get('/sessions/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const sessions = training.getAgentSessions(agentId);
    return reply.send(sessions);
  });
}
