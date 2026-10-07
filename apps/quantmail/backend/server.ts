// ============================================================================
// QuantMail backend — production server entry.
// buildApp() (in app.ts) only assembles the Fastify instance; this entry starts
// it listening. Runs as its own container; the frontend proxies /api -> here.
// ============================================================================
import { buildApp, getConfig } from './app.js';
import { buildWorker } from './worker.js';

async function main(): Promise<void> {
  const config = getConfig();
  const app = await buildApp(config);
  const deliveryWorker = buildWorker();

  await app.listen({ port: config.port, host: config.host });
  app.log.info('outbound delivery worker started');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');

    try {
      // Stop queue consumption before closing the app and its shared database
      // resources so in-flight delivery state is persisted safely.
      await deliveryWorker.close();
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error, signal }, 'shutdown failed');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('quantmail backend failed to start', err);
  process.exit(1);
});
