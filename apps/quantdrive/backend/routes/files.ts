import type { FastifyInstance } from 'fastify';

export default async function filesRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    return { status: 'ok', route: 'files' };
  });
}
