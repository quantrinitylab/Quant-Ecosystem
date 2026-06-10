import type { FastifyInstance } from 'fastify';

export default async function statusRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    return reply.send({
      status: 'operational',
      services: {
        quantmail: 'operational',
        quantchat: 'operational',
        quantai: 'operational',
        quantdrive: 'operational',
        quantmeet: 'operational',
        quantsync: 'operational',
        quanttube: 'operational',
        quantmax: 'operational',
        quantdocs: 'operational',
        quantads: 'operational',
        quantcalendar: 'operational',
        quantneon: 'operational',
        quantedits: 'operational',
      },
      lastUpdated: new Date(),
    });
  });

  fastify.get('/incidents', async (request, reply) => {
    return reply.send([]);
  });
}
