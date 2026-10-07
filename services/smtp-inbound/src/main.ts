// ============================================================================
// SMTP Inbound Service - Runnable entrypoint
// ============================================================================
//
// Boots the inbound-mail ingestion service:
//   1. An HTTP health server (/healthz, /readyz) for k8s liveness/readiness.
//   2. The SMTP server that accepts inbound mail and forwards each message to
//      the configured ingestion webhook (fail-closed via createIngestionHandler).
//
// Config (env):
//   SMTP_INBOUND_PORT   SMTP listen port           (default 2525)
//   SMTP_INBOUND_HOST   SMTP bind host             (default 0.0.0.0)
//   SMTP_MAX_SIZE       max message bytes          (default 10 MiB)
//   HEALTH_PORT         HTTP health port           (default 3025)
//   INBOUND_WEBHOOK_URL ingestion target (required to accept mail; fail-closed)
//   INBOUND_WEBHOOK_TOKEN optional bearer token for the ingestion webhook

import pino from 'pino';
import { startHealthServer } from '@quant/health-server';
import { SmtpInboundServer, SmtpConfigSchema } from './smtp-server.js';
import { createIngestionHandler } from './ingestion-handler.js';

export interface ServiceConfig {
  smtpPort: number;
  smtpHost: string;
  maxMessageSize: number;
  healthPort: number;
  webhookUrl: string | undefined;
  webhookToken: string | undefined;
}

/** Resolve service configuration from an environment bag. */
export function loadServiceConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  return {
    smtpPort: Number(env['SMTP_INBOUND_PORT'] ?? 2525),
    smtpHost: env['SMTP_INBOUND_HOST'] ?? '0.0.0.0',
    maxMessageSize: Number(env['SMTP_MAX_SIZE'] ?? 10 * 1024 * 1024),
    healthPort: Number(env['HEALTH_PORT'] ?? 3025),
    webhookUrl: env['INBOUND_WEBHOOK_URL'],
    webhookToken: env['INBOUND_WEBHOOK_TOKEN'],
  };
}

export async function startService(config: ServiceConfig): Promise<{ stop: () => Promise<void> }> {
  const logger = pino({ name: 'smtp-inbound' });

  if (!config.webhookUrl) {
    logger.error(
      {},
      'INBOUND_WEBHOOK_URL is not set — the service will reject all mail (fail-closed) until configured',
    );
  }

  const smtp = new SmtpInboundServer(
    SmtpConfigSchema.parse({
      port: config.smtpPort,
      host: config.smtpHost,
      maxMessageSize: config.maxMessageSize,
    }),
  );
  smtp.onMessage(
    createIngestionHandler({
      webhookUrl: config.webhookUrl,
      authToken: config.webhookToken,
      logger,
    }),
  );

  const health = await startHealthServer(config.healthPort, {
    // Ready only when a durable ingestion target is configured.
    ingestion: async () => Boolean(config.webhookUrl),
  });
  await smtp.start();
  logger.info(
    { smtpPort: config.smtpPort, healthPort: config.healthPort },
    'smtp-inbound service started',
  );

  return {
    stop: async () => {
      await smtp.stop();
      await health.close();
    },
  };
}

// Run only when executed directly (not when imported by tests).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const config = loadServiceConfig();
  startService(config)
    .then(({ stop }) => {
      const shutdown = (signal: string) => {
        void stop().then(() => process.exit(0));
        // Safety net: force-exit if graceful close hangs.
        setTimeout(() => process.exit(1), 10_000).unref();
        void signal;
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('smtp-inbound failed to start', err);
      process.exit(1);
    });
}
