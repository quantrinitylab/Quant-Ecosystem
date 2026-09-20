/**
 * Production entrypoint for the QuantAds Fastify backend.
 *
 * `buildApp()` (in ./app) wires every route and plugin but intentionally does
 * not bind a socket, so this thin bootstrap owns the process lifecycle: read
 * config, build the app, and start listening on the configured host/port.
 *
 * Graceful shutdown (SIGTERM/SIGINT draining) is handled by the
 * `gracefulShutdown` plugin registered inside `createApp()`, so this file only
 * needs to start the listener and fail fast if binding the port errors.
 *
 * Without this file the app shipped a frontend whose `app/api/**` route
 * handlers all proxy to `QUANTADS_BACKEND_URL`, with nothing listening on the
 * other end: every data route answered 500/502 in staging while `/api/health`
 * (served by Next itself) stayed green.
 */
import { buildApp, getConfig } from './app';

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'test') {
    throw new Error('FATAL: QuantAds server cannot boot with NODE_ENV=test in standalone process');
  }
  const config = getConfig();
  const app = await buildApp(config);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info({ port: config.port, host: config.host }, 'QuantAds backend listening');
  } catch (err) {
    app.log.error({ err }, 'Failed to start QuantAds backend');
    process.exit(1);
  }
}

void main();
