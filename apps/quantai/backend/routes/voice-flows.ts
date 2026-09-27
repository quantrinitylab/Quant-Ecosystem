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
  fastify.post('/validate', async (request, reply) => {
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

  fastify.post('/simulate', async (request, reply) => {
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
