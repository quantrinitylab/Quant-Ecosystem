// ============================================================================
// QuantAI backend — production server entry.
// buildApp() (in app.ts) only assembles the Fastify instance; this entry starts
// it listening. Runs as its own container; the frontend proxies /api -> here.
// ============================================================================
import { buildApp, getConfig } from './app.js';

async function main(): Promise<void> {
  const config = getConfig();
  const app = await buildApp(config);

  await app.listen({ port: config.port, host: config.host });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('quantai backend failed to start', err);
  process.exit(1);
});
