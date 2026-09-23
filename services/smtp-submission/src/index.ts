// ============================================================================
// SMTP Submission Daemon - Entrypoint
// ============================================================================

import { SmtpSubmissionServer } from './server';
import { SmtpAuthService } from './auth';
import { OutboundSubmissionQueue } from './queue';

export * from './server';
export * from './auth';
export * from './envelope';
export * from './queue';
export * from './tls';

async function bootstrap(): Promise<void> {
  const authService = new SmtpAuthService();
  const queue = new OutboundSubmissionQueue();

  const server = new SmtpSubmissionServer({
    authService,
    queue,
  });

  const { submissionPort, smtpsPort } = await server.start();
  console.log(
    `[quant-smtp-submission] Daemon active: Port ${submissionPort} (STARTTLS) and Port ${smtpsPort} (SMTPS)`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[quant-smtp-submission] Received ${signal}, shutting down...`);
    try {
      await server.stop();
      console.log('[quant-smtp-submission] Server stopped gracefully.');
      process.exit(0);
    } catch (err) {
      console.error('[quant-smtp-submission] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  bootstrap().catch((err) => {
    console.error('[quant-smtp-submission] Fatal boot error:', err);
    process.exit(1);
  });
}
