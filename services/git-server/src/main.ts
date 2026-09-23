import Fastify from 'fastify';
import gitHttpRoutes from './routes/git-http.js';
import apiRoutes from './routes/api.js';
import lfsRoutes from './routes/lfs.js';

export async function buildGitServer(_options?: { port?: number; host?: string }) {
  const app = Fastify({ logger: process.env['NODE_ENV'] !== 'test' });

  app.get('/healthz', async (_request, reply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  app.get('/readyz', async (_request, reply) => {
    return reply.status(200).send({ status: 'ready' });
  });

  await app.register(gitHttpRoutes, { prefix: '/git' });
  await app.register(apiRoutes, { prefix: '/api' });
  await app.register(lfsRoutes, { prefix: '/git' });
  await app.register(lfsRoutes);

  return app;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const port = Number(process.env['PORT'] ?? 3020);
  const host = process.env['HOST'] ?? '0.0.0.0';
  buildGitServer({ port, host }).then((app) => {
    app.listen({ port, host }, (err) => {
      if (err) {
        app.log.error(err);
        process.exit(1);
      }
    });

    const shutdown = async (signal: string) => {
      app.log.info({ signal }, 'Received shutdown signal, closing gracefully');
      await app.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  });
}
