import type { FastifyInstance } from 'fastify';
import { agentLogger } from '@quant/agentic';

export default async function agentLogsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const { agentId, level, limit } = request.query as any;
    const logs = agentLogger.getLogs(agentId, level, limit ? parseInt(limit) : 100);
    return reply.send(logs);
  });

  fastify.delete('/', async (request, reply) => {
    const { agentId } = request.query as any;
    agentLogger.clearLogs(agentId);
    return reply.send({ success: true });
  });
}
