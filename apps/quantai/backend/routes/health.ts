import type { FastifyInstance } from 'fastify';
import { orchestrator } from '@quant/agentic';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    const agents = orchestrator.getActiveAgents();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0-agentic',
      agents: {
        count: agents.length,
        active: agents,
      },
      features: [
        'personal_agents',
        'unified_memory',
        'autonomous_workflows',
        'cross_app_coordination',
        'agent_communication',
      ],
    };
  });

  fastify.get('/ready', async (request, reply) => {
    // Check if all critical agents are registered
    const requiredAgents = ['quantmail-agent', 'quantchat-agent', 'quantai-agent'];

    const activeAgents = orchestrator.getActiveAgents();
    const missing = requiredAgents.filter((a) => !activeAgents.includes(a));

    if (missing.length > 0) {
      return reply.code(503).send({
        ready: false,
        missing,
      });
    }

    return { ready: true };
  });
}
