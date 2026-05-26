import type { FastifyInstance } from 'fastify';

export default async function sharingRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    return { status: 'ok', route: 'sharing' };
  });
}
