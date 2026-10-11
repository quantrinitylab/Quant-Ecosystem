// ============================================================================
// QuantAI — AgentLabs Voice Flows Fastify Routes
// ============================================================================

import type { FastifyInstance } from 'fastify';
import {
  validateVoiceFlowGraph,
  simulateFlowStep,
  VoiceFlowGraph,
} from '../services/voice-flow.service';

export default async function voiceFlowsRoutes(fastify: FastifyInstance) {
  // Local graph validation/simulation carries no provider cost, but the
  // endpoints are still gated: anonymous callers get a fail-closed 401 and
  // the guard is declared here (not just inherited from createApp's global
  // hook) so it survives standalone mounts.
  const authed = { preHandler: fastify.requireAuth() };

  fastify.post('/validate', authed, async (request, reply) => {
    try {
      const { graph } = request.body as { graph: VoiceFlowGraph };
      if (!graph) {
        return reply.status(400).send({
          success: false,
          error: 'Missing graph payload in request body',
        });
      }

      const result = validateVoiceFlowGraph(graph);
      return reply.send({
        success: true,
        ...result,
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message || 'Internal server error during graph validation',
      });
    }
  });

  fastify.post('/simulate', authed, async (request, reply) => {
    try {
      const { graph, currentNodeId, userInput } = request.body as {
        graph: VoiceFlowGraph;
        currentNodeId: string;
        userInput?: string;
      };

      if (!graph || !currentNodeId) {
        return reply.status(400).send({
          success: false,
          error: 'Missing graph or currentNodeId in request body',
        });
      }

      const result = simulateFlowStep(graph, currentNodeId, userInput);
      return reply.send({
        success: true,
        ...result,
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: error.message || 'Internal server error during flow simulation',
      });
    }
  });
}
