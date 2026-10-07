import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { federation } from '@quant/agentic';

const registerSchema = z.object({
  id: z.string(),
  endpoint: z.string().url(),
  capabilities: z.array(z.string()),
  trustLevel: z.number().min(0).max(1),
});

export default async function federationRoutes(fastify: FastifyInstance) {
  fastify.post('/register', async (request, reply) => {
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    federation.registerFederatedAgent(parseResult.data);
    return reply.send({ success: true });
  });

  fastify.post('/call/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { input } = request.body as any;

    try {
      const result = await federation.callFederatedAgent(id, input);
      return reply.send(result);
    } catch (error: any) {
      throw createAppError(error.message, 500, 'FEDERATION_ERROR');
    }
  });

  fastify.get('/', async (request, reply) => {
    const agents = federation.getFederatedAgents();
    return reply.send(agents);
  });
}
