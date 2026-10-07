import type { FastifyInstance } from 'fastify';
import { versioning } from '@quant/agentic';

export default async function versioningRoutes(fastify: FastifyInstance) {
  fastify.get('/agents/:id/versions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const versions = versioning.getAgentVersions(id);

    if (!versions) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    return reply.send(versions);
  });

  fastify.get('/agents/:id/latest', async (request, reply) => {
    const { id } = request.params as { id: string };
    const version = versioning.getLatestVersion(id);

    if (!version) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    return reply.send({ version });
  });
}
