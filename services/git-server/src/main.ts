import Fastify from 'fastify';
import gitHttpRoutes from './routes/git-http.js';
import apiRoutes from './routes/api.js';

export async function buildGitServer(options?: { port?: number; host?: string }) {
  const app = Fastify({ logger: process.env['NODE_ENV'] !== 'test' });

  await app.register(gitHttpRoutes, { prefix: '/git' });
  await app.register(apiRoutes, { prefix: '/api' });

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
  });
}
