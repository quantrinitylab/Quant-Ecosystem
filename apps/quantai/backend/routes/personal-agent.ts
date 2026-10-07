import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { PersonalAgent } from '@quant/agentic';

const personalAgentSchema = z.object({
  input: z.string().min(1),
});

const userAgents: Map<string, PersonalAgent> = new Map();

export default async function personalAgentRoutes(fastify: FastifyInstance) {
  fastify.post('/personal-agent', async (request, reply) => {
    const parseResult = personalAgentSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    // Get or create personal agent for user
    if (!userAgents.has(userId)) {
      const userName = 'User'; // TODO: Get from user profile
      userAgents.set(userId, new PersonalAgent(userId, userName));
    }

    const agent = userAgents.get(userId)!;

    try {
      const result = await agent.run(parseResult.data.input);
      return reply.send({ success: true, result });
    } catch (error: any) {
      throw createAppError(error.message, 500, 'AGENT_ERROR');
    }
  });

  fastify.get('/personal-agent/context', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const agent = userAgents.get(userId);
    if (!agent) {
      return reply.send({ context: [], message: 'No personal agent initialized yet' });
    }

    const context = await agent.getUserContext();
    return reply.send({ context });
  });
}
