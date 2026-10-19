// ============================================================================
// QuantMail backend — production server entry.
// buildApp() (in app.ts) only assembles the Fastify instance; this entry starts
// it listening. Runs as its own container; the frontend proxies /api -> here.
// ============================================================================
import { buildApp, getConfig } from './app.js';
import { buildWorker } from './worker.js';
import {
  startStuckSendReconciler,
  type StuckSendPrisma,
} from './services/stuck-send-reconciler.service.js';

async function main(): Promise<void> {
  const config = getConfig();
  const app = await buildApp(config);
  const deliveryWorker = buildWorker();

  // fix/qm-stuck-send-reconciler: the API process is the one that flips sends,
  // so it also runs the recovery sweep (restart-before-enqueue recovery +
  // periodic). Safe to run alongside worker.ts's instance — idempotent.
  const prisma = (app as unknown as { prisma?: unknown }).prisma;
  const stopReconciler = prisma
    ? startStuckSendReconciler(prisma as unknown as StuckSendPrisma, {
        intervalMs: Number(process.env['STUCK_SEND_RECONCILE_INTERVAL_MS'] ?? 300_000),
      })
    : null;

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
      if (stopReconciler) await stopReconciler();
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
