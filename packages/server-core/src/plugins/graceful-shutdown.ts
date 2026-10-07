import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface GracefulShutdownOptions {
  timeoutMs?: number;
}

async function gracefulShutdownPlugin(fastify: FastifyInstance, opts: GracefulShutdownOptions) {
  const timeout = opts.timeoutMs ?? 30000;
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    fastify.log.info({ signal }, 'Received shutdown signal, draining connections...');

    const forceTimer = setTimeout(() => {
      fastify.log.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, timeout);
    forceTimer.unref();

    try {
      await fastify.close();
      fastify.log.info('Server closed gracefully');
      clearTimeout(forceTimer);
      process.exit(0);
    } catch (err) {
      fastify.log.error({ err }, 'Error during graceful shutdown');
      clearTimeout(forceTimer);
      process.exit(1);
    }
  };

  fastify.addHook('onRequest', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (isShuttingDown) {
      return reply.status(503).send({ error: 'Service shutting down' });
    }
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default fp(gracefulShutdownPlugin, {
  name: 'graceful-shutdown',
});
