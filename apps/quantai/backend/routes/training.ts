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

// TODO(UNVERIFIED): injectable agent-ownership seam. Merge-time wiring must
// decorate 'agentOwnership' with the real @quant/agentic agent-owner lookup:
//   fastify.decorate('agentOwnership', { assertAgentOwnership })
// Contract: assertAgentOwnership(agentId, userId) resolves silently when userId
// owns agentId; throws createAppError('Forbidden', 403, 'AGENT_FORBIDDEN') on
// mismatch; throws on lookup errors. Default (unwired) fails closed with
// createAppError('Ownership check unavailable', 503, 'OWNERSHIP_CHECK_UNAVAILABLE').
export interface AgentOwnershipPort {
  assertAgentOwnership(agentId: string, userId: string): Promise<void>;
}

function getAgentOwnershipPort(fastify: FastifyInstance): AgentOwnershipPort {
  if (!fastify.hasDecorator('agentOwnership')) {
    fastify.decorate('agentOwnership', {
      async assertAgentOwnership() {
        throw createAppError(
          'Ownership check unavailable',
          503,
          'OWNERSHIP_CHECK_UNAVAILABLE',
        );
      },
    } satisfies AgentOwnershipPort);
  }
  return (fastify as unknown as { agentOwnership: AgentOwnershipPort }).agentOwnership;
}

export default async function trainingRoutes(fastify: FastifyInstance) {
  const ownership = getAgentOwnershipPort(fastify);

  fastify.post('/', async (request, reply) => {
    const parseResult = trainingSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    // Ownership gate runs BEFORE the try/catch so a 403/503 denial is never
    // swallowed into a generic 500 TRAINING_ERROR.
    await ownership.assertAgentOwnership(parseResult.data.agentId, userId);

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
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { agentId } = request.params as { agentId: string };
    await ownership.assertAgentOwnership(agentId, userId);

    const sessions = training.getAgentSessions(agentId);
    return reply.send(sessions);
  });
}
