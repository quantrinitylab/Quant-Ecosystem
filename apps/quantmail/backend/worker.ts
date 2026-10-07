// ============================================================================
// QuantMail — outbound delivery worker entrypoint
// ============================================================================
//
// Standalone process that CONSUMES the durable `outbound-delivery` BullMQ queue
// produced by OutboundDeliveryPipeline.enqueueSend (the API process only
// enqueues; this worker performs the actual send). For each job it DKIM-signs
// the message, resolves the recipient's MX, transmits over SMTP, and records a
// per-recipient DeliveryAttempt.
//
// Run with: `pnpm --filter @quant/quantmail worker`
// Requires: REDIS_HOST/REDIS_PORT (queue), DATABASE_URL (Prisma), and a
// provisioned DomainAuthKey per sending domain (see DeliverabilityAuthService.
// provisionDomainKey). Without DKIM keys, sends fail closed (deferred), never
// transmitting unsigned mail.

import { prisma } from '@quant/database';
import { DeliverabilityAuthService } from './services/deliverability-auth.service';
import {
  createDeliveryWorker,
  DnsMxResolver,
  NetSmtpTransport,
} from './services/delivery-worker.service';
import { resolveRedisConnection } from './services/outbound-delivery.service';

function buildWorker(): ReturnType<typeof createDeliveryWorker> {
  // The generated @quant/database client and the backend's structural Prisma
  // view are the same runtime object; the cast bridges the two type surfaces.
  const db = prisma as unknown as Parameters<typeof createDeliveryWorker>[0];
  const auth = new DeliverabilityAuthService(db);

  return createDeliveryWorker(
    db,
    auth,
    {
      smtp: new NetSmtpTransport(),
      mx: new DnsMxResolver(),
      senderDomain: process.env['MAIL_SENDER_DOMAIN'] ?? 'quantmail.app',
    },
    {
      connection: resolveRedisConnection(),
      concurrency: Number(process.env['DELIVERY_WORKER_CONCURRENCY'] ?? 8),
    },
  );
}

async function main(): Promise<void> {
  const worker = buildWorker();

  // eslint-disable-next-line no-console
  console.log('[quantmail:worker] outbound-delivery worker started');

  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`[quantmail:worker] received ${signal}, draining...`);
    await worker.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Only auto-start when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith('worker.ts')) {
  void main();
}

export { buildWorker };
