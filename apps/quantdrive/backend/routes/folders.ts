import type { FastifyInstance } from 'fastify';

export default async function foldersRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    return { status: 'ok', route: 'folders' };
  });
}
