import type { FastifyInstance } from 'fastify';

export default async function aiRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    return { status: 'ok', route: 'ai' };
  });
}
