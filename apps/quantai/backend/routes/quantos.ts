import type { FastifyInstance } from 'fastify';
import { orchestrator } from '@quant/agentic';

export default async function quantosRoutes(fastify: FastifyInstance) {
  // Get all available agents
  fastify.get('/agents', async (request, reply) => {
    const agents = orchestrator.getActiveAgents();

    return reply.send({
      agents: agents.map((id) => ({
        id,
        status: 'active',
        capabilities: getAgentCapabilities(id),
      })),
      total: agents.length,
    });
  });

  // Get system status
  fastify.get('/status', async (request, reply) => {
    return reply.send({
      status: 'healthy',
      agents: orchestrator.getActiveAgents().length,
      timestamp: new Date(),
      version: '2.0.0-agentic',
    });
  });
}

function getAgentCapabilities(agentId: string): string[] {
  const capabilities: Record<string, string[]> = {
    'quantmail-agent': ['email', 'calendar', 'contacts'],
    'quantchat-agent': ['messaging', 'groups', 'presence'],
    'quantai-agent': ['reasoning', 'tools', 'multi-model'],
    'quantdrive-agent': ['files', 'storage', 'sharing'],
    'quantmeet-agent': ['video', 'rooms', 'recordings'],
    'quantsync-agent': ['social', 'feed', 'communities'],
  };

  return capabilities[agentId] || ['general'];
}
